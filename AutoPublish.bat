@echo off
REM ===================================================================
REM   INLAND CUTOFF GUIDE - Compatibility launcher
REM   The one canonical watcher is scripts\publish-master-watch.ps1.
REM   Windows Task Scheduler runs it every 10 minutes, 8am-5pm, while
REM   COBBLA is signed in. Safe to double-click for an in-window check.
REM ===================================================================
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish-master-watch.ps1"
exit /b %ERRORLEVEL%
