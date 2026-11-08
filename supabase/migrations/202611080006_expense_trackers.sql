-- CoinFlow 2.0 parity with 1.0: expense trackers and safe debt repayments.
-- Tracker-linked expense rows created by the trusted RPC are locked from
-- individual edits/deletes; legacy imports remain readable and unchanged.
alter table public.transactions
  add column if not exists tracker_expense boolean not null default false;

drop policy if exists "Users add manual transactions" on public.transactions;
create policy "Users add manual transactions" on public.transactions
  for insert to authenticated with check (
    (select auth.uid())=user_id
    and operation_id is null and operation_kind is null
    and tracker_expense=false
  );

drop policy if exists "Users edit manual transactions" on public.transactions;
create policy "Users edit manual transactions" on public.transactions
  for update to authenticated
  using ((select auth.uid())=user_id and operation_id is null and tracker_expense=false)
  with check ((select auth.uid())=user_id and operation_id is null
              and operation_kind is null and tracker_expense=false);

drop policy if exists "Users delete manual transactions" on public.transactions;
create policy "Users delete manual transactions" on public.transactions
  for delete to authenticated
  using ((select auth.uid())=user_id and operation_id is null and tracker_expense=false);

create or replace function coinflow_internal.enforce_expense_tracker_limits()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_kind text;
  v_goal numeric;
  v_paid numeric;
begin
  if new.piggybank_id is null or new.legacy_import_id is not null then
    return new;
  end if;
  select b.type,b.goal into v_kind,v_goal
  from public.piggybanks b
  where b.id=new.piggybank_id and b.user_id=new.user_id;
  if v_kind='expense' then
    if new.type='expense' and not new.tracker_expense then
      raise exception 'tracker_expense_requires_atomic_rpc' using errcode='22023';
    end if;
    if new.type='income' then
      select coalesce(sum(t.amount),0) into v_paid
      from public.transactions t
      where t.user_id=new.user_id and t.piggybank_id=new.piggybank_id
        and t.type='income' and t.id <> new.id;
      if new.amount + v_paid > v_goal then
        raise exception 'expense_tracker_overpayment' using errcode='22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function coinflow_internal.enforce_expense_tracker_limits()
  from public, anon, authenticated;
drop trigger if exists enforce_expense_tracker_limits on public.transactions;
create trigger enforce_expense_tracker_limits
before insert or update of amount,type,piggybank_id on public.transactions
for each row execute function coinflow_internal.enforce_expense_tracker_limits();


-- Apply after migration 005. Existing rows and user balances are not modified.
-- The public API stays SECURITY INVOKER; privileged implementation stays private.

create or replace function coinflow_internal.apply_financial_operation(
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
security definer
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
    if v_bank.type='expense' and p_action in ('allocate','external_topup') then
      -- Expense trackers are a debt, not a regular savings account.
      -- The original goal stores total debt; income represents repayment.
      select coalesce(sum(t.amount),0) into v_income
      from public.transactions t
      where t.user_id=v_user and t.piggybank_id=v_bank.id
        and t.currency=v_currency and t.type='income';
      if v_bank.goal <= 0 or v_income >= v_bank.goal then
        raise exception 'expense_tracker_already_paid' using errcode='22023';
      end if;
      if p_amount > (v_bank.goal - v_income) then
        raise exception 'expense_tracker_overpayment' using errcode='22023';
      end if;
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

-- Create a new expense tracker AND its initial expense, or extend an existing
-- tracker with a new expense. A single RPC, one atomic transaction.
create or replace function coinflow_internal.record_expense_with_tracker(
  p_request_id uuid,
  p_concept text,
  p_amount numeric,
  p_currency text,
  p_occurred_on date,
  p_category text default 'General',
  p_new_name text default null,
  p_existing_bank_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bank_id uuid;
  v_bank public.piggybanks%rowtype;
  v_existing public.transactions%rowtype;
  v_name text := trim(coalesce(p_new_name, ''));
  v_concept text := trim(coalesce(p_concept, ''));
  v_category text := trim(coalesce(p_category, ''));
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_user::text));
  if p_request_id is null or p_amount is null or p_amount <= 0 or
     p_amount > 99999999999999.99 or trunc(p_amount,2) <> p_amount or
     p_currency not in ('EUR','USD') or p_currency is null or
     p_occurred_on is null or
     char_length(v_concept) not between 1 and 180 or
     char_length(v_category) not between 1 and 80 or
     ((nullif(v_name,'') is null) = (p_existing_bank_id is null)) or
     char_length(v_name) > 120 then
    raise exception 'invalid_tracker_expense' using errcode='22023';
  end if;

  select * into v_existing from public.transactions
  where id=p_request_id and user_id=v_user;
  if found then
    if v_existing.type='expense' and v_existing.amount=p_amount and
       v_existing.currency=p_currency and v_existing.concept=v_concept and
       v_existing.category=v_category and v_existing.occurred_on=p_occurred_on and
       v_existing.piggybank_id is not null then
      return pg_catalog.jsonb_build_object(
        'status','already_applied','bank_id',v_existing.piggybank_id);
    end if;
    raise exception 'idempotency_conflict' using errcode='23505';
  end if;

  if p_existing_bank_id is not null then
    select * into v_bank from public.piggybanks
    where id=p_existing_bank_id and user_id=v_user for update;
    if not found or v_bank.type <> 'expense' or v_bank.currency <> p_currency then
      raise exception 'invalid_tracker' using errcode='22023';
    end if;
    v_bank_id := v_bank.id;
    update public.piggybanks
    set goal=goal+p_amount
    where id=v_bank_id and user_id=v_user;
  else
    v_bank_id := pg_catalog.gen_random_uuid();
    insert into public.piggybanks
      (id,user_id,name,type,goal,currency)
    values
      (v_bank_id,v_user,v_name,'expense',p_amount,p_currency);
  end if;

  insert into public.transactions
    (id,user_id,concept,type,amount,currency,category,occurred_on,piggybank_id,external,tracker_expense)
  values
    (p_request_id,v_user,v_concept,'expense',p_amount,p_currency,v_category,p_occurred_on,v_bank_id,false,true);

  return pg_catalog.jsonb_build_object('status','applied','bank_id',v_bank_id);
end;
$$;

revoke all on function coinflow_internal.record_expense_with_tracker(
  uuid,text,numeric,text,date,text,text,uuid
) from public, anon;
grant execute on function coinflow_internal.record_expense_with_tracker(
  uuid,text,numeric,text,date,text,text,uuid
) to authenticated;

create or replace function public.record_expense_with_tracker(
  p_request_id uuid,
  p_concept text,
  p_amount numeric,
  p_currency text,
  p_occurred_on date,
  p_category text default 'General',
  p_new_name text default null,
  p_existing_bank_id uuid default null
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select coinflow_internal.record_expense_with_tracker(
    p_request_id,p_concept,p_amount,p_currency,p_occurred_on,
    p_category,p_new_name,p_existing_bank_id
  );
$$;

revoke all on function public.record_expense_with_tracker(
  uuid,text,numeric,text,date,text,text,uuid
) from public, anon;
grant execute on function public.record_expense_with_tracker(
  uuid,text,numeric,text,date,text,text,uuid
) to authenticated;
