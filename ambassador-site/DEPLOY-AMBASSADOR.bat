@echo off
title DEPLOY MENES AMBASSADOR PWA
cd /d "%~dp0"
echo.
echo  ==========================================
echo    DEPLOIEMENT MENES AMBASSADOR
echo  ==========================================
echo.
echo  Site: menesambassador (PAS la boutique)
echo.

REM Always pin the Ambassador site ID — never deploy to boutiquemenes by accident
netlify deploy --prod --dir=. --site b704859b-8921-4864-a7ab-4c4d7ed236ef

echo.
echo  URL: https://menesambassador.netlify.app
echo  API: https://boutiquemenes.netlify.app
pause
