-- Migration 059: promo_notifications — persistent storage for marketing pushes
-- send-promo-push inserts here; client reads on login to populate the bell
-- regardless of whether the user tapped the system notification.

CREATE TABLE public.promo_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id   uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);

CREATE INDEX promo_notifications_user_idx ON public.promo_notifications (user_id, read_at);

ALTER TABLE public.promo_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_notif_own ON public.promo_notifications
  USING (auth.uid() = user_id);
