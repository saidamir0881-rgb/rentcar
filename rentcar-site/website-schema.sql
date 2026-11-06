-- Supabase SQL Editor ichida bajaring. cars jadvali o'zgarmaydi.
begin;
create table if not exists public.userlar (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  email text not null unique,
  birth_date date not null check (birth_date >= date '1900-01-01' and birth_date <= (current_date - interval '18 years')::date),
  passport_number text not null unique check (passport_number ~ '^[A-Z]{2}[0-9]{7}$')
);
alter table public.userlar enable row level security;
revoke all on public.userlar from anon, authenticated;
grant select, insert, update, delete on public.userlar to service_role;
-- Profilga faqat server kiradi. Server foydalanuvchining tokenini tekshiradi.
notify pgrst, 'reload schema';
commit;

-- Admin yaratish: avval sayt orqali ro'yxatdan o'ting. Email tasdiqlash shart emas.
-- Quyidagi YOUR_EMAIL qiymatini o'z emailingizga almashtirib, alohida bajaring:
-- update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--   || '{"role":"admin"}'::jsonb where email = 'YOUR_EMAIL';
-- Keyin saytdan chiqib, qayta kiring. /admin sahifasini oching.
