@echo off
title DEPLOY MENES GRILLZ (page tarifs A-Z - PAS la boutique)
cd /d "%~dp0\.."

set OUT=%TEMP%\menes-grillz-deploy
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
mkdir "%OUT%\assets"

REM IMPORTANT: deploie UNIQUEMENT grillz-site/ (page prix originale)
REM Ne JAMAIS copier index.html / shop.js / shop.css de la boutique ici.
copy /Y grillz-site\index.html "%OUT%\index.html" >nul
copy /Y grillz-site\styles.css "%OUT%\styles.css" >nul
copy /Y grillz-site\app.js "%OUT%\app.js" >nul
copy /Y grillz-site\netlify.toml "%OUT%\netlify.toml" >nul
copy /Y grillz-site\_redirects "%OUT%\_redirects" >nul
copy /Y grillz-site\assets\*.* "%OUT%\assets\" >nul

echo.
echo  ==========================================
echo    DEPLOIEMENT MENES GRILLZ (tarifs A-Z)
echo  ==========================================
echo.
echo  Site: menesjewelrygrillzprice.netlify.app
echo  Type: grille de prix complete + formulaire commande
echo  Source: grillz-site/ UNIQUEMENT (pas la boutique)
echo.

cd "%OUT%"
netlify deploy --prod --dir=. --site f106aff8-4721-4774-b3c1-465aed77c48a --message "Restore original MENES Grillz A-Z price page"

echo.
echo  GRILLZ: https://menesjewelrygrillzprice.netlify.app
echo  ADMIN:  https://menesadmin.netlify.app
pause
