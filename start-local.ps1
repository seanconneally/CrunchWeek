param([string]$Model = 'qwen2.5:1.5b')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$command = Get-Command ollama -ErrorAction SilentlyContinue
$ollamaPath = if ($command) { $command.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' }
if (-not (Test-Path -LiteralPath $ollamaPath)) {
    throw 'Install Ollama from https://ollama.com/download/windows, then run this launcher again.'
}
$ready = $false
try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 3; $ready = $true } catch {}
if (-not $ready) {
    Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        Start-Sleep -Seconds 1
        try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2; $ready = $true; break } catch {}
    }
    if (-not $ready) { throw 'Ollama did not start. Open Ollama and try the launcher again.' }
}
if ($Model -match 'cloud|\s' -or [string]::IsNullOrWhiteSpace($Model)) { throw 'Choose a local model name without spaces or a cloud tag.' }
$models = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
if (-not ($models.models.name -contains $Model)) {
    Write-Host "Downloading $Model once. The default 1.5B model is about 986 MB."
    & $ollamaPath pull $Model
    if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Retry this launcher when your connection is available.' }
}
$env:CHAT_AI_PROVIDER = 'ollama'
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_MODEL = $Model
Write-Host 'Scheduling chat uses the model on this computer, with no paid-provider fallback.'
Write-Host 'Document extraction keeps its separately configured provider and consent flow.'
& (Join-Path $PSScriptRoot 'start.ps1')
