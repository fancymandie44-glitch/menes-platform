@echo off
title RESTAURER CATALOGUE MENES
cd /d "%~dp0"

echo.
echo  Ca renvoie le DERNIER backup (photos + produits + codes promo)
echo  vers la boutique en ligne.
echo.
pause

where node >nul 2>&1
if errorlevel 1 (
  echo  Installe Node.js d abord: https://nodejs.org
  pause
  exit /b 1
)

if not exist backups\LATEST-catalogue.json (
  echo  Aucun backup trouve dans backups\
  pause
  exit /b 1
)

if not exist node_modules\@netlify\blobs call npm install
node tools\restore-live.js
echo.
pause
