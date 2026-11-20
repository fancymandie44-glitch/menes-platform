@echo off
title Ledger Maison
cd /d "%~dp0"

if exist "..\START-LEDGER.bat" if exist "docker-compose.yml" goto :in_ledger
if exist "ledger-maison\docker-compose.yml" (
  cd /d "%~dp0ledger-maison"
)

:in_ledger
echo.
echo  ==========================================
echo    LEDGER MAISON - sur ton PC
echo  ==========================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo  Docker n est pas dans le PATH. Ouvre Docker Desktop, attends le vert, relance.
  start "" "https://www.docker.com/products/docker-desktop/"
  pause
  exit /b 1
)

echo  Attente de Docker Desktop...
set /a n=0
:wait_docker
docker info >nul 2>&1
if not errorlevel 1 goto :docker_ok
set /a n+=1
if %n% GEQ 40 (
  echo  Docker ne repond pas. Ouvre Docker Desktop et relance ce fichier.
  pause
  exit /b 1
)
timeout /t 3 /nobreak >nul
goto :wait_docker

:docker_ok
echo  Docker pret. Construction et demarrage (1re fois: quelques minutes)...
docker compose up --build -d
if errorlevel 1 (
  echo  Echec du demarrage. Relance Docker Desktop puis ce fichier.
  pause
  exit /b 1
)

echo  Attente de l interface...
set /a n=0
:wait_web
curl -s -o nul -m 2 http://127.0.0.1:3847/connexion
if not errorlevel 1 goto :open
set /a n+=1
if %n% GEQ 60 (
  echo  L interface ne repond pas. Logs :
  docker compose logs --tail 40
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto :wait_web

:open
start http://127.0.0.1:3847/connexion
echo.
echo  Ouvert : http://127.0.0.1:3847/connexion
echo  Cree un mot de passe (8 caracteres min), puis Import tes releves.
echo  Laisse cette fenetre ouverte. Ctrl+C n arrete pas Docker.
echo  Pour arreter : docker compose down
echo.
docker compose logs -f
