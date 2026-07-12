-- Migration 074: Add payment_status to rent_reservations
ALTER TABLE public.rent_reservations
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid'));
