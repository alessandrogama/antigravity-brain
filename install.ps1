# Antigravity Second Brain - Windows Installer
# Run this ONCE from PowerShell:
#
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
#   .\install.ps1

$ErrorActionPreference = "Stop"
$ProjectDir = $PSScriptRoot

function Write-Ok($msg)      { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)    { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)     { Write-Host "  [ERROR] $msg" -ForegroundColor Red }
function Write-Section($msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------------" -ForegroundColor DarkGray
}

Clear-Host
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Magenta
Write-Host "    Antigravity Second Brain - Installer     " -ForegroundColor Magenta
Write-Host "  ============================================" -ForegroundColor Magenta
Write-Host ""

# Step 1 - Python
Write-Section "Step 1 - Python"
try {
    $pyVersion = & python --version 2>&1
    Write-Ok "$pyVersion found"
} catch {
    Write-Err "Python not found. Install from https://python.org"
    exit 1
}

# Step 2 - Virtual environment
Write-Section "Step 2 - Virtual environment"
$VenvDir    = Join-Path $ProjectDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip    = Join-Path $VenvDir "Scripts\pip.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "  Creating .venv..." -ForegroundColor DarkGray
    & python -m venv $VenvDir
    Write-Ok ".venv created at $VenvDir"
} else {
    Write-Ok ".venv already exists"
}

# Step 3 - Install dependencies
Write-Section "Step 3 - Dependencies"
Write-Host "  Installing from requirements.txt..." -ForegroundColor DarkGray
& $VenvPip install -r (Join-Path $ProjectDir "requirements.txt") --quiet
Write-Ok "Dependencies installed (google-genai)"

# Step 4 - Add project folder to user PATH
Write-Section "Step 4 - PATH (permanent, current user)"
$UserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$ProjectDir*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$UserPath;$ProjectDir", "User")
    Write-Ok "Added to user PATH: $ProjectDir"
    Write-Warn "Restart your terminal after install for PATH changes to take effect."
} else {
    Write-Ok "Already in user PATH"
}

# Step 5 - PowerShell execution policy
Write-Section "Step 5 - PowerShell execution policy"
$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq "Restricted" -or $policy -eq "Undefined") {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
    Write-Ok "Execution policy set to RemoteSigned"
} else {
    Write-Ok "Execution policy already set: $policy"
}

# Step 6 - PowerShell profile alias
Write-Section "Step 6 - PowerShell profile alias"
$ProfileDir = Split-Path $PROFILE -Parent
if (-not (Test-Path $ProfileDir)) {
    New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
}
if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

$Ps1Path    = Join-Path $ProjectDir "brain.ps1"
$AliasLine  = "function brain { & `"$Ps1Path`" @args }"
$ProfileRaw = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue

if ($ProfileRaw -notlike "*function brain*") {
    Add-Content $PROFILE ""
    Add-Content $PROFILE "# Antigravity Second Brain"
    Add-Content $PROFILE $AliasLine
    Write-Ok "Added 'brain' function to PowerShell profile"
} else {
    $updated = $ProfileRaw -replace "function brain \{[^}]*\}", $AliasLine
    Set-Content $PROFILE $updated
    Write-Ok "Updated 'brain' function in PowerShell profile"
}

# Step 7 - GEMINI_API_KEY
Write-Section "Step 7 - Gemini API Key"
$existingKey = [System.Environment]::GetEnvironmentVariable("GEMINI_API_KEY", "User")
if ($existingKey) {
    Write-Ok "GEMINI_API_KEY already configured"
} else {
    Write-Host "  Get your free key at: https://aistudio.google.com" -ForegroundColor DarkGray
    Write-Host ""
    $apiKey = Read-Host "  Paste your GEMINI_API_KEY (or press Enter to skip)"
    if ($apiKey) {
        [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", $apiKey, "User")
        Write-Ok "GEMINI_API_KEY saved to user environment (permanent)"
    } else {
        Write-Warn "Skipped. Set it later with:"
        Write-Host '    [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY","your-key","User")' -ForegroundColor DarkGray
    }
}

# Step 8 - brain.json
Write-Section "Step 8 - Brain file"
$BrainJson = Join-Path $ProjectDir "brain.json"
if (-not (Test-Path $BrainJson)) {
    '{"nodes":[],"edges":[],"meta":{"version":"2.0.0","scans":0}}' | Set-Content $BrainJson -Encoding UTF8
    Write-Ok "brain.json created"
} else {
    Write-Ok "brain.json already exists - keeping data"
}

# Done
Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Now reload your profile and test:" -ForegroundColor White
Write-Host "    . `$PROFILE" -ForegroundColor Cyan
Write-Host "    brain" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Common commands:" -ForegroundColor White
Write-Host "    brain scan .                  scan current folder" -ForegroundColor DarkGray
Write-Host "    brain scan-all                scan all registered projects" -ForegroundColor DarkGray
Write-Host "    brain register my-app .       register current folder" -ForegroundColor DarkGray
Write-Host "    brain projects                list all registered projects" -ForegroundColor DarkGray
Write-Host ""
