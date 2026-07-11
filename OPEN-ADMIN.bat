@echo off
title MENES Admin
cd /d "%~dp0"
echo Demarrage admin + boutique...
start http://localhost:8888/admin/
if not exist server.js (
  start "" "%~dp0admin\index.html"
  exit
)
curl -s http://localhost:8888/admin/ >nul 2>&1
if errorlevel 1 (
  start /B node server.js
  timeout /t 2 /nobreak >nul
)
start http://localhost:8888/admin/
