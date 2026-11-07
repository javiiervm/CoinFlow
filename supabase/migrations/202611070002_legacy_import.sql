-- CoinFlow 1.0 data.json migration.
-- Run AFTER 202611070001_init.sql in Supabase SQL Editor.
-- Every import runs atomically under the authenticated user's RLS context.
-- Only actual 1.0 records are imported; original objects are retained in
-- legacy_record for lossless metadata (edited, exchange_ref, old names, etc.).

create table if not exists public.legacy_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_name text not null check (char_length(source_name) between 1 and 160),
  imported_at timestamptz not null default now(),
  transaction_count integer not null check (transaction_count >= 0),
  piggybank_count integer not null check (piggybank_count >= 0),
  unique (user_id, source_hash)
);

alter table public.legacy_imports enable row level security;
create policy "Read own legacy imports" on public.legacy_imports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own legacy imports" on public.legacy_imports
  for insert to authenticated with check ((select auth.uid()) = user_id);
grant select, insert on public.legacy_imports to authenticated;

alter table public.piggybanks
  add column if not exists legacy_import_id uuid references public.legacy_imports(id),
  add column if not exists legacy_id text,
  add column if not exists legacy_record jsonb;
alter table public.transactions
  add column if not exists legacy_import_id uuid references public.legacy_imports(id),
  add column if not exists legacy_id text,
  add column if not exists legacy_record jsonb;

create unique index if not exists piggybanks_legacy_owner_id
  on public.piggybanks (user_id, legacy_id) where legacy_id is not null;
create unique index if not exists transactions_legacy_owner_id
  on public.transactions (user_id, legacy_id) where legacy_id is not null;

-- Version 1.0 permits zero-amount transactions. Preserve them when migrating;
-- normal 2.0 entry forms still require an amount greater than zero.
alter table public.transactions drop constraint if exists transactions_amount_check;
alter table public.transactions add constraint transactions_amount_check check (amount >= 0);

