@echo off
title SOL 500 - Mars Outpost
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   SOL 500 needs Node.js to host games on your network.
  echo   Download the LTS version from https://nodejs.org, install it, then double-click this file again.
  echo.
  pause
  exit /b 1
)
echo.
echo   Starting SOL 500... your browser will open in a moment.
echo   Keep this window open while you play. Close it to stop the game server.
node server.js --open
pause
