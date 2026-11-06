-- Supabase SQL Editor orqali bir marta bajaring. Mavjud jadval o'chirilmaydi.
begin;
create table public.cars (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  brand text not null check (length(trim(brand)) > 0),
  is_new boolean not null,
  price numeric not null check (price >= 0),
  year integer not null check (year >= 1886),
  model text not null check (length(trim(model)) > 0)
);
alter table public.cars enable row level security;
revoke all on public.cars from anon, authenticated;
grant select, insert, update, delete on public.cars to service_role;
grant usage, select on sequence public.cars_id_seq to service_role;
commit;

