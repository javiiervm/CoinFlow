-- CoinFlow 2.0 schema. Apply in Supabase SQL Editor before enabling real accounts.
-- All records are isolated by auth.uid() using RLS and owner-aware foreign keys.
create extension if not exists pgcrypto;

create table public.piggybanks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  type text not null check (type in ('savings', 'budget', 'expense')),
  goal numeric(16, 2) not null default 0 check (goal >= 0),
  currency text not null check (currency in ('EUR', 'USD')),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept text not null check (char_length(trim(concept)) between 1 and 180),
  type text not null check (type in ('income', 'expense')),
  amount numeric(16, 2) not null check (amount > 0),
  currency text not null check (currency in ('EUR', 'USD')),
  category text not null default 'General',
  occurred_on date not null default current_date,
  piggybank_id uuid,
  external boolean not null default false,
  created_at timestamptz not null default now(),
  constraint transaction_owned_piggybank
    foreign key (user_id, piggybank_id)
    references public.piggybanks (user_id, id) on delete set null (piggybank_id)
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_user_bank_idx on public.transactions (user_id, piggybank_id);
create index piggybanks_user_idx on public.piggybanks (user_id);

alter table public.piggybanks enable row level security;
alter table public.transactions enable row level security;

create policy "Users read their piggybanks" on public.piggybanks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their piggybanks" on public.piggybanks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users edit their piggybanks" on public.piggybanks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their piggybanks" on public.piggybanks
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users read their transactions" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their transactions" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users edit their transactions" on public.transactions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their transactions" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);
