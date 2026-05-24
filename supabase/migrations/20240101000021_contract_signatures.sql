-- ============================================================
-- Миграция 21: Таблица подписей ПЭП (ФЗ-63)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract    TEXT        NOT NULL CHECK (contract IN ('buyer', 'seller')),
  version     TEXT        NOT NULL,
  doc_hash    TEXT        NOT NULL,
  signed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address  TEXT,
  user_agent  TEXT,
  user_email  TEXT        NOT NULL,
  accept_text TEXT        NOT NULL
);

COMMENT ON TABLE public.contract_signatures IS 'Журнал подписаний ПЭП договоров (ФЗ-63). Вставка только через Edge Function sign-contract.';
COMMENT ON COLUMN public.contract_signatures.contract  IS 'buyer = покупатель, seller = продавец';
COMMENT ON COLUMN public.contract_signatures.version   IS 'Дата редакции документа YYYY-MM-DD';
COMMENT ON COLUMN public.contract_signatures.doc_hash  IS 'SHA-256 текста договора на момент подписания';
COMMENT ON COLUMN public.contract_signatures.ip_address IS 'IP-адрес клиента (X-Forwarded-For)';
COMMENT ON COLUMN public.contract_signatures.accept_text IS 'Точная формулировка согласия, которую подписал пользователь';

ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_signatures: select own or admin"
  ON public.contract_signatures FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE INDEX IF NOT EXISTS idx_contract_sigs_user_contract
  ON public.contract_signatures(user_id, contract, version);
