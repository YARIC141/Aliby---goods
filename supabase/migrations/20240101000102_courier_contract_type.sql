-- ============================================================
-- Миграция 102: Добавление типа договора 'courier' в contract_signatures
-- Alliby Carry — публичная оферта для Курьера (site.alliby.ru/carry-terms)
-- ============================================================

ALTER TABLE public.contract_signatures DROP CONSTRAINT contract_signatures_contract_check;

ALTER TABLE public.contract_signatures
  ADD CONSTRAINT contract_signatures_contract_check
  CHECK (contract IN ('buyer', 'seller', 'courier'));

COMMENT ON COLUMN public.contract_signatures.contract IS 'buyer = покупатель, seller = продавец, courier = курьер Alliby Carry';
