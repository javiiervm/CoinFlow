-- CoinFlow 2.0 development security hardening.
-- Requires migrations 001, 002, 003.
--
-- The client must NEVER be allowed to forge the linked rows created
-- by apply_financial_operation. Only manually entered transactions may
-- be inserted via PostgREST. Atomic ledger entries use an explicitly
-- authorized SECURITY DEFINER RPC that checks auth.uid() and ownership.
--
-- IMPORTANT: the RPC was reviewed for fully-qualified object references,
-- fixed search_path, authenticated-only EXECUTE, positive amounts,
-- ownership checks, idempotency, and per-user locking.

drop policy if exists "Users add their transactions" on public.transactions;
drop policy if exists "Users add manual transactions" on public.transactions;
create policy "Users add manual transactions" on public.transactions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and operation_id is null
    and operation_kind is null
  );

-- No direct writes to financial_operations, even for the owner.
drop policy if exists "Create own financial operations" on public.financial_operations;
revoke all on public.financial_operations from public, anon, authenticated;
grant select on public.financial_operations to authenticated;

-- Invoker privileges cannot write the restricted operation table, so the
-- tightly-scoped RPC performs those writes as its database owner.
-- All row ownership is enforced explicitly inside this function.
alter function public.apply_financial_operation(
  uuid, text, numeric, uuid, text, text, numeric, text, date
) security definer;
revoke all on function public.apply_financial_operation(
  uuid, text, numeric, uuid, text, text, numeric, text, date
) from public, anon;
grant execute on function public.apply_financial_operation(
  uuid, text, numeric, uuid, text, text, numeric, text, date
) to authenticated;

-- Support relational constraints without table scans as data grows.
create index if not exists financial_operations_user_bank_idx
  on public.financial_operations (user_id, bank_id)
  where bank_id is not null;
create index if not exists transactions_user_operation_idx
  on public.transactions (user_id, operation_id)
  where operation_id is not null;
create index if not exists piggybanks_legacy_import_idx
  on public.piggybanks (legacy_import_id)
  where legacy_import_id is not null;
create index if not exists transactions_legacy_import_idx
  on public.transactions (legacy_import_id)
  where legacy_import_id is not null;
