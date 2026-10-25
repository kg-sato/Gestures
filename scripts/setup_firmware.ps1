param([switch]$SkipCompile)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'
$cliVersion = '1.5.1'
$coreVersion = '3.3.12'
$cliArchiveName = "arduino-cli_${cliVersion}_Windows_64bit.zip"
$cliArchiveSha256 = 'fabe42e0eb04d00e776a66178299ff95a46c623dbc260f997e58fd514853dd40'
$cliArchiveUrl = "https://github.com/arduino/arduino-cli/releases/download/v${cliVersion}/${cliArchiveName}"
$coreIndexUrl = 'https://espressif.github.io/arduino-esp32/package_esp32_index.json'
$cliRoot = Join-Path $toolsRoot "arduino-cli-$cliVersion"
$cliExecutable = Join-Path $cliRoot 'arduino-cli.exe'
$archivePath = Join-Path $toolsRoot $cliArchiveName
$configPath = Join-Path $toolsRoot 'arduino-cli.json'
$buildRoot = Join-Path $projectRoot 'build/firmware'
$logPath = Join-Path $buildRoot 'build.log'

New-Item -ItemType Directory -Force $toolsRoot,$cliRoot,$buildRoot | Out-Null
if (!(Test-Path -LiteralPath $archivePath)) {
    Write-Host "Downloading official Arduino CLI $cliVersion into this project..."
    Invoke-WebRequest -Uri $cliArchiveUrl -OutFile $archivePath
}
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $cliArchiveSha256) {
    throw "Arduino CLI archive checksum mismatch. Expected $cliArchiveSha256; got $actualHash. Archive was not executed."
}
if (!(Test-Path -LiteralPath $cliExecutable)) {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $cliRoot -Force
}

# All core packages, staging downloads and sketchbook state stay project-local.
$configuration = @{
    board_manager = @{ additional_urls = @($coreIndexUrl) }
    build_cache = @{ path = (Join-Path $toolsRoot 'arduino-cache') }
    metrics = @{ enabled = $false }
    updater = @{ enable_notification = $false }
    directories = @{
        data = (Join-Path $toolsRoot 'arduino-data')
        downloads = (Join-Path $toolsRoot 'arduino-downloads')
        user = (Join-Path $toolsRoot 'arduino-user')
    }
}
$configuration | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding utf8
foreach ($directory in $configuration.directories.Values) {
    New-Item -ItemType Directory -Force $directory | Out-Null
}
"Arduino CLI $cliVersion; Espressif Arduino core $coreVersion; board esp32:esp32:esp32cam" |
    Set-Content -LiteralPath $logPath -Encoding utf8
"CLI source: $cliArchiveUrl`nCLI archive SHA256: $actualHash" |
    Add-Content -LiteralPath $logPath -Encoding utf8

function Invoke-Arduino {
    param([string[]]$CliArguments)
    & $cliExecutable --config-file $configPath @CliArguments 2>&1 |
        Tee-Object -FilePath $logPath -Append | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "Arduino CLI command failed (exit $LASTEXITCODE): $($CliArguments -join ' '). See $logPath"
    }
}

Invoke-Arduino -CliArguments @('version')
Invoke-Arduino -CliArguments @('core','update-index')
Invoke-Arduino -CliArguments @('core','install',"esp32:esp32@$coreVersion")

$boardDetails = & $cliExecutable --config-file $configPath board details --fqbn esp32:esp32:esp32cam --format json
if ($LASTEXITCODE -ne 0) { throw 'Could not verify AI-Thinker ESP32-CAM board metadata' }
$boardDetails | Set-Content -LiteralPath (Join-Path $buildRoot 'board-details.json') -Encoding utf8

@{
    arduino_cli_version = $cliVersion
    arduino_cli_archive_sha256 = $actualHash
    arduino_cli_source = $cliArchiveUrl
    esp32_core_version = $coreVersion
    esp32_core_index = $coreIndexUrl
    fqbn = 'esp32:esp32:esp32cam'
    hardware_accessed = $false
} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $buildRoot 'toolchain.json') -Encoding utf8

if (!$SkipCompile) {
    $intermediatePath = Join-Path $buildRoot 'intermediate'
    $artifactPath = Join-Path $buildRoot 'artifacts'
    New-Item -ItemType Directory -Force $intermediatePath,$artifactPath | Out-Null
    Invoke-Arduino -CliArguments @('compile','--fqbn','esp32:esp32:esp32cam',
        '--build-path',$intermediatePath,'--output-dir',$artifactPath,
        '--jobs','2',(Join-Path $projectRoot 'firmware/GesturesCamera'))
    Write-Host "Firmware compile succeeded. Artifacts: $artifactPath"
}
Write-Host 'No ports were scanned, no camera was opened, and nothing was flashed.'
