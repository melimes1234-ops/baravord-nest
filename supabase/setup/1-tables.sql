-- WPC cost estimation: Supabase schema.
-- Paste this whole file (schema + seed, see setup.sql) in Supabase > SQL Editor > Run.
-- All access goes through the functions below (RPC); tables are not readable or writable directly.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('admin', 'operator', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  version integer not null
);

create table if not exists public.movements (
  id text primary key,
  date date not null,
  material_id text not null,
  kg numeric not null check (kg <> 0),
  type text not null check (type in ('in', 'out', 'waste_in', 'adjust')),
  price_per_kg numeric check (price_per_kg is null or price_per_kg >= 0),
  ref text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists movements_material_idx on public.movements (material_id, date, created_at);

create table if not exists public.batches (
  id text primary key,
  date date not null,
  data jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  email text not null,
  action text not null,
  detail jsonb not null default '{}'
);

alter table public.profiles enable row level security;
alter table public.app_config enable row level security;
alter table public.movements enable row level security;
alter table public.batches enable row level security;
alter table public.audit enable row level security;
-- No policies on purpose: the API roles cannot touch the tables, only call the functions.
revoke all on public.profiles, public.app_config, public.movements, public.batches, public.audit from anon, authenticated;
revoke all on sequence public.audit_id_seq from anon, authenticated;

