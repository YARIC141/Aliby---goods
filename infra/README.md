# Мониторинг Alliby

Два независимых контура, оба шлют в один Telegram-чат.

## 1. Внешний (GitHub Actions) — `.github/workflows/uptime.yml`
Каждые 5 мин проверяет alliby.ru, admin, carry, `/rest/v1/` (оба хоста). Алерт при смене состояния.
Нужны секреты репозитория: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
(GitHub → Settings → Secrets and variables → Actions).

## 2. Серверный — `infra/alliby-watch.sh` (cron на VPS)
Диск, nginx, контейнеры (+unhealthy), API, 5xx и 429 в access.log, всплеск ошибок в `client_error_log`.

Установка:
```
scp -P 2222 infra/alliby-watch.sh root@89.169.39.31:/usr/local/bin/alliby-watch.sh
ssh -p 2222 root@89.169.39.31
chmod +x /usr/local/bin/alliby-watch.sh
printf 'TG_TOKEN=<токен бота>\nTG_CHAT=<chat id>\n' > /root/.alliby-alert.env && chmod 600 /root/.alliby-alert.env
echo '*/5 * * * * root /usr/local/bin/alliby-watch.sh >>/var/log/alliby-watch.log 2>&1' > /etc/cron.d/alliby-watch
/usr/local/bin/alliby-watch.sh   # пробный прогон, без токена печатает алерты в консоль
```

## Telegram-бот
@BotFather → `/newbot` → токен. Написать боту любое сообщение, затем открыть
`https://api.telegram.org/bot<токен>/getUpdates` → `chat.id`.
