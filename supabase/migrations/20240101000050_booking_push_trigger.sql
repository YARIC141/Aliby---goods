-- Trigger: bookings changes → send-push edge function
-- booking_confirmed: при оплате (INSERT paid ИЛИ UPDATE payment_status→paid)
-- booking_cancelled: при отмене (UPDATE status→cancelled)

CREATE OR REPLACE FUNCTION notify_booking_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Только если сразу оплачена (абонемент)
    IF NEW.payment_status = 'paid' THEN
      v_type := 'booking_confirmed';
    ELSE
      RETURN NEW;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status <> NEW.status AND NEW.status = 'cancelled' THEN
      v_type := 'booking_cancelled';
    ELSIF OLD.payment_status <> NEW.payment_status AND NEW.payment_status = 'paid' THEN
      v_type := 'booking_confirmed';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://alliby.ru/functions/v1/send-push',
    body    := jsonb_build_object(
                 'user_id', NEW.user_id,
                 'type',    v_type,
                 'data',    jsonb_build_object('booking_id', NEW.id::text)
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-push-secret', 'Zw8hHn4mv3ee1XzbX12H7EutpMv2lLyo'
               )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_push ON public.bookings;
CREATE TRIGGER trg_booking_push
  AFTER INSERT OR UPDATE OF status, payment_status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_push();
