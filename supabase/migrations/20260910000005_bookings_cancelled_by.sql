-- Атрибуция отмены записи: кто отменил (клиент/мастер/админ), чтобы клиент видел,
-- что запись отменил не он сам, а мастер/администратор.
alter table public.bookings
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_by_role text check (cancelled_by_role in ('client','master','admin'));
