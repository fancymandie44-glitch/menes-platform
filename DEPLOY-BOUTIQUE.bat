@echo off
title DEPLOY BOUTIQUE + API (serveur central)
cd /d "%~dp0"

echo Sync dist...
node scripts\build-boutique.js
if errorlevel 1 (
  echo Echec du build dist. Verifie que Node.js est installe.
  pause
  exit /b 1
)

echo.
echo  ==========================================
echo    DEPLOIEMENT BOUTIQUE + API
echo  ==========================================
echo.
netlify deploy --prod --dir=dist
echo.
echo  BOUTIQUE: https://boutiquemenes.netlify.app
echo  API:      https://boutiquemenes.netlify.app/api/
pause
