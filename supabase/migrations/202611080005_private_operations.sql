-- Keep privileged bookkeeping code out of the Data API exposed schema.
-- Requires 001, 002, 003, 004.
-- The public RPC remains a SECURITY INVOKER facade; its implementation is
-- SECURITY DEFINER in an internal schema with explicit auth.uid() checks.
--
-- IMPORTANT: Do not add "coinflow_internal" to Supabase Data API exposed schemas.

create schema if not exists coinflow_internal;
revoke all on schema coinflow_internal from public, anon;
grant usage on schema coinflow_internal to authenticated;

alter function public.apply_financial_operation(
  uuid, text, numeric, uuid, text, text, numeric, text, date
) set schema coinflow_internal;

revoke all on function coinflow_internal.apply_financial_operation(
  uuid, text, numeric, uuid, text, text, numeric, text, date
) from public, anon;
grant execute on function coinflow_internal.apply_financial_operation(
  uuid, text, numeric, uuid, text, text, numeric, text, date
) to authenticated;

-- The public entry point has no elevated privileges. Supabase clients
-- may only access the privileged implementation through this facade.
create function public.apply_financial_operation(
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
language sql
security invoker
set search_path = ''
as $$
  select coinflow_internal.apply_financial_operation(
    p_request_id, p_action, p_amount, p_bank_id, p_currency,
    p_target_currency, p_target_amount, p_note, p_date
  );
$$;

revoke all on function public.apply_financial_operation(
  uuid, text, numeric, uuid, text, text, numeric, text, date
) from public, anon;
grant execute on function public.apply_financial_operation(
  uuid, text, numeric, uuid, text, text, numeric, text, date
) to authenticated;
