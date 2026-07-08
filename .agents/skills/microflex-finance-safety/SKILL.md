---
name: microflex-finance-safety
description: Implémenter ou auditer les flux financiers et comptables critiques de MicroFlex. Utiliser dès qu'un changement touche montant, solde, ledger, mouvement, écriture GL, caisse, coffre, crédit, remboursement, frais, transfert, tontine, décaissement, rapprochement, rollback, idempotence ou concurrence.
---

# Sûreté financière MicroFlex

Lire `AGENTS.md` et considérer toute opération monétaire comme critique. Ne modifier aucun solde avant d'avoir identifié le ledger, la transaction PostgreSQL, l'écriture comptable et l'audit associés.

## Cartographier l'opération

Établir explicitement :

- déclencheur, acteur autorisé et scope agence/tenant ;
- comptes ou caisses débités et crédités ;
- montant, devise, frais et règle d'arrondi ;
- états avant/après et transitions interdites ;
- clé d'idempotence et comportement lors d'une répétition ;
- écriture GL, preuve d'audit et événement émis ;
- stratégie de rollback, réconciliation et reprise après panne.

## Implémenter les invariants

- Réutiliser Decimal et les utilitaires monétaires existants ; ne pas calculer avec des flottants natifs.
- Utiliser les helpers de ledger autorisés ; ne jamais écrire directement un solde.
- Exécuter tous les effets liés dans une transaction PostgreSQL unique.
- Verrouiller ou conditionner les écritures exposées à la concurrence.
- Refuser montant non fini, nul ou négatif lorsque le domaine ne l'autorise pas.
- Conserver l'équilibre débit/crédit et le lien mouvement-écriture.
- Rendre l'opération idempotente avant d'ajouter un retry.
- Maintenir le mode GL strict. Ne pas élargir une allowlist pour contourner une erreur.
- Journaliser l'identifiant et le résultat sans exposer de donnée sensible.

## Tester avant de conclure

Couvrir au minimum :

1. succès nominal et soldes exacts ;
2. arrondi et bornes ;
3. fonds insuffisants ou transition interdite ;
4. double soumission et répétition après succès ;
5. échec intermédiaire avec rollback complet ;
6. concurrence lorsque plusieurs opérations ciblent le même solde ;
7. écriture GL et piste d'audit ;
8. scope agence/tenant et rôle interdit.

Exécuter :

```bash
npm run check
npx vitest run <tests-unitaires-et-intégration-concernés>
npm run gl:contracts
```

Exécuter les tests avec PostgreSQL lorsque le chemin de production dépend réellement de la DB. Ne jamais déclarer le flux sûr si seuls les mocks ont été testés. Documenter toute hypothèse comptable ou risque résiduel.
