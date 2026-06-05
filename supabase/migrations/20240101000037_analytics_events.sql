CREATE TABLE public.analytics_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event           TEXT        NOT NULL,
  user_id         UUID,
  properties      JSONB       DEFAULT '{}',
  idempotency_key TEXT        UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Clients cannot read or write; only service_role (Edge Functions) can
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ae_event      ON public.analytics_events(event);
CREATE INDEX idx_ae_user_id    ON public.analytics_events(user_id);
CREATE INDEX idx_ae_created_at ON public.analytics_events(created_at DESC);
