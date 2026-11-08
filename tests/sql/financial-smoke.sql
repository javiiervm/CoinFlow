-- Exercise real PostgreSQL migration & RLS behavior (not mocks of the ledger).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='apply_financial_operation'
      AND p.prosecdef=false
  ) THEN
    RAISE EXCEPTION 'Public financial RPC is not SECURITY INVOKER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='coinflow_internal' AND p.proname='apply_financial_operation'
      AND p.prosecdef=true
  ) THEN
    RAISE EXCEPTION 'Internal privileged financial operation is missing';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piggybanks TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

INSERT INTO public.transactions (
  user_id, concept, type, amount, currency, category, occurred_on, external
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'Salary', 'income', 100, 'EUR', 'Work', current_date, false
);
INSERT INTO public.piggybanks (id, user_id, name, type, goal, currency) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Travel', 'savings', 100, 'EUR');

DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.apply_financial_operation(
    'aaaa0001-0000-4000-8000-000000000001','allocate',40,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','EUR'
  );
  IF r->>'status' <> 'applied' THEN RAISE EXCEPTION 'allocate failed: %', r; END IF;

  r := public.apply_financial_operation(
    'aaaa0001-0000-4000-8000-000000000001','allocate',40,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','EUR'
  );
  IF r->>'status' <> 'already_applied' THEN RAISE EXCEPTION 'idempotency failed: %', r; END IF;

  r := public.apply_financial_operation(
    'aaaa0002-0000-4000-8000-000000000002','external_topup',15,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','EUR'
  );
  r := public.apply_financial_operation(
    'aaaa0003-0000-4000-8000-000000000003','withdraw',20,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','EUR'
  );
  r := public.apply_financial_operation(
    'aaaa0004-0000-4000-8000-000000000004','spend',10,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','EUR'
  );
  r := public.apply_financial_operation(
    'aaaa0005-0000-4000-8000-000000000005','exchange',30,
    null,'EUR','USD',33
  );

  IF (SELECT count(*) FROM public.financial_operations) <> 5 THEN
    RAISE EXCEPTION 'Unexpected operation count';
  END IF;
  IF (SELECT count(*) FROM public.transactions) <> 9 THEN
    RAISE EXCEPTION 'Unexpected transaction count';
  END IF;

  IF (SELECT coalesce(sum(case when type='income' then amount else -amount end),0)
      FROM public.transactions WHERE currency='EUR' AND piggybank_id IS NULL AND not external) <> 50 THEN
    RAISE EXCEPTION 'Incorrect global EUR balance';
  END IF;
  IF (SELECT coalesce(sum(case when type='income' then amount else -amount end),0)
      FROM public.transactions WHERE currency='EUR' AND piggybank_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 25 THEN
    RAISE EXCEPTION 'Incorrect piggybank balance';
  END IF;
  IF (SELECT coalesce(sum(case when type='income' then amount else -amount end),0)
      FROM public.transactions WHERE currency='USD' AND piggybank_id IS NULL) <> 33 THEN
    RAISE EXCEPTION 'Incorrect USD balance';
  END IF;

  BEGIN
    PERFORM public.apply_financial_operation(
      'aaaa0006-0000-4000-8000-000000000006','allocate',1000,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','EUR'
    );
    RAISE EXCEPTION 'Accepted insufficient funds';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.apply_financial_operation(
      'aaaa0001-0000-4000-8000-000000000001','allocate',41,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','EUR'
    );
    RAISE EXCEPTION 'Accepted conflicting retry';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- An authenticated user must not be able to inject a fake transfer,
  -- either by manufacturing an operation or linking a manual entry to one.
  BEGIN
    INSERT INTO public.financial_operations
      (id,user_id,kind,bank_id,amount,currency,occurred_on,request_payload)
    VALUES
      ('aaaa0009-0000-4000-8000-000000000009',
       '11111111-1111-4111-8111-111111111111',
       'allocate','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       500,'EUR',current_date,'{}'::jsonb);
    RAISE EXCEPTION 'Allowed direct forged financial operation';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.transactions
      (user_id,concept,type,amount,currency,category,occurred_on,
       external,operation_id,operation_kind)
    VALUES
      ('11111111-1111-4111-8111-111111111111',
       'Forged transfer','income',999,'EUR','Transfer',current_date,
       false,'aaaa0001-0000-4000-8000-000000000001','allocate');
    RAISE EXCEPTION 'Allowed forged linked transaction';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.transactions
      WHERE operation_id='aaaa0001-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'Forged transaction changed transfer count';
  END IF;

  -- RLS protects one side of a multi-row operation against deletion.
  DELETE FROM public.transactions WHERE operation_id='aaaa0001-0000-4000-8000-000000000001';
  IF (SELECT count(*) FROM public.transactions
      WHERE operation_id='aaaa0001-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'RLS allowed deleting a half-transfer';
  END IF;
END $$;

-- Test importing a normalized 1.0 backup under a separate account.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
DO $$
DECLARE
  r jsonb;
  banks jsonb := '[{
    "legacy_id":"old-bank-12","name":"Trip","type":"savings","goal":100,
    "currency":"EUR","timestamp":"2026-11-01T12:00:00Z",
    "legacy_record":{"id":"old-bank-12","concept":"Trip","amount":100,"currency":"€"}
  }]'::jsonb;
  entries jsonb := '[{
    "legacy_id":"old-tx-01","concept":"Original saving","type":"income",
    "amount":25,"currency":"EUR","category":"General",
    "occurred_on":"2026-11-01","timestamp":"2026-11-01T12:00:00Z",
    "piggybank_legacy_id":"old-bank-12","external":false,
    "legacy_record":{"id":"old-tx-01","piggybank_id":"old-bank-12","amount":25}
  }]'::jsonb;
BEGIN
  r := public.import_coinflow_v1(repeat('a',64),'data.json',banks,entries);
  IF r->>'status' <> 'imported' THEN RAISE EXCEPTION 'Import failed: %',r; END IF;
  r := public.import_coinflow_v1(repeat('a',64),'data.json',banks,entries);
  IF r->>'status' <> 'already_imported' THEN RAISE EXCEPTION 'Import idempotency failed'; END IF;
  IF (SELECT count(*) FROM public.transactions t
      JOIN public.piggybanks b ON t.piggybank_id=b.id
      WHERE t.legacy_id='old-tx-01' AND b.legacy_id='old-bank-12') <> 1 THEN
    RAISE EXCEPTION 'Import did not preserve piggybank relationship';
  END IF;
  IF (SELECT count(*) FROM public.transactions WHERE user_id='11111111-1111-4111-8111-111111111111') <> 0 THEN
    RAISE EXCEPTION 'RLS leaked the first account transactions';
  END IF;
END $$;

RESET ROLE;
SELECT 'CoinFlow PostgreSQL smoke tests passed' AS result;
