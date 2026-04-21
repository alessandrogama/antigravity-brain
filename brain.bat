@echo off
:: Antigravity Second Brain — CMD wrapper
:: Runs brain_scan.py using the local .venv Python, passing all arguments through.
"%~dp0.venv\Scripts\python.exe" "%~dp0src\brain_scan.py" %*
