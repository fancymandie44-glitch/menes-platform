# Architecture — Ledger Maison

## Couches

```
Navigateur (Next.js, fr-QC)
        │  JSON, cookie de session
API FastAPI
        │
Moteur d'extraction → réconciliation → classification → grand livre
        │
SQLite (cents INTEGER) + fichiers de relevés chiffrés AES-256-GCM
Journal d'audit append-only
```

## Grand livre

Chaque transaction validée et issue d’un relevé **réconcilié** produit deux écritures :

| Type | Débit | Crédit |
| --- | --- | --- |
| Dépense | `depense:catégorie` | compte bancaire |
| Revenu | compte bancaire | `revenu:catégorie` |
| Transfert | compte destination | compte source |
| Paiement de dette | `dette:…` | compte bancaire |

Les totaux du tableau de bord ne lisent **que** ces écritures.

## Schéma (tables)

- `users` — hash Argon2id, secret TOTP
- `accounts` — masque 4 derniers chiffres, type, devise
- `statements` — hash SHA-256 fichier, soldes, statut
- `transactions` — cents, date ISO, source (fichier/page/ligne), confiance, type
- `splits` — ventilation
- `journal_lines` — débit/crédit
- `audit_log` — append-only
- `rules` / `memory` — corrections
- `favorites` — titres de marché
- `fx_rates` — taux daté par transaction multi-devises

## Fichiers

Les originaux vont dans `data/uploads/*.enc`. La clé AES-256-GCM est dérivée du mot de passe (Argon2id).
