-- ============================================================
-- Миграция 3: Функции и триггеры
-- ============================================================

-- ============================================================
-- Триггер: автоматически создаём профиль при регистрации
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    'user',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Триггер: обновляем updated_at в stores
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- Функция: атомарное списание по абонементу
--
-- Вызывается из Edge Function redeem-subscription через service_role.
-- Выполняет всё в одной транзакции:
--   1. Блокирует строку user_subscriptions (FOR UPDATE)
--   2. Проверяет статус и срок действия
--   3. Сбрасывает used_today при необходимости
--   4. Уменьшает remaining_uses, увеличивает used_today
--   5. Создаёт запись в subscription_redemptions
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_subscription(
  p_user_subscription_id UUID,
  p_order_id             UUID,
  p_amount_discounted    NUMERIC
)
RETURNS TABLE(redemption_id UUID, remaining_uses INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_us  public.user_subscriptions;
  v_sub public.subscriptions;
  v_redemption_id UUID;
  v_remaining     INTEGER;
BEGIN
  -- Блокируем строку абонемента пользователя во избежание гонки условий
  SELECT us.*
  INTO v_us
  FROM public.user_subscriptions us
  WHERE us.id = p_user_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_subscription not found'
      USING ERRCODE = 'P0001', HINT = 'Check user_subscription_id';
  END IF;

  IF v_us.status != 'active' THEN
    RAISE EXCEPTION 'Абонемент не активен (статус: %)', v_us.status
      USING ERRCODE = 'P0002';
  END IF;

  IF v_us.end_date IS NOT NULL AND v_us.end_date < now() THEN
    UPDATE public.user_subscriptions
    SET status = 'expired'
    WHERE id = p_user_subscription_id;

    RAISE EXCEPTION 'Срок действия абонемента истёк'
      USING ERRCODE = 'P0003';
  END IF;

  -- Получаем план абонемента
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE id = v_us.subscription_id;

  -- Проверяем остаток использований (total_uses = 0 означает безлимит)
  IF v_sub.total_uses > 0 AND (v_us.remaining_uses IS NULL OR v_us.remaining_uses <= 0) THEN
    RAISE EXCEPTION 'Остаток использований исчерпан'
      USING ERRCODE = 'P0004';
  END IF;

  -- Сбрасываем used_today если последнее использование было в другой день (UTC)
  IF v_us.last_used_at IS NOT NULL AND
     (v_us.last_used_at AT TIME ZONE 'UTC')::DATE < (now() AT TIME ZONE 'UTC')::DATE
  THEN
    UPDATE public.user_subscriptions
    SET used_today = 0
    WHERE id = p_user_subscription_id;
    v_us.used_today := 0;
  END IF;

  -- Обновляем счётчики
  UPDATE public.user_subscriptions
  SET
    remaining_uses = CASE
                       WHEN v_sub.total_uses > 0 THEN remaining_uses - 1
                       ELSE remaining_uses
                     END,
    used_today     = used_today + 1,
    last_used_at   = now()
  WHERE id = p_user_subscription_id
  RETURNING user_subscriptions.remaining_uses INTO v_remaining;

  -- Записываем факт списания
  INSERT INTO public.subscription_redemptions (
    user_subscription_id,
    order_id,
    amount_discounted
  )
  VALUES (p_user_subscription_id, p_order_id, p_amount_discounted)
  RETURNING id INTO v_redemption_id;

  RETURN QUERY SELECT v_redemption_id, v_remaining;
END;
$$;

-- ============================================================
-- Функция: пометить истёкшие абонементы
-- Вызывается вручную или через pg_cron (если подключён в Supabase)
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_old_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.user_subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND end_date IS NOT NULL
    AND end_date < now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
