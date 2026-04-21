# Antigravity Second Brain — PowerShell wrapper
# Runs brain_scan.py using the local .venv Python, passing all arguments through.
& "$PSScriptRoot\.venv\Scripts\python.exe" "$PSScriptRoot\src\brain_scan.py" @args
