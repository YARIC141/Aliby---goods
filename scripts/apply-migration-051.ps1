# Применить миграцию 051 (fix gift stock trigger) через SSH на VPS
# Запуск: ! .\scripts\apply-migration-051.ps1

$VPS_HOST = "89.169.39.31"
$SQL_FILE  = "$PSScriptRoot\..\supabase\migrations\20240101000051_fix_gift_stock_trigger.sql"

Write-Host "Применяю миграцию 051 на $VPS_HOST..." -ForegroundColor Cyan

scp -i "$HOME\.ssh\id_ed25519" -P 2222 $SQL_FILE "root@${VPS_HOST}:/tmp/migration_051.sql"
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка копирования файла" -ForegroundColor Red; exit 1 }

ssh -i "$HOME\.ssh\id_ed25519" -p 2222 "root@$VPS_HOST" @'
docker exec supabase-db psql -U postgres -d postgres -f /tmp/migration_051.sql && \
echo "OK: migration 051 applied" || echo "ERROR: check output above"
rm /tmp/migration_051.sql
'@
