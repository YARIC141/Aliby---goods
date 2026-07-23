-- Stores the option-group selections (add-ons) chosen for each order line, e.g.
-- [{"group_id":"...","option_id":"...","name":"Доп. сыр","price_add":50}, ...].
-- Previously only the resulting price_at_time was kept, so admins/customers had no way
-- to see which specific add-ons were chosen once an order was placed.
ALTER TABLE public.order_items
  ADD COLUMN selected_options jsonb NOT NULL DEFAULT '[]'::jsonb;
