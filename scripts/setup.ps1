param([switch]$SkipModel)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    if (!(Test-Path '.venv/Scripts/python.exe')) {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Python environment setup failed' }
    }
    & .\.venv\Scripts\python.exe -m pip install -r requirements.txt --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency setup failed' }
    npm.cmd ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'JavaScript dependency setup failed' }
    if (!$SkipModel) {
        & .\.venv\Scripts\python.exe scripts/setup_model.py
        if ($LASTEXITCODE -ne 0) { throw 'Hand model setup failed' }
    }
    Write-Host 'Gestures is ready. Double-click Start Gestures.cmd. Camera access remains on hold.'
} finally { Pop-Location }
