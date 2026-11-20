@echo off
title Ledger Maison - local
cd /d "%~dp0ledger-maison"
echo.
echo  ==========================================
echo    LEDGER MAISON - sur ton PC seulement
echo  ==========================================
echo.
echo  Chrome va ouvrir http://127.0.0.1:3847/connexion
echo  Cree un mot de passe (8 caracteres min).
echo  N importe PAS tes releves tant que tu n es pas sur 127.0.0.1
echo.
where docker >nul 2>&1
if errorlevel 1 (
  echo  Installe Docker Desktop puis relance ce fichier.
  echo  https://www.docker.com/products/docker-desktop/
  start https://www.docker.com/products/docker-desktop/
  pause
  exit /b 1
)
start http://127.0.0.1:3847/connexion
docker compose up --build
