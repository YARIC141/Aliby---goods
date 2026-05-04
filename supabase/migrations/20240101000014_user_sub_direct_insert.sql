-- Allow authenticated users to purchase subscriptions directly.
-- In production this would be handled by payment-webhook (service role),
-- but for simulation / demo mode we allow the user to self-insert.
CREATE POLICY "user_subscriptions: insert own"
  ON public.user_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());
