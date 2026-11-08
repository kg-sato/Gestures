param(
    [string]$ProjectRoot = (Split-Path $PSScriptRoot -Parent),
    [string]$SkillRoot = (Join-Path $HOME '.agents\skills'),
    [string]$OutputRoot = '',
    [switch]$SkipInspector
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not $OutputRoot) { $OutputRoot = Join-Path $ProjectRoot 'build\frontend-skills' }
$runRoot = Join-Path $OutputRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Force $runRoot | Out-Null
$runRoot = (Resolve-Path -LiteralPath $runRoot).Path
$serverProcess = $null
$oldUrl = $env:GESTURES_TEST_URL
$checks = [ordered]@{}
$failure = $null
function Run-Check([string]$Name, [string]$Executable, [string[]]$Arguments) {
    $logPath = Join-Path $runRoot "$Name.log"
    & $Executable @Arguments 2>&1 | Out-File -LiteralPath $logPath -Encoding utf8
    $code = $LASTEXITCODE
    $checks[$Name] = @{exitCode=$code;log=$logPath}
    if ($code -ne 0) { throw "$Name failed (exit $code). See $logPath" }
}
try {
    foreach ($required in @('tests\effects-browser.mjs','models\hand_landmarker.task','node_modules\playwright-core\package.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $required))) { throw "Missing existing prerequisite: $required. Run the documented project setup separately." }
    }
    $pythonPath = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $pythonPath)) { $pythonPath = (Get-Command python -ErrorAction Stop).Source }
    Run-Check 'ux-dragging-guidance' $pythonPath @((Join-Path $SkillRoot 'ui-ux-pro-max\scripts\search.py'),'dragging movements','--domain','ux')
    $lintLog = Join-Path $runRoot 'taste-lint.json'
    & node (Join-Path $SkillRoot 'design-taste-frontend\scripts\lint.mjs') (Join-Path $ProjectRoot 'web') --json 2> (Join-Path $runRoot 'taste-lint-error.log') | Out-File -LiteralPath $lintLog -Encoding utf8
    $lintCode = $LASTEXITCODE
    $lintReport = Get-Content -LiteralPath $lintLog -Raw | ConvertFrom-Json
    if ($lintCode -notin @(0,1) -or $null -eq $lintReport) { throw 'Taste lint did not produce a valid report' }
    $checks['taste-lint'] = @{exitCode=$lintCode;status=$(if($lintCode -eq 0){'passed'}else{'review-required'});report=$lintLog}
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
    $probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
    $url = "http://127.0.0.1:$port/"
    $serverProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-u',('"' + (Join-Path $ProjectRoot 'server.py') + '"'),'--port',"$port") -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runRoot 'server.log') -RedirectStandardError (Join-Path $runRoot 'server-error.log') -PassThru
    $ready = $false
    for ($attempt=0; $attempt -lt 60; $attempt++) {
        if ($serverProcess.HasExited) { throw 'Owned test server exited before readiness; see server-error.log' }
        try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1; if ($response.StatusCode -eq 200) { $ready=$true; break } } catch {}
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) { throw 'Owned test server did not become ready' }
    $env:GESTURES_TEST_URL = $url
    Push-Location $runRoot
    try {
        Run-Check 'effects-browser' 'node' @((Join-Path $ProjectRoot 'tests\effects-browser.mjs'))
        if (-not $SkipInspector) {
            $inspectRoot = Join-Path $runRoot 'inspection'
            & node (Join-Path $SkillRoot 'design-taste-frontend\scripts\inspect.mjs') $url --app --out $inspectRoot --widths 1440,768,390 --json 2> (Join-Path $runRoot 'taste-inspector-error.log') | Out-File (Join-Path $runRoot 'taste-inspector-output.json') -Encoding utf8
            $inspectCode = $LASTEXITCODE
            $reportPath = Join-Path $inspectRoot 'report.json'
            if (-not (Test-Path -LiteralPath $reportPath)) { throw 'Taste inspector did not produce rendered evidence' }
            $renderedReport = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
            if ($inspectCode -notin @(0,1) -or $renderedReport.viewports.Count -ne 3) { throw 'Taste inspector did not complete all three widths' }
            $checks['taste-inspector'] = @{exitCode=$inspectCode;status=$(if($inspectCode -eq 0){'passed'}else{'review-required'});report=$reportPath}
        } else { $checks['taste-inspector'] = @{status='unverified';reason='Explicitly skipped'} }
    } finally { Pop-Location }
} catch { $failure=$_.Exception.Message; Write-Warning $failure }
finally {
    $env:GESTURES_TEST_URL=$oldUrl
    if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue; $serverProcess.WaitForExit(5000) | Out-Null }
    $summary = @{status=$(if($failure){'failed'}else{'behavior-passed-review-findings-separate'});project=$ProjectRoot;checks=$checks;failure=$failure;generatedCamera=$true;physicalWebcamVerified=$false;physicalDeviceVerified=$false;output=$runRoot}
    $summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $runRoot 'summary.json') -Encoding utf8
    $summary | ConvertTo-Json -Depth 5 | Write-Output
}
if ($failure) { exit 1 }
exit 0
