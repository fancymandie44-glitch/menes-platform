@echo off
title DEPLOY MENES GRILLZ (projet Netlify separe)
cd /d "%~dp0\.."

set OUT=%TEMP%\menes-grillz-deploy
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"

copy /Y index.html shop.css shop.js paiement.html paiement.js livraison.html retours.html confidentialite.html grillz-site\netlify.toml "%OUT%\" >nul
copy /Y grillz-site\config.js "%OUT%\config.js" >nul
xcopy /E /I /Y data "%OUT%\data" >nul

echo.
echo  ==========================================
echo    DEPLOIEMENT MENES GRILLZ
echo  ==========================================
echo.
echo  Site: menesjewelrygrillzprice.netlify.app
echo  API:  boutiquemenes.netlify.app (donnees admin)
echo  SITE_ID: grillz
echo.

cd "%OUT%"
netlify deploy --prod --dir=. --site f106aff8-4721-4774-b3c1-465aed77c48a

echo.
echo  GRILLZ: https://menesjewelrygrillzprice.netlify.app
echo  ADMIN:  https://menesadmin.netlify.app (selectionne MENES Grillz)
pause
