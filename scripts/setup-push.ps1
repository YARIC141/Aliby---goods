# Creates the database trigger that calls send-push edge function on order changes.
# Run once after migration 000018 is applied.
# The trigger SQL is generated here (not in a migration file) so the service key stays out of git.

$REF       = "bucxawpwttvtwdwdtuhh"
$SB_URL    = "https://${REF}.supabase.co"
$SVC_KEY   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Y3hhd3B3dHR2dHdkd2R0dWhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzEwNjQ1NiwiZXhwIjoyMDkyNjgyNDU2fQ.GrTJ4WjwgkBUSSSLIgjKSYt6EGln8U1eYlxGe9EhfzM"
$ACCESS_TOKEN = (Get-Content "$PSScriptRoot\..\\.secrets" | Where-Object { $_ -match 'SUPABASE_ACCESS_TOKEN' } | ForEach-Object { ($_ -split '=',2)[1] })
$FUNC_URL  = "${SB_URL}/functions/v1/send-push"
$HEADERS_JSON = "{`"Content-Type`":`"application/json`",`"Authorization`":`"Bearer ${SVC_KEY}`"}"

$SQL = @"
CREATE OR REPLACE FUNCTION public.orders_notify_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS `$`$
BEGIN
  PERFORM supabase_functions.http_request(
    '${FUNC_URL}',
    'POST',
    '${HEADERS_JSON}'::jsonb,
    jsonb_build_object(
      'type',       TG_OP,
      'record',     to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
    ),
    5000
  );
  RETURN NEW;
END;
`$`$;

DROP TRIGGER IF EXISTS orders_push_trigger ON public.orders;
CREATE TRIGGER orders_push_trigger
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_notify_push();
"@

$body = [System.Text.Encoding]::UTF8.GetBytes(("{""query"":" + ($SQL | ConvertTo-Json -Compress) + "}"))
$tmpFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllBytes($tmpFile, $body)

$result = curl.exe -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" `
  -H "Authorization: Bearer $ACCESS_TOKEN" `
  -H "Content-Type: application/json" `
  --data-binary "@$tmpFile"

Remove-Item $tmpFile -Force
Write-Host $result

if ($result -match '"error"') {
  Write-Host "ERROR creating trigger!" -ForegroundColor Red
} else {
  Write-Host "Trigger orders_push_trigger created successfully." -ForegroundColor Green
}
