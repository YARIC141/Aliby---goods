-- Allow any client (anon + authenticated) to insert analytics events
CREATE POLICY "analytics_insert_all"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users (admins) to read analytics events
CREATE POLICY "analytics_select_auth"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (true);
