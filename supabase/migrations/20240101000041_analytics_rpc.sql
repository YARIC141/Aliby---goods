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
  v_start TIMESTAMPTZ;
  v_end   TIMESTAMPTZ;
BEGIN
  v_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');
  v_end   := v_start + INTERVAL '1 month';

  RETURN (
    SELECT jsonb_build_object(
      'revenue',     COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'cancelled'), 0),
      'order_count', COUNT(o.id)                  FILTER (WHERE o.status <> 'cancelled'),
      'avg_check',   COALESCE(ROUND(AVG(o.total_amount) FILTER (WHERE o.status <> 'cancelled'))::NUMERIC, 0),
      'daily_revenue', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d.day, 'rev', d.rev) ORDER BY d.day), '[]')
        FROM (
          SELECT EXTRACT(DAY FROM o2.created_at)::INT AS day,
                 SUM(o2.total_amount)                  AS rev
          FROM orders o2
          WHERE o2.store_id = p_store_id
            AND o2.created_at >= v_start AND o2.created_at < v_end
            AND o2.status <> 'cancelled'
          GROUP BY 1
        ) d
      ),
      'top_items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', mi.name, 'qty', t.qty) ORDER BY t.qty DESC), '[]')
        FROM (
          SELECT oi.menu_item_id, SUM(oi.quantity) AS qty
          FROM order_items oi
          JOIN orders o3 ON o3.id = oi.order_id
          WHERE o3.store_id = p_store_id
            AND o3.created_at >= v_start AND o3.created_at < v_end
            AND o3.status <> 'cancelled'
          GROUP BY oi.menu_item_id
          ORDER BY qty DESC
          LIMIT 5
        ) t
        JOIN menu_items mi ON mi.id = t.menu_item_id
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
    FROM orders o
    WHERE o.store_id = p_store_id
      AND o.created_at >= v_start AND o.created_at < v_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_analytics(UUID, INT, INT) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_ae_event_store
  ON public.analytics_events ((properties->>'store_id'), event, created_at DESC);
