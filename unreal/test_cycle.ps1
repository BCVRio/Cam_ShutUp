# One round trip for the Unreal version: refresh unreal\NunheadGTA from the template, compile the game module, rebuild
# the NunheadGreen level with build_green.py, then run the game standalone for a while and save a screenshot.
#   powershell -File unreal\test_cycle.ps1                 (default: 45 s of play)
#   powershell -File unreal\test_cycle.ps1 -PlaySeconds 90 -SkipLevel   (reuse the saved level, just compile and play)
# Closes a running editor first (it holds the module DLL). Prints the game mode's log lines and the screenshot path.
param([int]$PlaySeconds = 45, [switch]$SkipLevel, [switch]$SkipBuild)
$ErrorActionPreference = 'Continue'
$unreal = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Join-Path $unreal 'NunheadGTA\NunheadGTA.uproject'
$bat = Join-Path $unreal 'NunheadGTA\OpenAndBuild.bat'
$L = Join-Path $unreal 'NunheadGTA\Saved\Logs\NunheadGTA.log'
$shot = Join-Path $unreal 'NunheadGTA\Saved\Screenshots\WindowsEditor\nunhead_auto.png'

$ed = Get-Process UnrealEditor -ErrorAction SilentlyContinue
if ($ed) { "closing the editor (pid $($ed.Id))"; $null = $ed.CloseMainWindow(); $w = 0; while (-not $ed.HasExited -and $w -lt 60) { Start-Sleep 2; $w += 2; $ed.Refresh() }; if (-not $ed.HasExited) { "the editor is still open (a dialog may be waiting): stopping here"; exit 2 } }

python -I (Join-Path $unreal 'create_project.py') | Select-String 'engine|MISSING'
$editor = (Get-Content $bat | Select-String '^set EDITOR=(.*)$').Matches[0].Groups[1].Value
$engine = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $editor)))
if (-not $SkipBuild) {
  & (Join-Path $engine 'Engine\Build\BatchFiles\Build.bat') NunheadGTAEditor Win64 Development -Project="$proj" -WaitMutex | Select-String 'error|Result:' | Where-Object { $_.Line -notmatch 'Attribute.h' }
  "BUILD EXIT CODE: $LASTEXITCODE"; if ($LASTEXITCODE -ne 0) { exit 3 }
  if (-not (Test-Path (Join-Path $unreal 'NunheadGTA\Binaries\Win64\UnrealEditor-NunheadGTA.dll'))) { 'no game module DLL after the build'; exit 3 }
}
if (-not $SkipLevel) {
  $t0 = Get-Date; & $bat; "LEVEL BUILD EXIT CODE: $LASTEXITCODE  elapsed $((Get-Date) - $t0)"
  Select-String -Path $L -Pattern 'LogPython: (Error|placed|cleared|blend|grass|pitch|game mode|street|texture|Nunhead Green built)|LogEditorPythonExecuter|GrassField|Failed to compile Material' | ForEach-Object { $_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)) }
}
"--- standalone game for $PlaySeconds s:"
if (Test-Path $shot) { Remove-Item $shot -Force }
$p = Start-Process -FilePath $editor -ArgumentList "`"$proj`"", '-game', '-windowed', '-resx=1920', '-resy=1080', '-log', '-ini:Game:[/Script/NunheadGTA.NunheadGameMode]:AutoScreenshotSeconds=25' -PassThru
$deadline = (Get-Date).AddSeconds(180); $ok = $false
while ((Get-Date) -lt $deadline) { Start-Sleep 5; if ($p.HasExited) { 'game exited early'; break }; if ((Test-Path $L) -and (Select-String -Path $L -Pattern 'LogNunhead: Nunhead Green\.' -Quiet)) { $ok = $true; break } }
if ($ok) { Start-Sleep $PlaySeconds }
Select-String -Path $L -Pattern 'LogNunhead|Bringing World|Error:|Ensure|Fatal' | Where-Object { $_.Line -notmatch 'LogShaderCompilers|LogTemp: Error|Error test|PixelStreaming|GetLastError|UnifiedErrorTest|FError' } | Select-Object -Last 40 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)) }
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force; 'game stopped' }
if (Test-Path $shot) { "screenshot: $shot" } else { 'no screenshot (the game needs about 30 s to get there)' }
