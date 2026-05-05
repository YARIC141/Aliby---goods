# ============================================================
# deploy.ps1 — деплой Supabase backend для Aliby Foods
#
# Использование:
#   .\deploy.ps1                          # интерактивный режим
#   .\deploy.ps1 -ProjectRef "abcdefghij" # с указанием project ref
#
# Project Ref берём из URL: https://app.supabase.com/project/<project-ref>
# ============================================================

param(
  [string]$ProjectRef    = "",
  [string]$YandexApiKey  = ""
)

$SUPABASE = "C:\Users\Yarich\bin\supabase.exe"
$PROJECT_DIR = $PSScriptRoot

Set-Location $PROJECT_DIR

function Step($n, $text) {
  Write-Host ""
  Write-Host "[$n] $text" -ForegroundColor Cyan
  Write-Host ("-" * 50)
}

Write-Host ""
Write-Host "  Aliby Foods — деплой Supabase бэкенда" -ForegroundColor Green
Write-Host ""

# ---- Шаг 1: Авторизация ----------------------------------------
Step 1 "Авторизация в Supabase (откроется браузер)"
& $SUPABASE login
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка авторизации" -ForegroundColor Red; exit 1 }

# ---- Шаг 2: Привязка проекта -----------------------------------
Step 2 "Привязка к Supabase-проекту"
if ($ProjectRef) {
  Write-Host "Привязываем к проекту: $ProjectRef"
  & $SUPABASE link --project-ref $ProjectRef
} else {
  Write-Host "Введите Project Ref (из https://app.supabase.com/project/<ref>):"
  & $SUPABASE link
}
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка привязки проекта" -ForegroundColor Red; exit 1 }

# ---- Шаг 3: Применение миграций --------------------------------
Step 3 "Применение SQL-миграций к базе данных"
& $SUPABASE db push
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка применения миграций" -ForegroundColor Red; exit 1 }
Write-Host "Миграции применены успешно" -ForegroundColor Green

# ---- Шаг 4: Секреты для Edge Functions -------------------------
Step 4 "Установка секретов для Edge Functions"

if (-not $YandexApiKey) {
  Write-Host "Введите API-ключ Яндекс.Геокодера (или нажмите Enter, чтобы пропустить):" -ForegroundColor Yellow
  $YandexApiKey = Read-Host
}

if ($YandexApiKey) {
  & $SUPABASE secrets set YANDEX_GEOCODER_API_KEY=$YandexApiKey
  Write-Host "Секрет YANDEX_GEOCODER_API_KEY установлен" -ForegroundColor Green
} else {
  Write-Host "Пропущено. Задайте позже:" -ForegroundColor Gray
  Write-Host "  supabase secrets set YANDEX_GEOCODER_API_KEY=<ваш_ключ>" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Введите ЮKassa Shop ID (или Enter, чтобы пропустить):" -ForegroundColor Yellow
$YookassaShopId = Read-Host
if ($YookassaShopId) {
  & $SUPABASE secrets set YOOKASSA_SHOP_ID=$YookassaShopId
  Write-Host "Секрет YOOKASSA_SHOP_ID установлен" -ForegroundColor Green
}

Write-Host "Введите ЮKassa Secret Key (или Enter, чтобы пропустить):" -ForegroundColor Yellow
$YookassaSecretKey = Read-Host
if ($YookassaSecretKey) {
  & $SUPABASE secrets set YOOKASSA_SECRET_KEY=$YookassaSecretKey
  Write-Host "Секрет YOOKASSA_SECRET_KEY установлен" -ForegroundColor Green
}

# ---- Шаг 5: Деплой Edge Functions ------------------------------
Step 5 "Деплой Edge Functions"

Write-Host "  → geocode"
& $SUPABASE functions deploy geocode
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка деплоя geocode" -ForegroundColor Red; exit 1 }

Write-Host "  → validate-subscription"
& $SUPABASE functions deploy validate-subscription
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка деплоя validate-subscription" -ForegroundColor Red; exit 1 }

Write-Host "  → redeem-subscription"
& $SUPABASE functions deploy redeem-subscription
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка деплоя redeem-subscription" -ForegroundColor Red; exit 1 }

Write-Host "  → create-payment"
& $SUPABASE functions deploy create-payment
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка деплоя create-payment" -ForegroundColor Red; exit 1 }

Write-Host "  → payment-webhook"
& $SUPABASE functions deploy payment-webhook
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка деплоя payment-webhook" -ForegroundColor Red; exit 1 }

Write-Host "  → upload-map"
& $SUPABASE functions deploy upload-map
if ($LASTEXITCODE -ne 0) { Write-Host "Ошибка деплоя upload-map" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Деплой завершён успешно!" -ForegroundColor Green
Write-Host ""
Write-Host "  Теперь откройте Swagger для тестирования:" -ForegroundColor Yellow
Write-Host "  cd swagger && npx http-server -p 3100 --cors"
Write-Host "  Затем: http://localhost:3100"
Write-Host ""
