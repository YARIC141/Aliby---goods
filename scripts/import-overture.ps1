# Overture Maps → Samara vector map importer
# Uses DuckDB to query Overture S3, exports to NDJSON, sends to Supabase

$DUCKDB     = "C:\Users\Yarich\AppData\Local\Microsoft\WinGet\Links\duckdb.exe"
$IMPORT_URL = "https://bucxawpwttvtwdwdtuhh.supabase.co/functions/v1/vector-map-import"
$SVC_KEY    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Y3hhd3B3dHR2dHdkd2R0dWhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzEwNjQ1NiwiZXhwIjoyMDkyNjgyNDU2fQ.GrTJ4WjwgkBUSSSLIgjKSYt6EGln8U1eYlxGe9EhfzM"
$RELEASE    = "2026-04-15.0"
$S3         = "s3://overturemaps-us-west-2/release/$RELEASE"

# Samara bbox
$S = 53.10; $W = 50.07; $N = 53.28; $E = 50.42

$BBOX_FILTER = "bbox.xmin < $E AND bbox.xmax > $W AND bbox.ymin < $N AND bbox.ymax > $S"

$INIT_SQL = @"
INSTALL httpfs; LOAD httpfs;
INSTALL spatial; LOAD spatial;
SET s3_region='us-west-2';
SET enable_progress_bar=false;
"@

function Run-DuckDB($sql) {
  $tmpSql = [System.IO.Path]::GetTempFileName() + ".sql"
  ($INIT_SQL + "`n" + $sql) | Set-Content $tmpSql -Encoding UTF8
  $out = & $DUCKDB -noheader -csv -c (Get-Content $tmpSql -Raw) 2>&1
  Remove-Item $tmpSql -Force
  return $out
}

function Export-Layer($sql, $outFile) {
  $tmpSql = [System.IO.Path]::GetTempFileName() + ".sql"
  ($INIT_SQL + "`n" + $sql) | Set-Content $tmpSql -Encoding UTF8
  & $DUCKDB (Get-Content $tmpSql -Raw) 2>&1 | Out-Null
  Remove-Item $tmpSql -Force
}

