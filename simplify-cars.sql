-- Mavjud cars jadvalidan keraksiz 13 ustunni olib tashlaydi.
-- id, created_at va beshta avtomobil maydoni saqlanadi.
begin;
alter table public.cars
  drop column if exists color,
  drop column if exists mileage,
  drop column if exists fuel_type,
  drop column if exists transmission,
  drop column if exists engine_capacity,
  drop column if exists body_type,
  drop column if exists drive_type,
  drop column if exists doors,
  drop column if exists seats,
  drop column if exists country,
  drop column if exists city,
  drop column if exists description,
  drop column if exists image_url;
notify pgrst, 'reload schema';
commit;
