@echo off
REM Inland Cutoff Guide - Start Script

color 0A
title Inland Cutoff Guide

cls
echo.
echo ====================================================
echo   INLAND CUTOFF GUIDE - Starting...
echo ====================================================
echo.

cd C:\Users\COBBLA\InlandCutoffWebApp

echo Starting backend...
start "Backend" cmd /k "cd backend && npm start"

timeout /t 3 /nobreak

echo Starting frontend...
start "Frontend" cmd /k "cd frontend && npm run dev"

timeout /t 3 /nobreak

echo.
echo Opening browser...
start http://localhost:3000

echo.
echo ====================================================
echo ✓ Application starting...
echo ✓ Backend:  http://localhost:3001
echo ✓ Frontend: http://localhost:3000
echo ====================================================
echo.
pause