-- Migration 064: send push on booking INSERT regardless of payment_status
-- Previously only sent push when payment_status = 'paid' on INSERT.
-- Now: unpaid INSERT → booking_created, paid INSERT → booking_confirmed.

CREATE OR REPLACE FUNCTION notify_booking_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'paid' THEN
      v_type := 'booking_confirmed';
    ELSE
      v_type := 'booking_created';
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
