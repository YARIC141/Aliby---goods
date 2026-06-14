# Применить миграцию 049 (native push) через SSH на VPS
# Запусти: .\scripts\apply-migration-049.ps1
# Требуется: SSH ключ из GitHub Secrets (VPS_SSH_KEY) добавлен в ssh-agent

$VPS_HOST = $env:VPS_HOST  # или вставь IP напрямую: "1.2.3.4"
$SQL_FILE = "$PSScriptRoot\..\supabase\migrations\20240101000049_native_push.sql"

if (-not $VPS_HOST) {
    $VPS_HOST = Read-Host "Введи IP VPS"
}

Write-Host "Применяю миграцию 049 на $VPS_HOST..." -ForegroundColor Cyan

# Копируем SQL на VPS
scp -P 2222 $SQL_FILE "root@${VPS_HOST}:/tmp/migration_049.sql"

# Применяем через docker exec
ssh -p 2222 "root@$VPS_HOST" @'
docker exec supabase-db psql -U postgres -d postgres -f /tmp/migration_049.sql && \
echo "OK: migration 049 applied" || echo "ERROR: check output above"
rm /tmp/migration_049.sql
'@
