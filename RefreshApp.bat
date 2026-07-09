@echo off
title Inland Cutoff Guide - Refresh
color 0A
cls
echo ====================================================
echo   INLAND CUTOFF GUIDE - Refresh
echo   Re-reads the Excel on Z: and rebuilds the app file
echo ====================================================
echo.

cd /d "%~dp0"

echo [1/3] Reading data + banners...
node backend\refresh-data.js
if errorlevel 1 goto error

echo.
echo [2/3] Building single-file app...
cd frontend
call npm run build
if errorlevel 1 goto error
cd ..

echo.
echo [3/3] Packaging InlandCutoffGuide.html...
copy /Y frontend\dist\index.html InlandCutoffGuide.html >nul
if errorlevel 1 goto error

echo.
echo ====================================================
echo   DONE. Updated: InlandCutoffGuide.html
echo   Copy that file to Z: (or re-upload) to share it.
echo ====================================================
echo.
pause
exit /b 0

:error
echo.
echo ****************************************************
echo   ERROR: refresh failed. See the messages above.
echo ****************************************************
echo.
pause
exit /b 1