function Send-Ndjson($layer, $filePath) {
  if (-not (Test-Path $filePath)) { Write-Host "  File not found: $filePath" -ForegroundColor Red; return 0 }
  $lines = Get-Content $filePath -Encoding UTF8 | Where-Object { $_ -ne "" }
  Write-Host "  $($lines.Count) records loaded from file"
  if ($lines.Count -eq 0) { return 0 }

  $BATCH = 300
  $totalInserted = 0

  for ($i = 0; $i -lt $lines.Count; $i += $BATCH) {
    $chunk = $lines[$i..([Math]::Min($i + $BATCH - 1, $lines.Count - 1))]
    $features = $chunk | ForEach-Object {
      $f = $_ | ConvertFrom-Json
      # geometry_json is already a parsed object (DuckDB embeds JSON natively)
      @{
        id       = $f.id
        geometry = $f.geometry_json
        name     = if ($f.PSObject.Properties['name']) { $f.name } else { $null }
        subtype  = if ($f.PSObject.Properties['subtype']) { $f.subtype } else { $null }
        class    = if ($f.PSObject.Properties['class']) { $f.class } else { $null }
        floors   = if ($f.PSObject.Properties['floors']) { $f.floors } else { $null }
        height   = if ($f.PSObject.Properties['height']) { $f.height } else { $null }
        category = if ($f.PSObject.Properties['category']) { $f.category } else { $null }
        website  = if ($f.PSObject.Properties['website']) { $f.website } else { $null }
        phone    = if ($f.PSObject.Properties['phone']) { $f.phone } else { $null }
        surface     = if ($f.PSObject.Properties['surface'])     { $f.surface }     else { $null }
        oneway      = if ($f.PSObject.Properties['oneway'])      { $f.oneway }      else { $null }
        housenumber = if ($f.PSObject.Properties['housenumber']) { $f.housenumber } else { $null }
        street      = if ($f.PSObject.Properties['street'])      { $f.street }      else { $null }
      }
    }

    $tmpIn  = [System.IO.Path]::GetTempFileName() + ".json"
    $tmpOut = [System.IO.Path]::GetTempFileName()
    @{ layer = $layer; features = $features } | ConvertTo-Json -Depth 20 -Compress | Set-Content $tmpIn -Encoding UTF8

    curl.exe -s -X POST $IMPORT_URL `
      -H "Authorization: Bearer $SVC_KEY" `
      -H "Content-Type: application/json" `
      --data-binary "@$tmpIn" -o $tmpOut --max-time 120

    $resultRaw = Get-Content $tmpOut -Raw -Encoding UTF8
    $result = $resultRaw | ConvertFrom-Json
    Remove-Item $tmpIn, $tmpOut -Force -ErrorAction SilentlyContinue

    $totalInserted += $result.inserted
    $pct = [Math]::Round(($i + $chunk.Count) / $lines.Count * 100)
    Write-Host "  [$pct%] batch inserted: $($result.inserted)" -ForegroundColor Gray
  }
  return $totalInserted
}

$total = 0
$tmpDir = $env:TEMP

# ─── WATER ───────────────────────────────────────────────────────────────────
Write-Host "`n[1/5] WATER" -ForegroundColor Cyan
$outFile = "$tmpDir\vm_water.ndjson"
$sql = @"
COPY (
  SELECT id,
    ST_AsGeoJSON(geometry) AS geometry_json,
    names.primary AS name,
    subtype, class
  FROM read_parquet('$S3/theme=base/type=water/*', hive_partitioning=1)
  WHERE $BBOX_FILTER
) TO '$($outFile.Replace('\','\\'))' (FORMAT JSON, ARRAY false);
"@
($INIT_SQL + "`n" + $sql) | & $DUCKDB 2>&1 | Out-Null
$total += Send-Ndjson "water" $outFile

# ─── LAND USE ────────────────────────────────────────────────────────────────
Write-Host "`n[2/5] LAND USE" -ForegroundColor Cyan
$outFile = "$tmpDir\vm_land_use.ndjson"
$sql = @"
COPY (
  SELECT id,
    ST_AsGeoJSON(geometry) AS geometry_json,
    subtype, class, surface
  FROM read_parquet('$S3/theme=base/type=land_use/*', hive_partitioning=1)
  WHERE $BBOX_FILTER
) TO '$($outFile.Replace('\','\\'))' (FORMAT JSON, ARRAY false);
"@
($INIT_SQL + "`n" + $sql) | & $DUCKDB 2>&1 | Out-Null
$total += Send-Ndjson "land_use" $outFile

# ─── PLACES ──────────────────────────────────────────────────────────────────
Write-Host "`n[3/5] PLACES" -ForegroundColor Cyan
$outFile = "$tmpDir\vm_places.ndjson"
$sql = @"
COPY (
  SELECT id,
    ST_AsGeoJSON(geometry) AS geometry_json,
    names.primary AS name,
    categories.primary AS category,
    confidence,
    websites[1] AS website,
    phones[1] AS phone
  FROM read_parquet('$S3/theme=places/type=place/*', hive_partitioning=1)
  WHERE $BBOX_FILTER
) TO '$($outFile.Replace('\','\\'))' (FORMAT JSON, ARRAY false);
"@
($INIT_SQL + "`n" + $sql) | & $DUCKDB 2>&1 | Out-Null
$total += Send-Ndjson "places" $outFile

# ─── ROADS ───────────────────────────────────────────────────────────────────
Write-Host "`n[4/5] ROADS" -ForegroundColor Cyan
$outFile = "$tmpDir\vm_roads.ndjson"
$sql = @"
COPY (
  SELECT id,
    ST_AsGeoJSON(geometry) AS geometry_json,
    names.primary AS name,
    class, subtype
  FROM read_parquet('$S3/theme=transportation/type=segment/*', hive_partitioning=1)
  WHERE $BBOX_FILTER
) TO '$($outFile.Replace('\','\\'))' (FORMAT JSON, ARRAY false);
"@
($INIT_SQL + "`n" + $sql) | & $DUCKDB 2>&1 | Out-Null
$total += Send-Ndjson "roads" $outFile

# ─── BUILDINGS (split 3×2) ───────────────────────────────────────────────────
Write-Host "`n[5/5] BUILDINGS (split 3x2)" -ForegroundColor Cyan
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

    $outFile = "$tmpDir\vm_buildings_$chunk.ndjson"
    $chunkFilter = "bbox.xmin < $be AND bbox.xmax > $bw AND bbox.ymin < $bn AND bbox.ymax > $bs"
    $sql = @"
COPY (
  SELECT id,
    ST_AsGeoJSON(geometry) AS geometry_json,
    names.primary AS name,
    subtype, class,
    TRY_CAST(num_floors AS INTEGER) AS floors,
    TRY_CAST(height AS DOUBLE) AS height
  FROM read_parquet('$S3/theme=buildings/type=building/*', hive_partitioning=1)
  WHERE $chunkFilter
) TO '$($outFile.Replace('\','\\'))' (FORMAT JSON, ARRAY false);
"@
    ($INIT_SQL + "`n" + $sql) | & $DUCKDB 2>&1 | Out-Null
    $total += Send-Ndjson "buildings" $outFile
    Remove-Item $outFile -Force -ErrorAction SilentlyContinue
  }
}

# ─── ADDRESSES (house numbers, split 3×2) ────────────────────────────────────
Write-Host "`n[6/6] ADDRESSES (house numbers, split 3x2)" -ForegroundColor Cyan
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

    $outFile = "$tmpDir\vm_addresses_$chunk.ndjson"
    $chunkFilter = "bbox.xmin < $be AND bbox.xmax > $bw AND bbox.ymin < $bn AND bbox.ymax > $bs"
    $sql = @"
COPY (
  SELECT id,
    ST_AsGeoJSON(geometry) AS geometry_json,
    house_number AS housenumber,
    street
  FROM read_parquet('$S3/theme=addresses/type=address/*', hive_partitioning=1)
  WHERE $chunkFilter
) TO '$($outFile.Replace('\','\\'))' (FORMAT JSON, ARRAY false);
"@
    ($INIT_SQL + "`n" + $sql) | & $DUCKDB 2>&1 | Out-Null
    $total += Send-Ndjson "addresses" $outFile
    Remove-Item $outFile -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "`nTotal inserted: $total" -ForegroundColor Green
