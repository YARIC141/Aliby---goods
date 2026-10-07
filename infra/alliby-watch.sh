#!/bin/bash
# Серверный мониторинг Alliby: диск, nginx, контейнеры, API, 5xx, rate-limit, журнал клиентских ошибок.
# Запуск из cron каждые 5 минут (см. infra/README.md). Алерт уходит в Telegram:
# при появлении проблемы сразу, при повторе — раз в 6 ч, при исчезновении — «восстановлено».
# Конфиг: /root/.alliby-alert.env  (TG_TOKEN=..., TG_CHAT=...)

set -u
[ -f /root/.alliby-alert.env ] && . /root/.alliby-alert.env
STATE=/var/lib/alliby-watch
mkdir -p "$STATE"
NOW=$(date +%s)
REPEAT=21600
ANON=sb_publishable_HILQWfLrBvlWcUPz6Atam__5M5vw3nq
ACCESS=/var/log/nginx/access.log
ERRLOG=/var/log/nginx/error.log

send() {
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] || { echo "$1"; return 0; }
  curl -s -m 15 -X POST "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
    -d chat_id="$TG_CHAT" --data-urlencode text="$1" >/dev/null
}

# check <id> <ok:0|1> <сообщение о проблеме>
check() {
  local id="$1" ok="$2" msg="$3" f="$STATE/$1" last
  if [ "$ok" = 1 ]; then
    if [ -f "$f" ]; then rm -f "$f"; send "🟢 Восстановлено: $id"; fi
    return
  fi
  last=0; [ -f "$f" ] && last=$(cat "$f")
  if [ $((NOW - last)) -ge $REPEAT ]; then
    echo "$NOW" > "$f"
    send "🔴 $msg"
  fi
}

# --- диск ---
used=$(df --output=pcent / | tail -1 | tr -dc 0-9)
check disk $([ "$used" -lt 85 ] && echo 1 || echo 0) "Диск / заполнен на ${used}%"

# --- nginx ---
systemctl is-active --quiet nginx
check nginx $([ $? -eq 0 ] && echo 1 || echo 0) "nginx не запущен"

# --- контейнеры: всё, что должно работать, но не running ---
bad=$(docker ps -a --format '{{.Names}} {{.State}} {{.Status}}' | grep -Ev ' running ' | grep -Ev 'Exited \(0\)' | awk '{print $1}' | tr '\n' ' ')
check containers $([ -z "$bad" ] && echo 1 || echo 0) "Контейнеры не работают: $bad"
unh=$(docker ps --filter health=unhealthy --format '{{.Names}}' | tr '\n' ' ')
check unhealthy $([ -z "$unh" ] && echo 1 || echo 0) "Контейнеры unhealthy: $unh"

# --- API локально ---
code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "apikey: $ANON" https://alliby.ru/rest/v1/ --resolve alliby.ru:443:127.0.0.1)
check api $([ "$code" = 200 ] && echo 1 || echo 0) "API alliby.ru отвечает HTTP $code"

# --- 5xx и 429 в access.log за последние 5 минут ---
# формат времени: [07/Oct/2026:18:05:38 +0000]; сервер в UTC
since=$(date -u -d '5 minutes ago' '+%d/%b/%Y:%H:%M:%S')
today=$(date -u '+%d/%b/%Y')
read -r total s5 s429 < <(tail -n 30000 "$ACCESS" 2>/dev/null | awk -v s="$since" -v today="$today" '
  { t=substr($4,2,20); d=substr(t,1,11)
    if ((d == substr(s,1,11) && t >= s) || (d == today && d != substr(s,1,11))) { n++; if ($9 ~ /^5/) a++; if ($9 == 429) b++ } }
  END { print n+0, a+0, b+0 }')
total=${total:-0}; s5=${s5:-0}; s429=${s429:-0}
check http5xx $([ "$s5" -lt 10 ] && echo 1 || echo 0) "nginx: $s5 ответов 5xx за 5 мин (из $total)"
check ratelimit $([ "$s429" -lt 30 ] && echo 1 || echo 0) "nginx: $s429 ответов 429 (rate-limit) за 5 мин"

# --- журнал клиентских ошибок ---
if docker ps --format '{{.Names}}' | grep -qx supabase-db; then
  cnt=$(docker exec supabase-db psql -U postgres -At -c "
    select count(*) from client_error_log
    where created_at > now() - interval '15 minutes'
      and kind in ('fetch_fail','http_5xx','slow_load','js','promise')
      and msg not ilike '%openstreetmap%'" 2>/dev/null)
  cnt=${cnt:-0}
  ips=$(docker exec supabase-db psql -U postgres -At -c "
    select count(distinct coalesce(ip,ua)) from client_error_log
    where created_at > now() - interval '15 minutes'
      and kind in ('fetch_fail','http_5xx','slow_load')
      and msg not ilike '%openstreetmap%'" 2>/dev/null)
  ips=${ips:-0}
  # много ошибок от нескольких разных клиентов = системная проблема, а не один плохой телефон
  check clienterrors $([ "$cnt" -lt 20 ] || [ "$ips" -lt 3 ] && echo 1 || echo 0) \
    "Журнал клиентов: $cnt ошибок за 15 мин от $ips клиентов (client_error_log)"
fi
