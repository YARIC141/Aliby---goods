-- Migration 087: Analytics now accounts for rentals and bookings, not just cart orders.
-- Previously get_store_analytics only looked at orders/order_items, so stores that run
-- purely on "Записи" (bookings) or "Аренда" (rent_reservations) showed zero revenue,
-- zero transactions and an empty top-items list despite having real business activity.

CREATE OR REPLACE FUNCTION public.get_store_analytics(
  p_store_id UUID,
  p_year     INT,
  p_month    INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start      TIMESTAMPTZ;
  v_end        TIMESTAMPTZ;
  v_start_date DATE;
  v_end_date   DATE;
BEGIN
  v_start      := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');
  v_end        := v_start + INTERVAL '1 month';
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date   := v_start_date + INTERVAL '1 month';

  RETURN (
    WITH ord AS (
      SELECT o.id, o.total_amount AS amt, o.order_time::date AS day
      FROM orders o
      WHERE o.store_id = p_store_id
        AND o.order_time >= v_start AND o.order_time < v_end
        AND o.status <> 'cancelled'
    ),
    bk AS (
      SELECT b.id, b.menu_item_id, b.total_price AS amt, b.slot_date AS day
      FROM bookings b
      WHERE b.store_id = p_store_id
        AND b.slot_date >= v_start_date AND b.slot_date < v_end_date
        AND b.status <> 'cancelled'
    ),
    rr AS (
      SELECT r.id, r.item_id, r.quantity, r.total_price AS amt, r.start_at::date AS day
      FROM rent_reservations r
      WHERE r.store_id = p_store_id
        AND r.start_at >= v_start AND r.start_at < v_end
        AND r.status <> 'cancelled'
    ),
    daily AS (
      SELECT day, SUM(amt) AS rev FROM (
        SELECT day, amt FROM ord
        UNION ALL
        SELECT day, amt FROM bk
        UNION ALL
        SELECT day, amt FROM rr
      ) x
      GROUP BY day
    ),
    item_qty AS (
      SELECT oi.menu_item_id AS item_id, SUM(oi.quantity) AS qty
      FROM order_items oi
      JOIN ord ON ord.id = oi.order_id
      GROUP BY oi.menu_item_id
      UNION ALL
      SELECT bk.menu_item_id AS item_id, COUNT(*) AS qty
      FROM bk
      GROUP BY bk.menu_item_id
      UNION ALL
      SELECT rr.item_id, SUM(rr.quantity) AS qty
      FROM rr
      GROUP BY rr.item_id
    ),
    item_totals AS (
      SELECT item_id, SUM(qty) AS qty
      FROM item_qty
      GROUP BY item_id
    )
    SELECT jsonb_build_object(
      'revenue',          COALESCE((SELECT SUM(amt) FROM ord), 0)
                        + COALESCE((SELECT SUM(amt) FROM bk), 0)
                        + COALESCE((SELECT SUM(amt) FROM rr), 0),
      'orders_count',     (SELECT COUNT(*) FROM ord),
      'orders_revenue',   COALESCE((SELECT SUM(amt) FROM ord), 0),
      'bookings_count',   (SELECT COUNT(*) FROM bk),
      'bookings_revenue', COALESCE((SELECT SUM(amt) FROM bk), 0),
      'rent_count',       (SELECT COUNT(*) FROM rr),
      'rent_revenue',     COALESCE((SELECT SUM(amt) FROM rr), 0),
      'avg_check', (
        CASE WHEN (SELECT COUNT(*) FROM ord) + (SELECT COUNT(*) FROM bk) + (SELECT COUNT(*) FROM rr) > 0
        THEN ROUND((
          COALESCE((SELECT SUM(amt) FROM ord), 0)
          + COALESCE((SELECT SUM(amt) FROM bk), 0)
          + COALESCE((SELECT SUM(amt) FROM rr), 0)
        ) / (
          (SELECT COUNT(*) FROM ord) + (SELECT COUNT(*) FROM bk) + (SELECT COUNT(*) FROM rr)
        ))
        ELSE 0 END
      ),
      'daily_revenue', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('day', EXTRACT(DAY FROM daily.day)::INT, 'rev', daily.rev) ORDER BY daily.day), '[]')
        FROM daily
      ),
      'top_items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', mi.name, 'qty', it.qty, 'item_type', mi.item_type) ORDER BY it.qty DESC), '[]')
        FROM (SELECT item_id, qty FROM item_totals ORDER BY qty DESC LIMIT 5) it
        JOIN menu_items mi ON mi.id = it.item_id
      ),
      'sub_redemptions', (
        SELECT COUNT(*)
        FROM subscription_redemptions sr
        JOIN user_subscriptions us ON us.id = sr.user_subscription_id
        JOIN subscriptions s        ON s.id  = us.subscription_id
        WHERE s.store_id = p_store_id
          AND sr.redeemed_at >= v_start AND sr.redeemed_at < v_end
      ),
      'sub_discount_total', (
        SELECT COALESCE(SUM(sr.amount_discounted), 0)
        FROM subscription_redemptions sr
        JOIN user_subscriptions us ON us.id = sr.user_subscription_id
        JOIN subscriptions s        ON s.id  = us.subscription_id
        WHERE s.store_id = p_store_id
          AND sr.redeemed_at >= v_start AND sr.redeemed_at < v_end
      ),
      'clicks_store', (
        SELECT COUNT(*) FROM analytics_events
        WHERE event = 'store_open'
          AND properties->>'store_id' = p_store_id::TEXT
          AND created_at >= v_start AND created_at < v_end
      ),
      'clicks_menu', (
        SELECT COUNT(*) FROM analytics_events
        WHERE event = 'menu_open'
          AND properties->>'store_id' = p_store_id::TEXT
          AND created_at >= v_start AND created_at < v_end
      ),
      'clicks_item', (
        SELECT COUNT(*) FROM analytics_events
        WHERE event = 'item_click'
          AND properties->>'store_id' = p_store_id::TEXT
          AND created_at >= v_start AND created_at < v_end
      ),
      'top_clicked_items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', t.item_name, 'clicks', t.cnt) ORDER BY t.cnt DESC), '[]')
        FROM (
          SELECT properties->>'item_name' AS item_name, COUNT(*) AS cnt
          FROM analytics_events
          WHERE event = 'item_click'
            AND properties->>'store_id' = p_store_id::TEXT
            AND created_at >= v_start AND created_at < v_end
          GROUP BY properties->>'item_name'
          ORDER BY cnt DESC
          LIMIT 5
        ) t
        WHERE t.item_name IS NOT NULL
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_analytics(UUID, INT, INT) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_rent_res_store_start ON public.rent_reservations(store_id, start_at);
