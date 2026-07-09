---
name: microflex-feature
description: Développer une fonctionnalité MicroFlex générale ou spécifique à un tenant de bout en bout. Utiliser pour ajouter ou modifier un flux métier qui peut toucher contrats partagés, schéma Drizzle, API Express, services, permissions CASL, frontend React, feature flags, tests, documentation, Docker ou déploiement On-Premise.
---

# Feature MicroFlex de bout en bout

Lire `AGENTS.md`, rechercher la feature la plus proche et tracer le flux actuel avant toute modification.

## Cadrer

Définir :

- acteur, permission et portée agence/tenant ;
- état initial, action, résultat, refus et audit ;
- contrats API et compatibilité attendue ;
- impact offline, notification, comptabilité et exploitation ;
- nature standard, configurable ou spécifique à un client.

Si un petit écart client peut être exprimé par configuration, utiliser un feature flag typé. Ne créer une app dédiée sous `apps/` que pour une logique confidentielle ou contractuelle réellement isolée.

## Implémenter dans l'ordre

1. Ajouter ou faire évoluer les contrats, enums et schémas partagés sans dépendance applicative.
2. Concevoir une évolution DB compatible et un seed idempotent si nécessaire.
3. Implémenter la règle métier dans un service testable.
4. Ajouter la persistance avec transaction et scope tenant/agence.
5. Exposer une route mince avec validation, authentification, CASL, idempotence et audit appropriés.
6. Ajouter le service/hook frontend, les clés de requête et l'invalidation précise.
7. Construire l'UI avec tous les états et la protection de permission.
8. Ajouter logs, métriques, jobs ou documentation d'exploitation si le flux l'exige.

Ne pas réorganiser des modules sans rapport. Préserver les contrats existants ou documenter une migration explicite.

## Tester par le risque

- Unitaire : règle, validation, transitions, cas limites.
- Intégration : route, DB, autorisation, transaction et rollback.
- Sécurité : isolation tenant/agence, rôle interdit, entrée malveillante.
- Contrat : ledger, GL, schéma ou invariant inter-module.
- E2E : parcours utilisateur critique.

Pour toute logique de solde ou d'écriture, invoquer aussi `$microflex-finance-safety`. Pour une interface significative, invoquer aussi `$microflex-ui`.

## Terminer

Exécuter les tests ciblés, `npm run check` et `npm run build`. Mettre à jour README, `DEPLOY.md`, exemples d'environnement et CI si la feature modifie une commande, une variable, un livrable ou un déploiement. Résumer les migrations, flags, permissions et limites restantes.
