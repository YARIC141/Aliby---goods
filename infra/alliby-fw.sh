#!/bin/bash
# Alliby: фоновый SYN-шум на порт 80 (см. infra/ в репозитории). Идемпотентно.
set -e
CH=ALLIBY-IN
iptables -N $CH 2>/dev/null || true
iptables -F $CH
# 1. Подсеть KAFA-NET (91.217.78.0-91.217.79.255): только SYN-мусор, легитимного трафика нет
iptables -A $CH -s 91.217.78.0/23 -j DROP
# 2. Порт 80: не более 20 новых соединений в секунду с одного адреса (burst 40)
iptables -A $CH -p tcp --dport 80 --syn -m hashlimit --hashlimit-name http80 \
  --hashlimit-mode srcip --hashlimit-above 20/second --hashlimit-burst 40 -j DROP
iptables -A $CH -j RETURN
# подключаем в начало INPUT один раз
iptables -C INPUT -j $CH 2>/dev/null || iptables -I INPUT 1 -j $CH
