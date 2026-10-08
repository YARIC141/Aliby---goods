# Сетевые сбои 2026-10-08: итоги

**Причина (подтверждена записью трафика):** iptables-правило `TCPMSS --set-mss 1200` на SYN-ACK порта 443
заставляло клиентов резать ClientHello на сегменты по 1188 байт. Первый сегмент доходил, второй - нет
(36 из 36 соединений, `capture-2026-10-08-1112utc-5.165.60.77.txt`), сервер ждал 10 с и закрывал соединение.
После снятия правила (MSS 1460) соединения завершаются нормально, данные обновляются без VPN.
Правило удалено из рантайма и из `/etc/iptables/rules.v4` (бэкап на VPS: `/root/rules.v4.bak.before-mss-removal`).

**Побочно:** фоновый SYN-шум на порт 80 от `91.217.78.0/23` (KAFA-NET, EKMA IS LLC) - без HTTP-запросов.
`infra/alliby-fw.sh` (на VPS: `/usr/local/sbin/alliby-fw.sh`, сервис `alliby-fw.service`): DROP подсети +
лимит 20 новых соединений/с на порт 80 с одного адреса. Откат: `iptables -D INPUT -j ALLIBY-IN; systemctl disable --now alliby-fw`.

**Инструменты:** `syn-watch.py` (минутные счётчики SYN/SYN-ACK в `/var/log/syn-watch.csv`),
`net-diag.ps1`, `net-diag-bigtls.ps1`, `beget-letter-2026-10-08.md`.
