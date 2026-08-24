-- Migration 122: per-store toggle for unpaid booking/rental
--
-- Adds stores.allow_unpaid_booking. When true, the client shows the free
-- "Забронировать" button (hold a service booking or rental reservation with
-- payment_status='unpaid', pay later) alongside "Оплатить и записаться" /
-- "Оплатить". When false, only the paid path is offered.
--
-- Existing stores keep today's behavior (unpaid booking has always been
-- available) — backfilled to true. New stores default to false: an owner
-- opts in explicitly rather than silently exposing unpaid holds.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS allow_unpaid_booking BOOLEAN NOT NULL DEFAULT false;

UPDATE public.stores SET allow_unpaid_booking = true;
