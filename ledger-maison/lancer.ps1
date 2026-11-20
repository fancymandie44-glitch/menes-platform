# Lance Ledger Maison sur Windows (Docker Desktop).
# Double-clic ou : clic droit → Exécuter avec PowerShell
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Installe Docker Desktop, ouvre-le, puis relance ce script."
  Write-Host "https://www.docker.com/products/docker-desktop/"
  exit 1
}

docker compose up --build
Write-Host "Ouvre Chrome : http://127.0.0.1:3847/connexion"
