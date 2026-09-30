# Renders slides.html to VisEvi-presentation.pdf using headless Edge or Chrome.
# Fill in the team name and members in slides.html first, then run:
#   powershell -ExecutionPolicy Bypass -File docs\presentation\build-pdf.ps1
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Join-Path $here 'slides.html'
$pdf = Join-Path $here 'VisEvi-presentation.pdf'
$browser = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'Install Edge or Chrome, or open slides.html and use Print > Save as PDF (background graphics on, margins none).' }
# A private browser profile, so this never touches your normal browser session.
$userDataDir = Join-Path $env:TEMP 'visevi-pdf-profile'
$url = ([System.Uri]$html).AbsoluteUri
& $browser --headless=new --disable-gpu --no-first-run "--user-data-dir=$userDataDir" --no-pdf-header-footer --virtual-time-budget=5000 "--print-to-pdf=$pdf" $url | Out-Null
if (Test-Path $pdf) { "Wrote $pdf" } else { throw 'PDF was not created.' }
