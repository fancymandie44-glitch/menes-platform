@echo off
title MENES - ZIP avec Paiements
cd /d "%~dp0"

set OUT=%TEMP%\menes-pay
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
copy /Y index.html shop.css shop.js paiement.html paiement.js console.html console.css console.js admin.html admin.css admin.js livraison.html retours.html confidentialite.html netlify.toml _redirects "%OUT%\" >nul
xcopy /E /I /Y data "%OUT%\data" >nul
xcopy /E /I /Y api "%OUT%\api" >nul
xcopy /E /I /Y lib "%OUT%\lib" >nul

powershell -Command "Remove-Item 'MENES-VETEMENTS.zip' -Force -ErrorAction SilentlyContinue; Compress-Archive -Path '%OUT%\*' -DestinationPath 'MENES-VETEMENTS.zip' -Force"
explorer /select,"%CD%\MENES-VETEMENTS.zip"
echo.
echo  ZIP pret avec systeme de paiement!
echo  Glisse sur Netlify Deploys
pause
