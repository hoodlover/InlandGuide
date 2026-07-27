@echo off
REM ===================================================================
REM   INLAND CUTOFF GUIDE - Scheduled auto-publish (hourly, 9am-3pm)
REM   Reads the master workbook, rebuilds the guide, and pushes to
REM   GitHub so Vercel redeploys. Run by Windows Task Scheduler while
REM   you are logged in. Safe to double-click to publish right now.
REM   All detail is appended to auto-publish.log in this folder.
REM ===================================================================
cd /d "%~dp0"

echo. >> auto-publish.log
echo ==== AutoPublish %DATE% %TIME% ==== >> auto-publish.log

call node scripts\auto-publish\run.mjs >> auto-publish.log 2>&1
if errorlevel 1 (
  echo FAILED %DATE% %TIME% - see auto-publish.log
  echo FAILED %DATE% %TIME% >> auto-publish.log
  exit /b 1
)

echo SUCCESS - check complete; a live update is published only when rail data changed.
echo SUCCESS %DATE% %TIME% - check complete >> auto-publish.log
exit /b 0
