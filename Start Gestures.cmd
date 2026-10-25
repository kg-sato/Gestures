@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run scripts\setup.ps1 from PowerShell first.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8765 in your browser.
echo Camera access remains held until the overheating issue is checked.
".venv\Scripts\python.exe" server.py
pause
