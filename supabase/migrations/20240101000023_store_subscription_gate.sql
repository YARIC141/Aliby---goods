-- ============================================================
-- Миграция 23: owner_user_id в stores + RPC проверки подписки
-- ============================================================

-- 1. Добавляем колонку владельца заведения
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Триггер: при INSERT автоматически проставляем auth.uid()
CREATE OR REPLACE FUNCTION public.set_store_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_set_owner ON public.stores;
CREATE TRIGGER stores_set_owner
  BEFORE INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_store_owner();

-- 3. RPC: публичная проверка активной подписки заведения
CREATE OR REPLACE FUNCTION public.is_store_subscription_active(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.platform_subscriptions ps
    JOIN   public.stores s ON s.owner_user_id = ps.user_id
    WHERE  s.id       = p_store_id
      AND  ps.status  = 'active'
      AND  ps.end_date >= CURRENT_DATE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_store_subscription_active(uuid)
  TO anon, authenticated, service_role;

COMMENT ON COLUMN public.stores.owner_user_id IS 'UUID администратора, создавшего заведение. Устанавливается автоматически триггером при INSERT.';
COMMENT ON FUNCTION public.is_store_subscription_active IS 'Проверяет активную platform_subscription владельца заведения. Безопасно вызывается покупателями.';
