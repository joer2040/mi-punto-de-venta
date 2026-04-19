param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('dev', 'prod')]
  [string]$Environment,

  [Parameter(Mandatory = $true)]
  [string]$File,

  [switch]$AllowProduction
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot

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

$envFiles = if ($Environment -eq 'dev') {
  @(
    (Join-Path $projectRoot '.env.development.local'),
    (Join-Path $projectRoot '.env.local')
  )
} else {
  @(
    (Join-Path $projectRoot '.env.production.local'),
    (Join-Path $projectRoot '.env.local')
  )
}

$envSources = @()
foreach ($envFile in $envFiles) {
  $envSources += Read-DotEnvFile -Path $envFile
}

$dbUrlVariable = if ($Environment -eq 'dev') { 'SUPABASE_DB_URL_DEV' } else { 'SUPABASE_DB_URL_PROD' }
$dbUrl = Get-ConfigValue -Name $dbUrlVariable -Sources $envSources

if (-not $dbUrl) {
  throw "No se encontro $dbUrlVariable. Agregalo a tu archivo .env local o a las variables de entorno de la sesion."
}

if ($Environment -eq 'prod' -and -not $AllowProduction) {
  throw 'Produccion requiere confirmacion explicita. Vuelve a correr el comando usando -AllowProduction.'
}

$filePath = if ([System.IO.Path]::IsPathRooted($File)) {
  $File
} else {
  Join-Path $projectRoot $File
}

$resolvedFile = Resolve-Path -LiteralPath $filePath -ErrorAction Stop
$psqlCommand = Get-Command psql -ErrorAction SilentlyContinue
$localPsqlPath = Join-Path $projectRoot '.tools\psql\psql.exe'

if (-not $psqlCommand -and (Test-Path -LiteralPath $localPsqlPath)) {
  $psqlCommand = Get-Item -LiteralPath $localPsqlPath
}

if (-not $psqlCommand) {
  throw 'No se encontro psql en PATH ni en .tools\\psql\\psql.exe. Instala Postgres client tools para ejecutar SQL remoto desde terminal.'
}

Write-Host "Aplicando SQL a $Environment usando $($resolvedFile.Path)..."
$psqlExecutable = if ($psqlCommand.PSObject.Properties['Source']) { $psqlCommand.Source } else { $psqlCommand.FullName }

& $psqlExecutable $dbUrl -v ON_ERROR_STOP=1 -f $resolvedFile.Path

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host 'SQL aplicado correctamente.'
