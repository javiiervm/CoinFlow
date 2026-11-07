-- CoinFlow 2.0: audited, atomic money movements.
-- Apply AFTER 202611070001_init.sql and 202611070002_legacy_import.sql.
-- RPC calls execute in one PostgreSQL transaction with per-account serialization.
-- No monetary balance is supplied by or trusted from the browser.

create table public.financial_operations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('allocate','external_topup','withdraw','spend','exchange')),
  bank_id uuid,
  amount numeric(16,2) not null check (amount > 0),
  currency text not null check (currency in ('EUR','USD')),
  target_currency text check (target_currency is null or target_currency in ('EUR','USD')),
  target_amount numeric(16,2) check (target_amount is null or target_amount > 0),
  note text not null default '' check (char_length(note) <= 120),
  occurred_on date not null,
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id,id),
  constraint financial_operation_owned_bank
    foreign key (user_id,bank_id) references public.piggybanks(user_id,id) on delete restrict
);

create index financial_ops_user_date on public.financial_operations(user_id,occurred_on desc);

alter table public.financial_operations enable row level security;
create policy "Read own financial operations" on public.financial_operations
  for select to authenticated using ((select auth.uid())=user_id);
create policy "Create own financial operations" on public.financial_operations
  for insert to authenticated with check ((select auth.uid())=user_id);

grant select, insert on public.financial_operations to authenticated;

alter table public.transactions
  add column if not exists operation_id uuid,
  add column if not exists operation_kind text check
    (operation_kind is null or operation_kind in ('allocate','external_topup','withdraw','spend','exchange')),
  add constraint transaction_owned_operation
    foreign key (user_id,operation_id)
    references public.financial_operations(user_id,id) on delete restrict,
  add constraint transaction_operation_pair
    check ((operation_id is null) = (operation_kind is null));

create index if not exists transactions_operation_id_idx on public.transactions(operation_id)
  where operation_id is not null;

-- Paired ledger rows must not be individually modified or deleted.
drop policy if exists "Users edit their transactions" on public.transactions;
create policy "Users edit manual transactions" on public.transactions
  for update to authenticated
  using ((select auth.uid())=user_id and operation_id is null)
  with check ((select auth.uid())=user_id and operation_id is null);

drop policy if exists "Users delete their transactions" on public.transactions;
create policy "Users delete manual transactions" on public.transactions
  for delete to authenticated
  using ((select auth.uid())=user_id and operation_id is null);

-- For now, keep piggybanks with a history: deleting them would change accounting.
-- (The financial_operations FK separately guards all banks involved in RPC calls.)
drop policy if exists "Users delete their piggybanks" on public.piggybanks;
create policy "Users delete empty piggybanks" on public.piggybanks
  for delete to authenticated
  using (
    (select auth.uid())=user_id and not exists (
      select 1 from public.transactions t
      where t.user_id=piggybanks.user_id and t.piggybank_id=piggybanks.id
    )
  );

-- Direct manual edits share the same per-account lock as the RPC and imports.
-- This prevents a concurrent direct insert/delete from racing the balance check.
create or replace function public.lock_account_ledger()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_owner uuid;
begin
  if TG_OP = 'DELETE' then
    v_owner := OLD.user_id;
  else
    v_owner := NEW.user_id;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_owner::text));
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create trigger account_ledger_write_lock
before insert or update or delete on public.transactions
for each row execute function public.lock_account_ledger();

