-- Migration 083: Add image_url to subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS image_url TEXT;
