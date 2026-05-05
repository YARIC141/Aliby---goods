# OSM → Samara vector map importer (uses curl.exe for Overpass, PowerShell for import)

$IMPORT_URL = "https://bucxawpwttvtwdwdtuhh.supabase.co/functions/v1/vector-map-import"
$SVC_KEY    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Y3hhd3B3dHR2dHdkd2R0dWhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzEwNjQ1NiwiZXhwIjoyMDkyNjgyNDU2fQ.GrTJ4WjwgkBUSSSLIgjKSYt6EGln8U1eYlxGe9EhfzM"
$OVERPASS   = "https://overpass-api.de/api/interpreter"

function Fetch-Overpass($query, $timeoutSec = 120) {
  $tmpFile = [System.IO.Path]::GetTempFileName()
  # URL-encode and use GET (more reliable than POST)
  $encoded = [uri]::EscapeDataString($query)
  curl.exe -s --max-time $timeoutSec "$OVERPASS`?data=$encoded" -o $tmpFile
  if ($LASTEXITCODE -ne 0) { throw "curl exit code: $LASTEXITCODE" }
  $content = Get-Content $tmpFile -Raw -Encoding UTF8
  Remove-Item $tmpFile -Force
  if ($content -match '<html') { throw "Overpass returned HTML error" }
  return $content | ConvertFrom-Json
}

function Send-Layer($layer, $features) {
  if ($features.Count -eq 0) { Write-Host "  0 features, skipping." -ForegroundColor Yellow; return 0 }
  Write-Host "  Sending $($features.Count) features..." -ForegroundColor Gray
  $tmpIn  = [System.IO.Path]::GetTempFileName() + ".json"
  $tmpOut = [System.IO.Path]::GetTempFileName()
  @{ layer = $layer; features = $features } | ConvertTo-Json -Depth 20 -Compress | Set-Content $tmpIn -Encoding UTF8
  curl.exe -s -X POST $IMPORT_URL `
    -H "Authorization: Bearer $SVC_KEY" `
    -H "Content-Type: application/json" `
    --data-binary "@$tmpIn" -o $tmpOut --max-time 300
  $result = Get-Content $tmpOut -Raw -Encoding UTF8 | ConvertFrom-Json
  Remove-Item $tmpIn, $tmpOut -Force -ErrorAction SilentlyContinue
  Write-Host "  Inserted: $($result.inserted)" -ForegroundColor Green
  return $result.inserted
}

function Map-Id($p) { if ($p.'@id') { $p.'@id' } else { [System.Guid]::NewGuid().ToString() } }

$S = 53.10; $W = 50.07; $N = 53.28; $E = 50.42
$total = 0

# ─── WATER ───────────────────────────────────────────────────────────────────
Write-Host "`n[1/5] WATER" -ForegroundColor Cyan
$q = "[out:geojson][bbox:$S,$W,$N,$E][timeout:90];(way[natural=water];way[waterway~'river|stream|canal'];relation[natural=water];);out geom;"
$data = Fetch-Overpass $q
$features = @($data.features | Where-Object { $_.geometry } | ForEach-Object {
  $p = $_.properties
  [PSCustomObject]@{ id=$($p.'@id' -replace '^',''); geometry=$_.geometry; name=$p.name
    subtype=if($p.waterway){$p.waterway}else{$p.natural}; class=$p.water }
})
$total += Send-Layer "water" $features

# ─── LAND USE ────────────────────────────────────────────────────────────────
Write-Host "`n[2/5] LAND USE" -ForegroundColor Cyan
$q = "[out:geojson][bbox:$S,$W,$N,$E][timeout:90];(way[landuse];way[leisure=park];way[leisure=garden];way[natural=wood];way[natural=grassland];relation[landuse];);out geom;"
$data = Fetch-Overpass $q
$features = @($data.features | Where-Object { $_.geometry } | ForEach-Object {
  $p = $_.properties
  [PSCustomObject]@{ id=$($p.'@id'); geometry=$_.geometry
    subtype=if($p.landuse){$p.landuse}elseif($p.leisure){$p.leisure}else{$p.natural}
    class=$null; surface=$p.surface }
})
$total += Send-Layer "land_use" $features

# ─── PLACES ──────────────────────────────────────────────────────────────────
Write-Host "`n[3/5] PLACES" -ForegroundColor Cyan
$q = "[out:geojson][bbox:$S,$W,$N,$E][timeout:90];(node[amenity];node[shop];node[tourism];node[leisure~'sports_centre|fitness_centre'];);out geom;"
$data = Fetch-Overpass $q
$features = @($data.features | Where-Object { $_.geometry } | ForEach-Object {
  $p = $_.properties
  $cat = if($p.amenity){$p.amenity}elseif($p.shop){"shop:$($p.shop)"}elseif($p.tourism){"tourism:$($p.tourism)"}else{$p.leisure}
  [PSCustomObject]@{ id=$($p.'@id'); geometry=$_.geometry; name=$p.name
    category=$cat; website=$p.website; phone=$p.'contact:phone' }
})
$total += Send-Layer "places" $features

# ─── ROADS ───────────────────────────────────────────────────────────────────
Write-Host "`n[4/5] ROADS" -ForegroundColor Cyan
$q = "[out:geojson][bbox:$S,$W,$N,$E][timeout:120];(way[highway~'motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|footway|cycleway|path|service'];);out geom;"
$data = Fetch-Overpass $q
$features = @($data.features | Where-Object { $_.geometry } | ForEach-Object {
  $p = $_.properties
  [PSCustomObject]@{ id=$($p.'@id'); geometry=$_.geometry; name=$p.name
    class=$p.highway; subtype="road"; surface=$p.surface; oneway=($p.oneway -eq 'yes') }
})
$total += Send-Layer "roads" $features

# ─── BUILDINGS (6 chunks 3×2) ────────────────────────────────────────────────
Write-Host "`n[5/5] BUILDINGS (6 chunks)" -ForegroundColor Cyan
$latStep = ($N - $S) / 2
$lonStep = ($E - $W) / 3
$chunk = 0
for ($row = 0; $row -lt 2; $row++) {
  for ($col = 0; $col -lt 3; $col++) {
    $chunk++
    $bs = [Math]::Round($S + $row * $latStep, 4)
    $bn = [Math]::Round($S + ($row+1) * $latStep, 4)
    $bw = [Math]::Round($W + $col * $lonStep, 4)
    $be = [Math]::Round($W + ($col+1) * $lonStep, 4)
    Write-Host "  Chunk $chunk/6 [$bs,$bw → $bn,$be]" -ForegroundColor Gray
    try {
      $q = "[out:geojson][bbox:$bs,$bw,$bn,$be][timeout:120];(way[building];relation[building][type=multipolygon];);out geom;"
      $data = Fetch-Overpass $q 150
      $features = @($data.features | Where-Object { $_.geometry } | ForEach-Object {
        $p = $_.properties
        [PSCustomObject]@{ id=$($p.'@id'); geometry=$_.geometry; name=$p.name
          subtype=$p.building; class=$p.'building:use'
          floors=$p.'building:levels'; height=$p.height }
      })
      $total += Send-Layer "buildings" $features
    } catch { Write-Host "  ERROR: $_" -ForegroundColor Red }
  }
}

Write-Host "`nTotal inserted: $total" -ForegroundColor Green
