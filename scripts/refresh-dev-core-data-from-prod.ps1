param(
  [switch]$SkipApply
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$generatedDir = Join-Path $projectRoot 'sql\dev\generated'
$timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$outputFile = Join-Path $generatedDir "${timestamp}_seed_core_data_from_prod.sql"
$coreTables = @(
  'public.organizations',
  'public.centers',
  'public.uoms',
  'public.categories',
  'public.providers',
  'public.materials',
  'public.inventory'
)

$truncateTables = @(
  'public.inventory',
  'public.materials',
  'public.providers',
  'public.categories',
  'public.uoms',
  'public.centers'
)

function Read-DotEnvFile {
  param(
    [string]$Path
  )

  $values = @{}

  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()

    if (-not $line -or $line.StartsWith('#')) {
      continue
    }

    $separatorIndex = $line.IndexOf('=')
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

function Get-ConfigValue {
  param(
    [string]$Name,
    [hashtable[]]$Sources
  )

  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if ($processValue) {
    return $processValue
  }

  foreach ($source in $Sources) {
    if ($source.ContainsKey($Name) -and $source[$Name]) {
      return $source[$Name]
    }
  }

  return $null
}

function Get-LocalExecutable {
  param(
    [string]$CommandName,
    [string]$FallbackPath
  )

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command) {
    if ($command.PSObject.Properties['Source']) {
      return $command.Source
    }

    return $command.Path
  }

  if (Test-Path -LiteralPath $FallbackPath) {
    return $FallbackPath
  }

  throw "No se encontro $CommandName en PATH ni en $FallbackPath."
}

$envSources = @(
  (Read-DotEnvFile -Path (Join-Path $projectRoot '.env.development.local')),
  (Read-DotEnvFile -Path (Join-Path $projectRoot '.env.production.local')),
  (Read-DotEnvFile -Path (Join-Path $projectRoot '.env.local'))
)

$prodDbUrl = Get-ConfigValue -Name 'SUPABASE_DB_URL_PROD' -Sources $envSources
$devDbUrl = Get-ConfigValue -Name 'SUPABASE_DB_URL_DEV' -Sources $envSources

if (-not $prodDbUrl) {
  throw 'No se encontro SUPABASE_DB_URL_PROD en los .env locales.'
}

if (-not $devDbUrl) {
  throw 'No se encontro SUPABASE_DB_URL_DEV en los .env locales.'
}

$psqlExecutable = Get-LocalExecutable -CommandName 'psql' -FallbackPath (Join-Path $projectRoot '.tools\psql\psql.exe')

function Invoke-PsqlCapture {
  param(
    [string]$DbUrl,
    [string]$Sql
  )

  $args = @(
    "--dbname=$DbUrl",
    '--tuples-only',
    '--no-align',
    '--quiet',
    '--pset', 'pager=off',
    '--command', $Sql
  )

  $output = & $psqlExecutable @args

  if ($LASTEXITCODE -ne 0) {
    throw 'psql no pudo completar la consulta solicitada.'
  }

  return ($output -join [Environment]::NewLine).Trim()
}

function Get-TableColumns {
  param(
    [string]$TableName
  )

  $parts = $TableName.Split('.', 2)
  $schemaName = $parts[0]
  $baseName = $parts[1]
  $sql = @"
select json_agg(
  json_build_object(
    'name', column_name,
    'data_type', data_type,
    'udt_name', udt_name
  )
  order by ordinal_position
)
from information_schema.columns
where table_schema = '$schemaName'
  and table_name = '$baseName';
"@

  $raw = Invoke-PsqlCapture -DbUrl $prodDbUrl -Sql $sql
  if (-not $raw) {
    throw "No se pudieron leer columnas para $TableName."
  }

  return @((ConvertFrom-Json $raw) | ForEach-Object { $_ })
}

function Get-TablePrimaryKeyColumns {
  param(
    [string]$TableName
  )

  $sql = @"
select coalesce(json_agg(a.attname order by a.attnum), '[]'::json)
from pg_index i
join pg_attribute a
  on a.attrelid = i.indrelid
 and a.attnum = any(i.indkey)
where i.indrelid = '$TableName'::regclass
  and i.indisprimary;
"@

  $raw = Invoke-PsqlCapture -DbUrl $prodDbUrl -Sql $sql
  if (-not $raw) {
    return @()
  }

  return @((ConvertFrom-Json $raw) | ForEach-Object { $_ })
}

function ConvertTo-SqlLiteral {
  param(
    [AllowNull()]
    $Value,
    [string]$DataType,
    [string]$UdtName
  )

  if ($null -eq $Value) {
    return 'NULL'
  }

  if ($Value -is [bool]) {
    return $(if ($Value) { 'TRUE' } else { 'FALSE' })
  }

  if ($DataType -in @('smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision', 'decimal')) {
    return ([string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0}', $Value))
  }

  if ($DataType -eq 'json' -or $DataType -eq 'jsonb') {
    $jsonText = if ($Value -is [string]) { $Value } else { $Value | ConvertTo-Json -Compress -Depth 100 }
    return "'$($jsonText.Replace("'", "''"))'"
  }

  if ($DataType -eq 'ARRAY' -or (($UdtName -as [string]) -and $UdtName.StartsWith('_'))) {
    $arrayText = if ($Value -is [string]) { $Value } else { '{' + (($Value | ForEach-Object { $_.ToString() }) -join ',') + '}' }
    return "'$($arrayText.Replace("'", "''"))'"
  }

  $text = [string]$Value
  return "'$($text.Replace("'", "''"))'"
}

function Export-TableDataWithPsql {
  param(
    [string]$TableName,
    [string]$DestinationPath,
    [switch]$UsePrimaryKeyUpsert,
    [string[]]$ConflictColumns = @()
  )

  $columns = @((Get-TableColumns -TableName $TableName) | ForEach-Object { $_ })
  $primaryKeyColumns = @((Get-TablePrimaryKeyColumns -TableName $TableName) | ForEach-Object { $_ })
  $columnNames = @($columns | ForEach-Object { $_.name })
  $quotedColumnList = ($columnNames | ForEach-Object { '"' + $_ + '"' }) -join ', '
  $orderByClause = if ($primaryKeyColumns.Count -gt 0) {
    ' order by ' + (($primaryKeyColumns | ForEach-Object { '"' + $_ + '"' }) -join ', ')
  } else {
    ''
  }

  $sql = "select coalesce(json_agg(t), '[]'::json) from (select * from $TableName$orderByClause) t;"
  $rawRows = Invoke-PsqlCapture -DbUrl $prodDbUrl -Sql $sql

  if (-not $rawRows -or $rawRows -eq '[]') {
    return
  }

  $rows = @((ConvertFrom-Json $rawRows) | ForEach-Object { $_ })
  foreach ($row in $rows) {
    $values = foreach ($column in $columns) {
      ConvertTo-SqlLiteral -Value $row.($column.name) -DataType $column.data_type -UdtName $column.udt_name
    }

    $insertLine = "INSERT INTO $TableName ($quotedColumnList) VALUES ($($values -join ', '))"
    $effectiveConflictColumns = if ($ConflictColumns.Count -gt 0) {
      $ConflictColumns
    } elseif ($UsePrimaryKeyUpsert -and $primaryKeyColumns.Count -gt 0) {
      $primaryKeyColumns
    } else {
      @()
    }

    if ($effectiveConflictColumns.Count -gt 0) {
      $protectedColumns = @($primaryKeyColumns + $effectiveConflictColumns | Select-Object -Unique)
      $updatableColumns = @($columns | Where-Object { $_.name -notin $protectedColumns } | ForEach-Object { $_.name })
      $conflictColumnsSql = ($effectiveConflictColumns | ForEach-Object { '"' + $_ + '"' }) -join ', '

      if ($updatableColumns.Count -gt 0) {
        $updateAssignments = ($updatableColumns | ForEach-Object { '"' + $_ + '" = EXCLUDED."' + $_ + '"' }) -join ', '
        $insertLine += " ON CONFLICT ($conflictColumnsSql) DO UPDATE SET $updateAssignments"
      } else {
        $insertLine += " ON CONFLICT ($conflictColumnsSql) DO NOTHING"
      }
    }

    $insertLine += ';'
    Add-Content -LiteralPath $DestinationPath -Value $insertLine -Encoding UTF8
  }
}

New-Item -ItemType Directory -Force -Path $generatedDir | Out-Null

$header = @(
  '-- Generated locally from production core data.',
  "-- Source: production / Generated at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  '-- Tables: organizations, centers, uoms, categories, providers, materials, inventory',
  'BEGIN;',
  "TRUNCATE TABLE $($truncateTables -join ', ') RESTART IDENTITY CASCADE;",
  ''
)

Set-Content -LiteralPath $outputFile -Value $header -Encoding UTF8

Write-Host 'Exportando datos base desde production...'
foreach ($tableName in $coreTables) {
  Write-Host "  -> $TableName"
  $usePrimaryKeyUpsert = $tableName -eq 'public.organizations'
  $conflictColumns = if ($tableName -eq 'public.inventory') {
    @('material_id', 'center_id')
  } else {
    @()
  }

  Export-TableDataWithPsql `
    -TableName $tableName `
    -DestinationPath $outputFile `
    -UsePrimaryKeyUpsert:$usePrimaryKeyUpsert `
    -ConflictColumns $conflictColumns
}

Add-Content -LiteralPath $outputFile -Value @('', 'COMMIT;', '') -Encoding UTF8

Write-Host "Seed generado en: $outputFile"

if ($SkipApply) {
  Write-Host 'SkipApply activo. No se aplicaron cambios en development.'
  exit 0
}

Write-Host 'Aplicando seed en development...'
& $psqlExecutable "--dbname=$devDbUrl" -v ON_ERROR_STOP=1 -f $outputFile

if ($LASTEXITCODE -ne 0) {
  throw 'psql no pudo aplicar el seed en development.'
}

Write-Host 'Restaurando layout de POS en development (3 barras y 12 mesas)...'
$posLayoutSql = @"
insert into public.tables (number, status)
select v.number, 'libre'
from (values
  ('Barra 1'), ('Barra 2'), ('Barra 3'),
  ('Mesa 1'), ('Mesa 2'), ('Mesa 3'), ('Mesa 4'), ('Mesa 5'), ('Mesa 6'),
  ('Mesa 7'), ('Mesa 8'), ('Mesa 9'), ('Mesa 10'), ('Mesa 11'), ('Mesa 12')
) as v(number)
where not exists (
  select 1
  from public.tables t
  where t.number = v.number
);

update public.tables
set status = 'libre',
    current_order_id = null,
    active_order_id = null
where number in (
  'Barra 1', 'Barra 2', 'Barra 3',
  'Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6',
  'Mesa 7', 'Mesa 8', 'Mesa 9', 'Mesa 10', 'Mesa 11', 'Mesa 12'
);
"@

& $psqlExecutable "--dbname=$devDbUrl" -v ON_ERROR_STOP=1 --command=$posLayoutSql

if ($LASTEXITCODE -ne 0) {
  throw 'psql no pudo restaurar el layout de POS en development.'
}

Write-Host 'Development actualizado con datos base de production.'
