# Risques de précision — Ledger Maison

Les relevés bancaires sont la source de vérité. Un LLM n’est jamais la source d’un montant ou d’une date.

## Risques

| Risque | Effet | Contre-mesure |
| --- | --- | --- |
| Float IEEE | 0,10 + 0,20 ≠ 0,30 | Entiers en **cents** uniquement. |
| LLM qui « invente » un montant | Totaux faux | Chaque montant doit apparaître **littéralement** dans le texte source, sinon ligne `a_verifier`. |
| OCR qui lit 8 pour 3 | Écart de solde | Double extraction quand possible ; divergence → `conflit`. Réconciliation au cent près. |
| Signe inversé (CR/DR, parenthèses) | Revenu vs dépense | Gabarits par banque + contrôles de signe. Ligne suspecte listée si le relevé ne balance pas. |
| Date JJ/MM vs MM/JJ | Mauvaise période | Gabarit canadien (JJ/MM) ; dates ISO en interne ; ambiguïté → `a_verifier`. |
| Format `1 234,56` vs `1,234.56` | Facteur 1000 | Parseurs déterministes, tests des deux formes. |
| Doublon d’import | Double comptage | SHA-256 du fichier + empreinte date+cents+libellé+compte. |
| Transfert interne compté deux fois | Revenu/dépense fictifs | Type `transfert` exclu des totaux ; appariement des deux jambes. |
| Relevés consécutifs | Trou de solde | Continuité : fermeture N = ouverture N+1. |
| Totaux trop tôt | Incertitude cachée | Seules les lignes **validées et réconciliées** entrent dans le grand livre. Bandeau d’incertitude. |

## Ordre d’extraction

1. CSV / OFX / QFX / XLSX — parseur déterministe.
2. PDF texte — pdfplumber, gabarits, montants littéraux.
3. PDF scanné / image — OCR, puis le même parseur.
4. LLM (optionnel) — structure de colonnes ou **catégorie** seulement. Jamais le montant final.
