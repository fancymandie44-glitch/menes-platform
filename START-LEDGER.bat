@echo off
cd /d "%~dp0"
where git >nul 2>&1
if not errorlevel 1 git pull origin master
call "%~dp0ledger-maison\START-LEDGER.bat"
