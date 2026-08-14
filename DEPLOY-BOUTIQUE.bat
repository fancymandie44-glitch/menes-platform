@echo off
title DEPLOY BOUTIQUE + API (serveur central)
cd /d "%~dp0"

echo Sync dist...
if not exist dist mkdir dist
copy /Y index.html shop.css shop.js config.js paiement.html paiement.js livraison.html retours.html confidentialite.html netlify.toml _redirects robots.txt package.json dist\ >nul
if exist console.html copy /Y console.html console.js console.css dist\ >nul
xcopy /E /I /Y data dist\data >nul
if exist dist\api rmdir /s /q dist\api
mkdir dist\api
copy /Y api\*.js dist\api\ >nul
if exist dist\lib rmdir /s /q dist\lib
xcopy /E /I /Y lib dist\lib >nul

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