create or replace function public.import_coinflow_v1(
  p_hash text,
  p_filename text,
  p_piggybanks jsonb,
  p_transactions jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_import uuid;
  v_bank jsonb;
  v_transaction jsonb;
  v_bank_id uuid;
  v_link_id uuid;
  v_legacy_id text;
  v_old_link text;
  v_bank_map jsonb := '{}'::jsonb;
begin
  if v_user is null then
    raise exception 'login_required' using errcode = '28000';
  end if;
  -- Serialize imports per user; racing tabs cannot import the same records.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_user::text));

  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
     or p_filename is null or char_length(p_filename) not between 1 and 160 then
    raise exception 'invalid_import_metadata' using errcode = '22023';
  end if;
  if jsonb_typeof(p_piggybanks) is distinct from 'array'
     or jsonb_typeof(p_transactions) is distinct from 'array' then
    raise exception 'invalid_import_arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(p_piggybanks) > 2000
     or jsonb_array_length(p_transactions) > 10000
     or jsonb_array_length(p_piggybanks) + jsonb_array_length(p_transactions) = 0
     or octet_length(p_piggybanks::text) + octet_length(p_transactions::text) > 15000000 then
    raise exception 'invalid_import_size' using errcode = '22023';
  end if;

  if exists (select 1 from public.legacy_imports
             where user_id = v_user and source_hash = p_hash) then
    return pg_catalog.jsonb_build_object('status', 'already_imported');
  end if;

  -- Reject overlapping backups, instead of counting existing transactions
  -- twice or unexpectedly replacing data already edited in CoinFlow 2.0.
  if exists (
    select 1 from public.piggybanks b
    join pg_catalog.jsonb_array_elements(p_piggybanks) incoming(entry)
      on b.legacy_id = incoming.entry->>'legacy_id'
    where b.user_id = v_user and b.legacy_id is not null
  ) or exists (
    select 1 from public.transactions t
    join pg_catalog.jsonb_array_elements(p_transactions) incoming(entry)
      on t.legacy_id = incoming.entry->>'legacy_id'
    where t.user_id = v_user and t.legacy_id is not null
  ) then
    raise exception 'overlapping_legacy_records' using errcode = '23505';
  end if;

  insert into public.legacy_imports
    (user_id, source_hash, source_name, transaction_count, piggybank_count)
  values
    (v_user, p_hash, p_filename,
     jsonb_array_length(p_transactions), jsonb_array_length(p_piggybanks))
  returning id into v_import;

  for v_bank in select value from pg_catalog.jsonb_array_elements(p_piggybanks)
  loop
    if jsonb_typeof(v_bank) <> 'object'
       or jsonb_typeof(v_bank->'legacy_record') <> 'object'
       or nullif(v_bank->>'legacy_id', '') is null
       or char_length(v_bank->>'legacy_id') > 160
       or nullif(v_bank->>'name', '') is null
       or v_bank->>'type' not in ('savings','budget','expense')
       or v_bank->>'currency' not in ('EUR','USD') then
      raise exception 'invalid_legacy_piggybank' using errcode = '22023';
    end if;

    v_bank_id := pg_catalog.gen_random_uuid();
    v_legacy_id := v_bank->>'legacy_id';
    insert into public.piggybanks
      (id, user_id, name, type, goal, currency, created_at,
       legacy_import_id, legacy_id, legacy_record)
    values
      (v_bank_id, v_user, v_bank->>'name', v_bank->>'type',
       (v_bank->>'goal')::numeric, v_bank->>'currency',
       coalesce(nullif(v_bank->>'timestamp', '')::timestamptz, now()),
       v_import, v_legacy_id, v_bank->'legacy_record');
    v_bank_map := pg_catalog.jsonb_set(v_bank_map, array[v_legacy_id], to_jsonb(v_bank_id::text), true);
  end loop;

  for v_transaction in select value from pg_catalog.jsonb_array_elements(p_transactions)
  loop
    if jsonb_typeof(v_transaction) <> 'object'
       or jsonb_typeof(v_transaction->'legacy_record') <> 'object'
       or nullif(v_transaction->>'legacy_id', '') is null
       or char_length(v_transaction->>'legacy_id') > 160
       or nullif(v_transaction->>'concept', '') is null
       or v_transaction->>'type' not in ('income','expense')
       or v_transaction->>'currency' not in ('EUR','USD')
       or jsonb_typeof(v_transaction->'external') <> 'boolean' then
      raise exception 'invalid_legacy_transaction' using errcode = '22023';
    end if;

    v_old_link := nullif(v_transaction->>'piggybank_legacy_id', '');
    v_link_id := null;
    if v_old_link is not null then
      if not (v_bank_map ? v_old_link) then
        raise exception 'unknown_legacy_piggybank_id' using errcode = '22023';
      end if;
      v_link_id := (v_bank_map->>v_old_link)::uuid;
    end if;

    insert into public.transactions
      (user_id, concept, type, amount, currency, category, occurred_on,
       piggybank_id, external, created_at,
       legacy_import_id, legacy_id, legacy_record)
    values
      (v_user, v_transaction->>'concept', v_transaction->>'type',
       (v_transaction->>'amount')::numeric, v_transaction->>'currency',
       coalesce(nullif(v_transaction->>'category', ''), 'General'),
       (v_transaction->>'occurred_on')::date, v_link_id,
       (v_transaction->>'external')::boolean,
       coalesce(nullif(v_transaction->>'timestamp','')::timestamptz, now()),
       v_import, v_transaction->>'legacy_id',
       v_transaction->'legacy_record');
  end loop;

  return pg_catalog.jsonb_build_object(
    'status','imported', 'id',v_import,
    'transactions', jsonb_array_length(p_transactions),
    'piggybanks', jsonb_array_length(p_piggybanks)
  );
end;
$$;

revoke all on function public.import_coinflow_v1(text, text, jsonb, jsonb) from public;
revoke all on function public.import_coinflow_v1(text, text, jsonb, jsonb) from anon;
grant execute on function public.import_coinflow_v1(text, text, jsonb, jsonb) to authenticated;
