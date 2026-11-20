# Ledger Maison

Comptabilité personnelle **locale** (Québec / Canada). Les montants et les dates ne sont jamais inventés par un modèle de langage. Réconciliation au cent près. Totaux = seulement les lignes validées sur un relevé réconcilié.

**Windows :** clone [fancymandie44-glitch/menes-platform](https://github.com/fancymandie44-glitch/menes-platform), puis `START-LEDGER.bat` (voir [LANCER-WINDOWS.md](LANCER-WINDOWS.md)). Tes relevés restent sur ton PC, pas sur le tunnel public.

## Lancer (développement)

Terminal 1 — moteur :

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
LEDGER_DATA=./data uvicorn ledger_maison.api:app --host 0.0.0.0 --port 8847
```

Terminal 2 — interface :

```bash
cd web
npm install
npm run dev
```

Ouvre [http://127.0.0.1:3847](http://127.0.0.1:3847). Premier mot de passe = coffre. TOTP proposé à l'installation (activable ensuite).

```bash
cd api && pytest
```

Les 8 banques canadiennes + carte + format inconnu + OFX + XLSX + PDF doivent réconcilier à 100 % sur les jeux synthétiques.

## Docker

```bash
docker compose up --build
```

API `8847`, web `3847`. Volume `ledger-data` : SQLite + relevés chiffrés AES-256-GCM.

## Marchés

Sans `MARKET_API_KEY` (Alpha Vantage), les actions affichent **indisponible**. L'or tente `api.gold-api.com`. Aucun prix n'est inventé.

## Docs

- [Risques de précision](docs/PRECISION.md)
- [Architecture et grand livre](docs/ARCHITECTURE.md)
- [Ajouter un gabarit de banque](docs/GABARIT_BANQUE.md)