create or replace function public.apply_financial_operation(
  p_request_id uuid,
  p_action text,
  p_amount numeric,
  p_bank_id uuid default null,
  p_currency text default null,
  p_target_currency text default null,
  p_target_amount numeric default null,
  p_note text default null,
  p_date date default current_date
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bank public.piggybanks%rowtype;
  v_currency text;
  v_balance numeric(16,2);
  v_available numeric(16,2);
  v_income numeric(16,2);
  v_expense numeric(16,2);
  v_overflow numeric(16,2);
  v_payload jsonb;
  v_old_payload jsonb;
  v_note text := trim(coalesce(p_note,''));
  v_category text := 'Transfer';
  v_title text;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='28000';
  end if;

  -- Serialize all RPC operations per user, including retries from other devices.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_user::text));

  if p_request_id is null or p_action not in
    ('allocate','external_topup','withdraw','spend','exchange')
    or p_action is null then
    raise exception 'invalid_operation' using errcode='22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 99999999999999.99
     or trunc(p_amount,2) <> p_amount then
    raise exception 'invalid_amount' using errcode='22023';
  end if;
  if char_length(v_note) > 120 or p_date is null then
    raise exception 'invalid_operation_details' using errcode='22023';
  end if;

  if p_action='exchange' then
    if p_bank_id is not null or p_currency is null or p_currency not in ('EUR','USD')
       or p_target_currency is null or p_target_currency not in ('EUR','USD')
       or p_currency=p_target_currency
       or p_target_amount is null or p_target_amount <= 0
       or p_target_amount > 99999999999999.99
       or trunc(p_target_amount,2) <> p_target_amount then
      raise exception 'invalid_exchange' using errcode='22023';
    end if;
    v_currency := p_currency;
  else
    if p_bank_id is null or p_target_currency is not null
       or p_target_amount is not null then
      raise exception 'invalid_bank_operation' using errcode='22023';
    end if;
    -- Lock the specific hucha to prevent changing its definition concurrently.
    select * into v_bank from public.piggybanks
      where id=p_bank_id and user_id=v_user for update;
    if not found then
      raise exception 'piggybank_not_found' using errcode='22023';
    end if;
    v_currency := v_bank.currency;
    if p_currency is not null and p_currency <> v_currency then
      raise exception 'currency_mismatch' using errcode='22023';
    end if;
    if p_action in ('withdraw','spend') and v_bank.type='expense' then
      raise exception 'expense_tracker_withdrawal_not_supported' using errcode='22023';
    end if;
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'action',p_action, 'amount',p_amount, 'bank_id',p_bank_id,
    'currency',v_currency, 'target_currency',p_target_currency,
    'target_amount',p_target_amount, 'note',v_note, 'date',p_date
  );

  select request_payload into v_old_payload
  from public.financial_operations
  where id=p_request_id and user_id=v_user;

  if found then
    if v_old_payload = v_payload then
      return pg_catalog.jsonb_build_object('status','already_applied','id',p_request_id);
    end if;
    raise exception 'idempotency_conflict' using errcode='23505';
  end if;

  if p_action in ('allocate','exchange') then
    -- Cash available in the global account, including the savings overflow
    -- semantics of CoinFlow 1.0. All arithmetic happens as NUMERIC in PG.
    select coalesce(sum(case when t.type='income' then t.amount else -t.amount end),0)
      into v_balance
    from public.transactions t
    where t.user_id=v_user and t.currency=v_currency
      and t.piggybank_id is null and not t.external;

    select coalesce(sum(greatest(0,
      coalesce((select sum(t.amount)
        from public.transactions t
        where t.user_id=v_user and t.piggybank_id=b.id and t.type='income'
          and t.currency=b.currency),0) - b.goal)),0)
      into v_overflow
    from public.piggybanks b
    where b.user_id=v_user and b.currency=v_currency and b.type='savings';

    if v_balance + v_overflow < p_amount then
      raise exception 'insufficient_global_balance' using errcode='22023';
    end if;
  end if;

  if p_action in ('withdraw','spend') then
    select coalesce(sum(t.amount) filter (where t.type='income'),0),
           coalesce(sum(t.amount) filter (where t.type='expense'),0)
    into v_income,v_expense
    from public.transactions t
    where t.user_id=v_user and t.piggybank_id=v_bank.id
      and t.currency=v_currency;
    v_available := case when v_bank.type='savings'
      then least(v_income,v_bank.goal) - v_expense
      else v_income - v_expense end;
    if v_available < p_amount then
      raise exception 'insufficient_piggybank_balance' using errcode='22023';
    end if;
  end if;

  insert into public.financial_operations
    (id,user_id,kind,bank_id,amount,currency,target_currency,
     target_amount,note,occurred_on,request_payload)
  values
    (p_request_id,v_user,p_action,p_bank_id,p_amount,v_currency,p_target_currency,
     p_target_amount,v_note,p_date,v_payload);

  if p_action='allocate' then
    v_title := 'Transfer to ' || v_bank.name;
    insert into public.transactions
      (user_id,concept,type,amount,currency,category,occurred_on,
       piggybank_id,external,operation_id,operation_kind)
    values
      (v_user,v_title,'expense',p_amount,v_currency,'Transfer',p_date,null,false,p_request_id,p_action),
      (v_user,'Deposit to '||v_bank.name,'income',p_amount,v_currency,'Transfer',p_date,v_bank.id,false,p_request_id,p_action);

  elsif p_action='external_topup' then
    insert into public.transactions
      (user_id,concept,type,amount,currency,category,occurred_on,
       piggybank_id,external,operation_id,operation_kind)
    values
      (v_user,coalesce(nullif(v_note,''),'External deposit to '||v_bank.name),
       'income',p_amount,v_currency,'Transfer',p_date,v_bank.id,true,p_request_id,p_action);

  elsif p_action='withdraw' then
    insert into public.transactions
      (user_id,concept,type,amount,currency,category,occurred_on,
       piggybank_id,external,operation_id,operation_kind)
    values
      (v_user,'Withdrawal from '||v_bank.name,'expense',p_amount,v_currency,'Transfer',p_date,v_bank.id,false,p_request_id,p_action),
      (v_user,coalesce(nullif(v_note,''),'Transfer from '||v_bank.name),'income',p_amount,v_currency,'Transfer',p_date,null,false,p_request_id,p_action);

  elsif p_action='spend' then
    insert into public.transactions
      (user_id,concept,type,amount,currency,category,occurred_on,
       piggybank_id,external,operation_id,operation_kind)
    values
      (v_user,coalesce(nullif(v_note,''),'Expense from '||v_bank.name),
       'expense',p_amount,v_currency,'General',p_date,v_bank.id,false,p_request_id,p_action);

  elsif p_action='exchange' then
    insert into public.transactions
      (user_id,concept,type,amount,currency,category,occurred_on,
       piggybank_id,external,operation_id,operation_kind)
    values
      (v_user,'Exchange to '||p_target_currency,'expense',p_amount,v_currency,'Exchange',p_date,null,false,p_request_id,p_action),
      (v_user,'Exchange from '||v_currency,'income',p_target_amount,p_target_currency,'Exchange',p_date,null,false,p_request_id,p_action);
  end if;

  return pg_catalog.jsonb_build_object('status','applied','id',p_request_id,'action',p_action);
end;
$$;

revoke all on function public.apply_financial_operation(
  uuid,text,numeric,uuid,text,text,numeric,text,date
) from public;
revoke all on function public.apply_financial_operation(
  uuid,text,numeric,uuid,text,text,numeric,text,date
) from anon;
grant execute on function public.apply_financial_operation(
  uuid,text,numeric,uuid,text,text,numeric,text,date
) to authenticated;
