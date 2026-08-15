-- Стоимость доставки определяется по адресу, а не по слову клиента.
--
-- tbank-init раньше принимал delivery_fee из запроса. После предыдущей
-- правки сумма хотя бы сверялась со списком цен зон заведения, но выбрать
-- цену самой дешёвой зоны при дальнем адресе всё ещё было можно: геометрия
-- не проверялась вовсе.
--
-- Функция повторяет клиентский _checkDeliveryZones: перебирает зоны
-- заведения, оставляет те, что накрывают точку, и возвращает наименьшую
-- цену среди них. NULL означает, что адрес вне зон доставки.
create or replace function public.delivery_fee_for_point(
  p_store_id uuid,
  p_lat      double precision,
  p_lng      double precision
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  z        record;
  v_best   numeric := null;
  v_inside boolean;
  v_line   geometry;
begin
  if p_store_id is null or p_lat is null or p_lng is null then
    return null;
  end if;

  for z in
    select type, price, radius_m, center_lat, center_lng, vertices
      from public.delivery_zones
     where store_id = p_store_id
  loop
    v_inside := false;

    if z.type = 'radius'
       and z.center_lat is not null and z.center_lng is not null then
      -- ST_DistanceSphere считает по сфере, как и haversine в приложении.
      v_inside := ST_DistanceSphere(
                    ST_MakePoint(z.center_lng, z.center_lat),
                    ST_MakePoint(p_lng, p_lat)
                  ) <= coalesce(z.radius_m, 0);

    elsif z.type = 'polygon'
          and jsonb_array_length(coalesce(z.vertices, '[]'::jsonb)) >= 3 then
      select ST_MakeLine(
               array_agg(ST_MakePoint((v->>'lng')::double precision,
                                      (v->>'lat')::double precision)
                         order by ord)
             )
        into v_line
        from jsonb_array_elements(z.vertices) with ordinality as t(v, ord);

      -- ST_MakePolygon требует замкнутое кольцо: дублируем первую вершину.
      v_line   := ST_AddPoint(v_line, ST_StartPoint(v_line));
      v_inside := ST_Contains(ST_MakePolygon(v_line), ST_MakePoint(p_lng, p_lat));
    end if;

    if v_inside and (v_best is null or z.price < v_best) then
      v_best := z.price;
    end if;
  end loop;

  return v_best;
end $$;

revoke all on function public.delivery_fee_for_point(uuid, double precision, double precision)
  from public, anon, authenticated;
