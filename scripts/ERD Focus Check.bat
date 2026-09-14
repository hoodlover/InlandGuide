@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0erd-focus-check.ps1"
if errorlevel 1 pause
