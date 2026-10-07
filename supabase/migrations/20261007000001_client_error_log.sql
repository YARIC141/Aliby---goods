-- Журнал клиентских ошибок (JS-ошибки, упавшие fetch, ошибки загрузки ресурсов).
-- Пишется анонимно через RPC, читается только владельцем БД (service_role / psql).
create table if not exists public.client_error_log (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  app        text,
  kind       text,
  msg        text,
  page       text,
  ua         text,
  ip         text,
  extra      jsonb,
  client_ts  timestamptz
);
alter table public.client_error_log enable row level security;
revoke all on public.client_error_log from anon, authenticated;
create index if not exists client_error_log_created_idx on public.client_error_log (created_at desc);

create or replace function public.log_client_errors(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  n int := 0;
  v_ip text;
begin
  if jsonb_typeof(p) <> 'array' then return; end if;
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := null;
  end;
  for r in select * from jsonb_array_elements(p) loop
    n := n + 1;
    exit when n > 20;
    insert into public.client_error_log (app, kind, msg, page, ua, ip, extra, client_ts)
    values (
      left(r->>'app', 20), left(r->>'kind', 40), left(r->>'msg', 600),
      left(r->>'page', 300), left(r->>'ua', 300), left(v_ip, 64),
      case when jsonb_typeof(r->'extra') = 'object' then r->'extra' end,
      case when (r->>'ts') ~ '^\d{10,14}$' then to_timestamp((r->>'ts')::bigint / 1000.0) end
    );
  end loop;
end $$;
revoke all on function public.log_client_errors(jsonb) from public;
grant execute on function public.log_client_errors(jsonb) to anon, authenticated;

-- хранение 30 дней: чистка срабатывает примерно на каждую сотую запись
create or replace function public.client_error_log_trim() returns trigger language plpgsql as $$
begin
  if random() < 0.01 then
    delete from public.client_error_log where created_at < now() - interval '30 days';
  end if;
  return null;
end $$;
drop trigger if exists client_error_log_trim on public.client_error_log;
create trigger client_error_log_trim after insert on public.client_error_log
  for each statement execute function public.client_error_log_trim();

notify pgrst, 'reload schema';
