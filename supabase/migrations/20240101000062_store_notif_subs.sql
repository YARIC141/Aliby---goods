-- store_notif_subs: per-user, per-store push notification preference
-- subscribed=true  → user explicitly subscribed (always receives promos)
-- subscribed=false → user opted out (excluded from all audiences for this store)
-- no row           → neutral (receives promos if matched by audience: orders / city)
CREATE TABLE public.store_notif_subs (
  user_id     UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  store_id    UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  subscribed  BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

ALTER TABLE public.store_notif_subs ENABLE ROW LEVEL SECURITY;

-- Users manage their own preferences
CREATE POLICY "sns_own" ON public.store_notif_subs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Store owners can read opt-outs for their own stores
CREATE POLICY "sns_owner_read" ON public.store_notif_subs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
  );

CREATE INDEX idx_sns_store ON public.store_notif_subs(store_id, subscribed);
