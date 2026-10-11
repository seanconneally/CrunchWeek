$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    Write-Host 'Creating Python environment...'
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 or later is required.' }
}
& '.\.venv\Scripts\python.exe' -m pip install -r requirements.lock
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
if (-not (Test-Path -LiteralPath 'frontend\dist\index.html')) {
    Push-Location -LiteralPath 'frontend'
    try {
        npm ci --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Node dependency installation failed.' }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'React build failed.' }
    } finally { Pop-Location }
}
Write-Host 'Open http://127.0.0.1:8000 . Press Ctrl+C to stop.'
& '.\.venv\Scripts\python.exe' -m uvicorn crunch_week.api:app --host 127.0.0.1 --port 8000
