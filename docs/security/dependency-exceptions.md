# Exceptions temporaires de dépendances

Les exceptions ci-dessous sont contrôlées par `npm run security:audit`. Une exception expirée ou une nouvelle vulnérabilité haute/critique bloque la CI.

## `xlsx` — expiration le 7 août 2026

- Avis : `GHSA-4r6h-8v6p-xvw6` et `GHSA-5pgg-2g8v-p4x9`.
- Motif : la version npm publique utilisée par l'application ne fournit pas de correctif et la bibliothèque alimente actuellement plusieurs exports comptables et opérationnels.
- Exposition réduite : ne jamais utiliser `xlsx` pour importer un classeur non fiable ; limiter son usage à la génération de fichiers depuis des données internes validées.
- Sortie attendue : migrer les exports vers une bibliothèque maintenue, vérifier la compatibilité navigateur/Node et couvrir au minimum les exports comptables, paie et caisse.
- Responsable : équipe plateforme MicroFlex.

Cette exception n'autorise pas son renouvellement silencieux. Avant l'échéance, elle doit être supprimée après migration ou prolongée par une décision de risque documentée et approuvée.
