-- Migration 078: Dynamic pricing rules for menu items
-- Allows owners to set different prices by day of week and/or time range
CREATE TABLE public.item_price_rules (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID        NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  store_id   UUID        NOT NULL,
  label      TEXT,
  price      NUMERIC(10,2) NOT NULL,
  days       INT[],        -- 0=Sun 1=Mon...6=Sat; NULL = every day
  time_from  TIME,         -- NULL = applies all day
  time_to    TIME,         -- NULL = applies all day
  priority   INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.item_price_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_rules_select"
  ON public.item_price_rules FOR SELECT USING (true);

CREATE POLICY "price_rules_insert"
  ON public.item_price_rules FOR INSERT
  WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

CREATE POLICY "price_rules_update"
  ON public.item_price_rules FOR UPDATE
  USING  (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

CREATE POLICY "price_rules_delete"
  ON public.item_price_rules FOR DELETE
  USING  (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

CREATE INDEX item_price_rules_item_id_idx ON public.item_price_rules(item_id);
CREATE INDEX item_price_rules_store_id_idx ON public.item_price_rules(store_id);

GRANT SELECT ON public.item_price_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.item_price_rules TO authenticated;
