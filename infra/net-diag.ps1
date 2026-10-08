# Диагностика сети до VPS Alliby. Запускать с ОТКЛЮЧЁННЫМ VPN. Занимает ~6 минут.
# Запуск:  powershell -ExecutionPolicy Bypass -File infra\net-diag.ps1
# Результат: net-diag-<время>.txt рядом со скриптом. Пришлите его (или путь к нему) в чат.

$vps  = '89.169.39.31'
$host_ = 'alliby.ru'
$out  = Join-Path $PSScriptRoot ("net-diag-{0:yyyyMMdd-HHmm}.txt" -f (Get-Date))
function Log($s) { $s | Tee-Object -FilePath $out -Append }

Log "=== Alliby net diag, $(Get-Date -Format s) ==="
Log "Публичный IP (должен быть ваш домашний, не VPN):"
try { Log (curl.exe -s -m 10 https://api.ipify.org) } catch { Log 'не удалось' }
Log ""

Log "=== 1. tracert (ICMP), первый хоп должен быть вашим роутером 192.168.x.x ==="
Log (tracert -d -w 1500 -h 20 $vps | Out-String)

Log "=== 2. ping 100 пакетов, обычный размер ==="
Log (ping -n 100 $vps | Select-Object -Last 4 | Out-String)

Log "=== 3. ping 100 пакетов, 1472 байта без фрагментации ==="
Log (ping -n 100 -f -l 1472 $vps | Select-Object -Last 4 | Out-String)

Log "=== 4. HTTPS-рукопожатия к $host_ каждые 3 с, 100 попыток (connect / tls / total, сек; 0 = ошибка) ==="
$fail = 0; $slow = 0
for ($i = 1; $i -le 100; $i++) {
  $r = curl.exe -s -o NUL -m 12 -w '%{time_connect} %{time_appconnect} %{time_total} %{http_code}' "https://$host_/version.json" 2>$null
  $p = $r -split ' '
  $line = "{0:HH:mm:ss} #{1} connect={2} tls={3} total={4} http={5}" -f (Get-Date), $i, $p[0], $p[1], $p[2], $p[3]
  if ($p[3] -ne '200') { $fail++; $line += '  <-- СБОЙ' } elseif ([double]($p[2] -replace ',', '.') -gt 2) { $slow++; $line += '  <-- МЕДЛЕННО' }
  Log $line
  Start-Sleep -Seconds 3
}
Log ""
Log "ИТОГО по пункту 4: сбоев=$fail, медленных(>2с)=$slow из 100"
Log ""

Log "=== 5. Скачивание главной страницы 5 раз (скорость) ==="
1..5 | ForEach-Object { Log (curl.exe -s -o NUL -m 30 -w 'size=%{size_download} speed=%{speed_download} B/s total=%{time_total}s' "https://$host_/") }

Log ""
Log "Готово. Файл: $out"
Write-Host "`nГотово. Включайте VPN и пришлите файл: $out"
