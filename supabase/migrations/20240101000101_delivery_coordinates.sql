-- ============================================================
-- Store delivery pin coordinates alongside the text address
-- ============================================================
-- A courier's "Открыть в картах" link for the delivery address had to
-- geocode plain address text through Yandex Maps — reliable for well-formed
-- Cyrillic addresses, but some OSM-sourced address strings (reverse-geocoded
-- via Photon on the client's address picker) only have a Latin/transliterated
-- name tagged for that road, which Yandex's own geocoder then resolves to
-- the wrong place. Threading the customer's actual map-pin coordinates
-- through from checkout avoids any text geocoding for delivery routing.

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION;
