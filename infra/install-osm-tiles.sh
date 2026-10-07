#!/bin/bash
# Установка кэша тайлов OSM на VPS. Запуск на сервере из каталога с файлами infra/nginx/.
# Откат при ошибке nginx -t автоматический.
set -e
SITE=/etc/nginx/sites-enabled/alliby
D=$(dirname "$0")/nginx
mkdir -p /var/cache/nginx/osm-tiles /etc/nginx/snippets
chown -R www-data:www-data /var/cache/nginx/osm-tiles 2>/dev/null || true
cp "$D/osm-tiles-cache.conf"    /etc/nginx/conf.d/osm-tiles-cache.conf
cp "$D/osm-tiles-location.conf" /etc/nginx/snippets/osm-tiles-location.conf
cp "$SITE" /root/alliby.site.bak.osm
if ! grep -q osm-tiles-location "$SITE"; then
  # вставляем include после первого server_name alliby.ru (HTTPS-блок)
  sed -i '0,/server_name alliby.ru www.alliby.ru;/s//&\n    include \/etc\/nginx\/snippets\/osm-tiles-location.conf;/' "$SITE"
fi
if nginx -t; then systemctl reload nginx && echo "OK: nginx перезагружен"
else
  cp /root/alliby.site.bak.osm "$SITE"; rm -f /etc/nginx/conf.d/osm-tiles-cache.conf
  nginx -t && echo "ОТКАТ выполнен"; exit 1
fi
