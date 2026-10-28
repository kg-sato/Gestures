param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$url = 'http://127.0.0.1:8765/'
function Test-Studio {
    try {
        $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $page.StatusCode -eq 200 -and $page.Content.Contains('Donut Lab')
    } catch { return $false }
}
try {
    if (-not (Test-Studio)) {
        $python = Join-Path $project '.venv\Scripts\python.exe'
        if (-not (Test-Path -LiteralPath $python)) { throw 'Run scripts\setup.ps1 in the Gestures folder first.' }
        $logs = Join-Path $project 'build\launcher'
        New-Item -ItemType Directory -Force $logs | Out-Null
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $server = Start-Process -FilePath $python -ArgumentList @('-u', ('"' + (Join-Path $project 'server.py') + '"'), '--port', '8765') -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$stamp-out.log") -RedirectStandardError (Join-Path $logs "$stamp-error.log") -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ($server.HasExited) { throw "Gestures could not start. Check $logs for details; port 8765 may already be in use." }
            if (Test-Studio) { $ready = $true; break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) {
            if (-not $server.HasExited) { Stop-Process -Id $server.Id }
            throw "Gestures did not become ready. Check $logs."
        }
    }
    if (-not $NoBrowser) { Start-Process $url }
    Write-Output "Gestures ready: $url"
} catch {
    if (-not $NoBrowser) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show($_.Exception.Message, 'Gestures') | Out-Null
    }
    throw
}

