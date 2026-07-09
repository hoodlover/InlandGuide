@echo off
title Inland Cutoff Guide - Allow Firewall Access

REM --- Self-elevate to Administrator if not already ---
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator permission...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ====================================================
echo   Allowing other PCs to reach the app on port 3001
echo ====================================================
echo.

REM Remove any old copy of the rule, then add a fresh one.
netsh advfirewall firewall delete rule name="Inland Cutoff Guide" >nul 2>&1
netsh advfirewall firewall add rule name="Inland Cutoff Guide" dir=in action=allow protocol=TCP localport=3001

echo.
echo Done. Coworkers should now be able to load the link.
echo.
pause
