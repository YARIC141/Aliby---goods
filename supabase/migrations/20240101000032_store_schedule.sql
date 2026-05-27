-- Add schedule_templates and store_schedules tables

CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id   UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  slots      JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_schedules (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id   UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  slots      JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_schedule_templates_store_id ON public.schedule_templates(store_id);
CREATE INDEX IF NOT EXISTS idx_store_schedules_store_date  ON public.store_schedules(store_id, date);

-- RLS
ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_schedules     ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "schedule_templates: public select"
  ON public.schedule_templates FOR SELECT USING (true);

CREATE POLICY "store_schedules: public select"
  ON public.store_schedules FOR SELECT USING (true);

-- Owner write for schedule_templates
CREATE POLICY "schedule_templates: owner insert"
  ON public.schedule_templates FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid())
  );

CREATE POLICY "schedule_templates: owner update"
  ON public.schedule_templates FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = schedule_templates.store_id AND s.owner_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid())
  );

CREATE POLICY "schedule_templates: owner delete"
  ON public.schedule_templates FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = schedule_templates.store_id AND s.owner_user_id = auth.uid())
  );

-- Owner write for store_schedules
CREATE POLICY "store_schedules: owner insert"
  ON public.store_schedules FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid())
  );

CREATE POLICY "store_schedules: owner update"
  ON public.store_schedules FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_schedules.store_id AND s.owner_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid())
  );

CREATE POLICY "store_schedules: owner delete"
  ON public.store_schedules FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_schedules.store_id AND s.owner_user_id = auth.uid())
  );
