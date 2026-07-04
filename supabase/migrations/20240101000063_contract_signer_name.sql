ALTER TABLE public.contract_signatures
  ADD COLUMN IF NOT EXISTS signer_name TEXT;
