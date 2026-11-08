param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$url = 'http://127.0.0.1:8765/'
function Test-Studio {
    try {
        $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($page.StatusCode -ne 200 -or -not $page.Content.Contains('Gestures')) { return $false }
        # An older server can serve the updated HTML but lack its new module routes.
        foreach ($module in @('effect-input.js','camera-effects.js')) {
            $script = Invoke-WebRequest -Uri ($url + $module) -UseBasicParsing -TimeoutSec 2
            if ($script.StatusCode -ne 200 -or -not $script.Content.Contains('export class ')) { return $false }
        }
        return $true
    } catch { return $false }
}
try {
    if (-not (Test-Studio)) {
        $python = Join-Path $project '.venv\Scripts\python.exe'
        if (-not (Test-Path -LiteralPath $python)) { throw 'Run scripts\setup.ps1 in the Gestures folder first.' }
        $serverPath = Join-Path $project 'server.py'
        $listeners = @(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' })
        foreach ($listener in $listeners) {
            $candidate = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $listener.OwningProcess) -ErrorAction Stop
            # Never stop another project's server, including wildcard listeners on the same port.
            if ($candidate.Name -in @('python.exe','pythonw.exe') -and
                $candidate.CommandLine.Contains('"' + $serverPath + '"') -and
                $candidate.CommandLine -match '--port\s+8765(?:\s|$)') {
                Stop-Process -Id $candidate.ProcessId -ErrorAction Stop
            }
        }
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

