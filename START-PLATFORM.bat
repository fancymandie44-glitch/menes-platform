@echo off
title MENES VETEMENTS - PRET A UTILISER
cd /d "%~dp0"
echo.
echo  ==========================================
echo    MENES VETEMENTS - Demarrage
echo  ==========================================
echo.
echo  Mot de passe admin: variable ADMIN_PASSWORD (Netlify / env)
echo  Aucun mot de passe par defaut — configure ADMIN_PASSWORD avant.
echo.
start http://localhost:8888/console/
timeout /t 2 /nobreak >nul
start http://localhost:8888/store/
node server.js
