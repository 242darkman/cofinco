---
name: microflex-code-quality
description: Auditer, corriger ou refactoriser du code MicroFlex sans changer inutilement son comportement. Utiliser pour une revue de qualité, une dette technique, un fichier devenu complexe, des imports ou types fragiles, une duplication, un découpage de module, ou avant de finaliser un changement transversal dans apps/web, apps/api ou packages/shared.
---

# Qualité du code MicroFlex

Lire d'abord `AGENTS.md`, puis limiter l'audit au périmètre demandé et à ses dépendances directes.

## Examiner

1. Identifier la responsabilité métier et la couche du code.
2. Rechercher les implémentations voisines avant de proposer un nouveau pattern.
3. Vérifier les frontières : web et API peuvent dépendre de `packages/shared`, jamais l'inverse ; web et API ne dépendent pas l'un de l'autre.
4. Repérer duplication, état implicite, effets de bord cachés, fonctions longues, erreurs avalées, chaînes métier littérales, `any`, assertions risquées et imports profonds.
5. Distinguer défaut réel, préférence stylistique et dette hors périmètre.

## Corriger

- Préserver le comportement public sauf demande contraire.
- Garder les routes minces, les règles métier dans les services et la persistance dans la couche storage existante.
- Réutiliser les contrats, enums et constantes de `packages/shared`.
- Préférer une fonction nommée et testable à une abstraction générique prématurée.
- Remplacer `any` par un type précis ou `unknown` validé.
- Rendre les erreurs et effets de bord explicites ; conserver le contexte utile dans le logger structuré.
- Découper par responsabilité métier, pas par taille arbitraire.
- Ne pas nettoyer les zones sans rapport ni reformater massivement le dépôt.

## Contrôler les risques

- Pour l'API, vérifier validation, authentification, autorisation et scope agence/tenant.
- Pour le frontend, vérifier chargement, vide, erreur, permission, accessibilité et réseau faible.
- Pour le partagé, vérifier l'absence de dépendance navigateur, Express, DB ou secret.
- Pour la finance, invoquer aussi `$microflex-finance-safety`.

## Valider

Exécuter au minimum :

```bash
npm run check
npx vitest run <tests-concernés>
```

Exécuter `npm run build` si les imports, le frontend, l'API, le packaging ou la configuration changent. Présenter les constats par gravité lors d'une revue ; lors d'une correction, résumer le comportement préservé, les validations et les limites restantes.
