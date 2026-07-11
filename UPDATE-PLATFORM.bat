@echo off
title MENES Platform - Mise a jour
cd /d "%~dp0"
echo.
echo  Creation du deploy MENES Platform...
powershell -Command "Remove-Item 'menes-platform-deploy.zip' -Force -ErrorAction SilentlyContinue; Compress-Archive -Path 'store','admin','data','api','netlify.toml' -DestinationPath 'menes-platform-deploy.zip' -Force"
echo.
echo  OK! Glisse menes-platform-deploy.zip sur Netlify Drop
echo  ou sur ton site Netlify existant (Deploys)
echo.
start index.html 2>nul
start https://app.netlify.com/drop
explorer /select,"%CD%\menes-platform-deploy.zip"
pause
