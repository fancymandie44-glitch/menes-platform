@echo off
title SAUVEGARDE MENES
cd /d "%~dp0"

echo.
echo  ==========================================
echo    SAUVEGARDE MENES (catalogue + code)
echo  ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  Installe Node.js d abord: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules\@netlify\blobs call npm install

echo  1/2  Export du catalogue live + ambassadeurs...
node tools\backup-live.js
if errorlevel 1 (
  echo  Echec export. Connecte-toi: netlify login
  pause
  exit /b 1
)

echo.
echo  2/2  Copie USB / Drive...
set DEST=%USERPROFILE%\Desktop\MENES-SAUVEGARDE
if not exist "%DEST%" mkdir "%DEST%"
if not exist "%DEST%\backups" mkdir "%DEST%\backups"
xcopy /E /I /Y backups "%DEST%\backups" >nul
copy /Y SAUVEGARDE.txt "%DEST%\SAUVEGARDE.txt" >nul
copy /Y BACKUP-TOUT.bat "%DEST%\BACKUP-TOUT.bat" >nul
copy /Y RESTAURER-CATALOGUE.bat "%DEST%\RESTAURER-CATALOGUE.bat" >nul

echo.
echo  OK. Dossier pret:
echo     %DEST%
echo.
echo  Copie ce dossier sur:
echo    - OneDrive / Google Drive  (le plus important)
echo    - une cle USB              (copie extra)
echo.
echo  Le CODE est aussi sur GitHub prive:
echo    https://github.com/fancymandie44-glitch/menes-platform
echo.
pause
