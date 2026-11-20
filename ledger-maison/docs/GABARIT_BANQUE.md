# Ajouter un gabarit de banque (10 minutes)

1. Ouvre `api/ledger_maison/extract/templates.py`.
2. Copie un `BankTemplate` existant (ex. Desjardins).
3. Remplis :
   - `bank_id` / `bank_name`
   - `header_needles` : mots du relevé (`"banque xyz"`)
   - `date_keys`, `debit_keys`, `credit_keys` ou `amount_keys`, `balance_keys`, `label_keys` : en-têtes de colonnes
   - `date_prefer`: `"dmy"` au Canada
   - `signed_amount_is_debit_when_positive`: `True` si une seule colonne Montant, positif = sortie
4. Ajoute un CSV synthétique dans `api/tests/fixtures_banks.py` (solde d'ouverture + colonnes + solde courant).
5. Ajoute le nom de fichier dans `test_eight_banks_and_unknown_reconcile` ou un test dédié.
6. Lance `pytest` dans `api/`. La réconciliation doit balancer **au cent près**.

Le LLM n'entre pas dans le gabarit. Il ne sert qu'à proposer une catégorie, jamais un montant.
