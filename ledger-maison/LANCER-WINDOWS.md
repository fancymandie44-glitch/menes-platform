# Ledger Maison sur ton ordinateur (Windows)

Le site public (`trycloudflare`) n’est **pas** ton installation. Tes relevés et ton mot de passe doivent rester **sur ton PC**.

Ce que tu as ouvert dans Chrome tout à l’heure disparaît avec le tunnel. Sur ton ordi tu recrées un coffre local (nouveau mot de passe, 8 caractères minimum).

## Méthode simple : Docker

1. Installe [Git](https://git-scm.com/download/win) et [Docker Desktop](https://www.docker.com/products/docker-desktop/). Ouvre Docker Desktop et attends qu’il soit vert.
2. Dans **PowerShell** :

```powershell
git clone https://github.com/fancymandie44-glitch/menes-platform.git
cd menes-platform
.\START-LEDGER.bat
```

Ou, dans le dossier `ledger-maison` : `.\lancer.ps1`.

Si Git demande un compte, connecte-toi avec GitHub (`fancymandie44-glitch`).

3. Chrome : [http://127.0.0.1:3847/connexion](http://127.0.0.1:3847/connexion)
4. Crée le coffre, puis **Import** → tes CSV / OFX / XLSX / PDF.

Pour arrêter : dans le même terminal, `Ctrl+C`.

Les données restent dans le volume Docker `ledger-data` (SQLite + fichiers chiffrés). Ce n’est **pas** le shop VGR.

## Sans Docker (Python + Node)

Installe [Python 3.12+](https://www.python.org/downloads/) (coche « Add python.exe to PATH ») et [Node.js 22 LTS](https://nodejs.org/).

Terminal 1 :

```powershell
cd menes-platform\ledger-maison\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
$env:LEDGER_DATA = ".\data"
uvicorn ledger_maison.api:app --host 127.0.0.1 --port 8847
```

Terminal 2 :

```powershell
cd menes-platform\ledger-maison\web
npm install
npm run build
npm start
```

Chrome : [http://127.0.0.1:3847/connexion](http://127.0.0.1:3847/connexion)

## Ne pas faire

- Ne mets pas tes vrais extraits sur un lien `trycloudflare`.
- N’importe pas tes relevés tant que tu n’es pas sur `127.0.0.1`.
