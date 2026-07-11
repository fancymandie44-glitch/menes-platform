@echo off
title DEPLOY ADMIN MENES (separe du site boutique)
cd /d "%~dp0\.."

set OUT=%TEMP%\menes-admin-deploy
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"

copy /Y admin-site\index.html "%OUT%\index.html" >nul
copy /Y console.css "%OUT%\console.css" >nul
copy /Y console.js "%OUT%\console.js" >nul
copy /Y config.js "%OUT%\config.js" >nul
copy /Y admin-site\netlify.toml "%OUT%\netlify.toml" >nul

echo.
echo  ==========================================
echo    DEPLOIEMENT ADMIN (separe)
echo  ==========================================
echo.
echo  Ce deploie UNIQUEMENT la console admin.
echo  Les donnees/API restent sur boutiquemenes.netlify.app
echo.

cd "%OUT%"
netlify deploy --prod --dir=. --site 08319485-a74a-43cf-949c-6df3a4b594d0

echo.
echo  ADMIN: https://menesadmin.netlify.app
echo  API:   https://boutiquemenes.netlify.app
pause
