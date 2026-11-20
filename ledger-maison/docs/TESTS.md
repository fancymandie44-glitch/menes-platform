# Rapport de tests

Commande : `cd api && pytest`

Résultat : **12 passed**.

- Formats `1 234,56` / `1,234.56` / `(50.00)` / CR / DR
- Dates JJ/MM, ISO, « 15 janvier 2026 »
- Réconciliation **au cent près** : Desjardins, RBC, TD, BMO, Scotia, CIBC, Nationale, Tangerine, format inconnu, Visa
- OFX TD, XLSX CIBC, PDF Desjardins
- Relevés déséquilibrés → `NON RÉCONCILIÉ`, écart en cents
- Doublons fichier SHA-256 et empreinte de ligne
- Conflit de double extraction
- Classification Hydro-Québec / paie
- Grand livre : chaque type d'écriture débite = crédite
