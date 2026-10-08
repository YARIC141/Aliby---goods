# Тест "большого" TLS ClientHello (как у Chrome/Safari: ключ X25519MLKEM768 -> ClientHello > 1448 байт, 2 TCP-сегмента).
# curl/Schannel шлёт короткий ClientHello в один сегмент, поэтому он может проходить, когда браузеры зависают.
# Запуск с ОТКЛЮЧЁННЫМ VPN:  powershell -ExecutionPolicy Bypass -File infra\net-diag-bigtls.ps1
# Нужен openssl 3.5+ в PATH (проверка: openssl version).

$h = 'alliby.ru'
$ossl = (Get-Command openssl -ErrorAction SilentlyContinue).Source
if (-not $ossl) { $ossl = 'C:\Apps\Git\mingw64\bin\openssl.exe' }
if (-not (Test-Path $ossl)) { Write-Host 'openssl не найден'; exit 1 }
$out = Join-Path $PSScriptRoot ("net-diag-bigtls-{0:yyyyMMdd-HHmm}.txt" -f (Get-Date))
function Log($s) { $s | Tee-Object -FilePath $out -Append }
Log "=== big/small ClientHello, $(Get-Date -Format s) ==="
Log (& $ossl version)
Log "IP: $(curl.exe -s -m 10 https://api.ipify.org)"

function Try-Handshake($groups) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $ossl
  $psi.Arguments = "s_client -connect ${h}:443 -servername $h -groups $groups -brief"
  $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $p = [Diagnostics.Process]::Start($psi)
  $null = $p.StandardOutput.ReadToEndAsync(); $null = $p.StandardError.ReadToEndAsync()
  $p.StandardInput.Close()
  $ok = $p.WaitForExit(12000)
  if (-not $ok) { try { $p.Kill() } catch {} }
  $sw.Stop()
  [pscustomobject]@{ ok = $ok -and $p.ExitCode -eq 0; ms = $sw.ElapsedMilliseconds }
}

$bad = @{ big = 0; small = 0 }
for ($i = 1; $i -le 60; $i++) {
  $b = Try-Handshake 'X25519MLKEM768:X25519'
  $s = Try-Handshake 'X25519'
  if (-not $b.ok -or $b.ms -gt 2000) { $bad.big++ }
  if (-not $s.ok -or $s.ms -gt 2000) { $bad.small++ }
  Log ("{0:HH:mm:ss} #{1} BIG ok={2} {3}ms | SMALL ok={4} {5}ms" -f (Get-Date), $i, $b.ok, $b.ms, $s.ok, $s.ms)
  Start-Sleep -Seconds 3
}
Log "ИТОГО (сбой или >2с): big=$($bad.big) из 60, small=$($bad.small) из 60"
Write-Host "`nГотово. Файл: $out"
