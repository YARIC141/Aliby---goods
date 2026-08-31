-- ============================================================
-- Alliby Carry: email как основной канал уведомления о модерации
-- ============================================================
-- Решение: блокировка курьера (profiles.courier_banned) остаётся ручной
-- через SQL, как и раньше — новой admin UI для неё не добавляется. Этот
-- триггер лишь добавляет автоматическое письмо курьеру при простановке
-- бана, соответствуя §5.4а Оферты (email — основной канал связи по
-- вопросам модерации).

CREATE OR REPLACE FUNCTION public.notify_courier_banned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.courier_banned = true AND OLD.courier_banned IS DISTINCT FROM true THEN
    PERFORM net.http_post(
      url     := 'https://alliby.ru/functions/v1/carry-notify-ban',
      body    := jsonb_build_object(
                   'user_id', NEW.id,
                   'reason',  NEW.courier_ban_reason
                 ),
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'x-push-secret', 'Zw8hHn4mv3ee1XzbX12H7EutpMv2lLyo'
                 )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courier_banned_email ON public.profiles;
CREATE TRIGGER trg_courier_banned_email
  AFTER UPDATE OF courier_banned ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_courier_banned();
