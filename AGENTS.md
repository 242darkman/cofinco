# AGENTS.md — Règles de développement MicroFlex

Ce fichier est la référence opérationnelle pour toute intervention humaine ou assistée par IA dans ce dépôt. Le lire avant toute tâche et appliquer les règles du fichier `AGENTS.md` le plus proche des fichiers modifiés si des règles locales sont ajoutées ultérieurement.

## 1. Objectif général

MicroFlex est un produit financier B2B destiné au SaaS et au déploiement On-Premise. Toute évolution doit préserver en priorité :

1. l'intégrité financière et comptable ;
2. la sécurité, l'isolation des clients et la traçabilité ;
3. la maintenabilité et la lisibilité ;
4. la compatibilité des déploiements existants ;
5. la capacité à ajouter des fonctionnalités sans dupliquer le cœur métier.

Ne jamais sacrifier ces invariants pour livrer plus vite. Une solution simple, explicite et testable est préférable à une abstraction prématurée.

## 2. Stack et structure de référence

- Monorepo npm workspaces, TypeScript strict, Node.js 20+.
- Frontend : React 19, Vite, TanStack Query et Tailwind CSS.
- Backend : Express, PostgreSQL, Drizzle ORM et WebSocket.
- Autorisation : CASL avec RBAC/ABAC côté serveur.
- Tests : Vitest pour les tests unitaires, d'intégration, de sécurité et de contrat ; Playwright pour l'E2E.

Arborescence canonique :

```text
apps/web/          application React standard
apps/api/          API, workers, services et accès aux données
packages/shared/   contrats, schémas, types et règles partagés
mobile/            application mobile autonome
tests/             tests transversaux et de contrat
seeds/             données de référence idempotentes
scripts/           opérations et diagnostics
infra/             infrastructure de déploiement
```

Les anciens chemins `client/`, `server/` et `shared/` ne sont plus valides. Ne pas les réintroduire dans le code, les tests, Docker, les scripts ou la documentation.

## 3. Frontières du monorepo

Respecter le sens des dépendances :

```text
apps/web ─┐
          ├──> packages/shared
apps/api ─┘
```

- `packages/shared` ne dépend jamais de `apps/web`, `apps/api`, du DOM, d'Express ou d'une infrastructure Node spécifique.
- `apps/web` ne dépend jamais de fichiers internes de `apps/api`. Il communique avec l'API par des contrats explicites.
- `apps/api` ne dépend jamais de composants ou d'utilitaires propres au navigateur.
- Le code partagé doit être réellement portable et ne contenir ni secret, ni accès réseau, ni accès direct à la base.
- Utiliser `@/` pour le frontend et `@shared/` pour le partagé. L'alias historique `server/` est toléré dans les tests existants, mais ne doit pas être introduit dans du nouveau code.
- Éviter les chemins relatifs profonds et les imports contournant l'API publique d'un module.
- Toute nouvelle dépendance doit avoir un besoin clair. Réutiliser une dépendance existante quand elle convient.

## 4. Architecture par fonctionnalité

Organiser les évolutions autour du domaine métier concerné : clients, crédits, caisse, comptabilité, tontines, RH, notifications, etc.

- Étendre le dossier de la fonctionnalité existante avant de créer un dossier générique.
- Garder les routes et contrôleurs minces : validation, autorisation, appel du service, transformation de la réponse.
- Placer les règles métier dans des services nommés selon leur responsabilité.
- Isoler les requêtes Drizzle et la persistance dans la couche `storage` ou le module de données existant.
- Placer les contrats, enums, états et schémas utilisés par plusieurs applications dans `packages/shared`.
- Côté React, séparer affichage, orchestration, accès réseau et état serveur. Les appels API réutilisables appartiennent aux services/hooks, pas au milieu des composants.
- Ne pas créer de fichier fourre-tout `utils.ts`, `helpers.ts` ou `common.ts` lorsque le comportement appartient à un domaine identifiable.
- Lorsqu'un fichier devient difficile à comprendre, le découper par responsabilité sans inventer une architecture parallèle.

## 5. Multi-tenant, marque blanche et feature flags

La stratégie de long terme est hybride : monorepo pour l'isolation structurelle, configuration et feature flags pour les variations standard.

### Variations standard

- Utiliser la configuration centralisée du tenant et `packages/shared/tenant-config.ts`.
- Côté web, consommer la configuration via le contexte tenant existant ; ne pas coder les logos, couleurs, noms de marque ou capacités client en dur.
- Un petit écart client — thème, libellé, module activé, plafond configurable — doit être une configuration ou un feature flag typé.
- Les valeurs par défaut doivent conserver le comportement standard quand une nouvelle clé est absente.
- Un feature flag contrôle l'exposition d'une capacité, mais ne remplace jamais l'autorisation serveur.
- Éviter les conditions dispersées telles que `tenantId === "client-x"`. Centraliser la décision et tester les deux états du flag.

### Clients On-Premise spécifiques

- Créer une application dédiée dans `apps/` seulement lorsqu'une exigence contractuelle, confidentielle ou métier ne peut pas être exprimée proprement par configuration.
- Une application dédiée réutilise les packages communs mais garde sa logique propriétaire hors du cœur standard.
- Le livrable d'un client ne doit inclure ni configuration secrète ni logique propriétaire d'un autre client.
- Toute image Docker dédiée doit être construite depuis un point d'entrée explicite et vérifiée séparément en CI.
- Ne jamais copier une application entière pour quelques différences visuelles ou fonctionnelles.

## 6. TypeScript, contrats et qualité du code

- Conserver le mode strict. Ne pas neutraliser une erreur avec `any`, `@ts-ignore` ou une assertion non justifiée.
- Préférer `unknown` avec validation explicite aux données externes non typées.
- Définir une source de vérité unique pour les statuts, rôles, permissions, devises et constantes métier.
- Réutiliser les enums et schémas de `packages/shared`; ne pas dupliquer des chaînes métier dans le frontend et le backend.
- Valider toutes les entrées non fiables aux frontières du système.
- Nommer selon le métier. Une fonction réalise une responsabilité et rend ses effets de bord visibles.
- Éviter les booléens ambigus, les nombres magiques et les chaînes de statut littérales.
- Supprimer le code mort au lieu de le commenter. Un commentaire explique une contrainte ou une décision, pas la syntaxe.
- Ne pas effectuer de refactorisation sans rapport avec la tâche dans le même changement.
- Préserver les API publiques ou fournir une migration explicite et testée.

## 7. Règles frontend

- Utiliser des composants fonctionnels et des hooks React.
- Garder l'état serveur dans TanStack Query et l'état local au plus près de son usage.
- Centraliser les clés de requête et invalider précisément les données après mutation.
- Toujours représenter les états chargement, vide, erreur, succès et absence de permission.
- Préserver l'accessibilité : labels, navigation clavier, focus, sémantique HTML et contrastes.
- Préserver les contraintes réseau faible et hors ligne déjà présentes. Ne pas considérer qu'une requête réussira immédiatement.
- Utiliser les composants UI et tokens existants avant d'ajouter une variante locale.
- Ne pas exposer de secret dans le bundle Vite. Toute variable frontend est publique par nature.
- Une feature cachée dans l'interface doit également être protégée dans l'API.

## 8. Règles API et sécurité

- Authentifier puis autoriser chaque opération sensible côté serveur.
- Appliquer les scopes tenant/agence/utilisateur dans les requêtes, pas seulement après lecture des données.
- Ne jamais faire confiance à un identifiant de tenant, rôle, agence ou utilisateur fourni par le client.
- Valider les paramètres, le corps et les fichiers avant tout effet de bord.
- Utiliser les middlewares existants pour l'authentification, CASL, l'idempotence, les limites et l'audit.
- Ne jamais journaliser mot de passe, OTP, token, cookie, clé API, document KYC complet ou donnée bancaire sensible.
- Utiliser le logger structuré existant plutôt que `console.log` dans le code applicatif.
- Conserver des messages d'erreur externes sobres ; journaliser le diagnostic détaillé côté serveur avec le contexte non sensible.
- Ne jamais stocker de secret dans Git. Documenter uniquement son nom dans les fichiers `.env.example`.
- Toute modification des permissions doit mettre à jour les mappings, seeds et tests RBAC associés.

## 9. Finance, comptabilité et transactions

Les montants, soldes, écritures et statuts financiers sont des invariants critiques.

- Ne jamais utiliser les flottants JavaScript pour un calcul monétaire critique. Réutiliser les utilitaires monétaires/Decimal existants.
- Ne jamais modifier directement un solde en dehors des services de ledger autorisés.
- Une opération composée doit être atomique : transaction PostgreSQL, rollback complet en cas d'échec.
- Toute opération réessayable doit être idempotente et protégée contre les doublons.
- Chaque mouvement financier doit conserver son lien d'audit et, lorsqu'applicable, sa contrepartie comptable.
- Ne pas contourner le mode GL strict ni élargir une allowlist comptable sans justification et test de contrat.
- Tester les arrondis, bornes, répétitions, concurrence, rollback et réconciliation.
- Un changement de calcul financier exige au minimum un test de non-régression avec des valeurs métier explicites.

## 10. PostgreSQL, Drizzle et seeds

- `packages/shared/schema` est la source de vérité du schéma Drizzle.
- Toute évolution de schéma doit être compatible avec les données existantes et les déploiements progressifs.
- Éviter les changements destructifs directs. Préférer ajouter, migrer les données, basculer le code, puis supprimer lors d'une étape ultérieure.
- Indexer les nouvelles requêtes critiques et vérifier leur portée tenant/agence.
- Ne pas exécuter de SQL concaténé avec des valeurs utilisateur.
- Les seeds de production doivent être idempotents, déterministes et sûrs à rejouer.
- Une nouvelle valeur de référence ou permission implique la mise à jour du seed et de sa validation.
- Ne jamais lancer de reset, suppression massive ou migration destructive sans demande explicite et sauvegarde vérifiée.

## 11. Tests obligatoires

Toute correction de bug doit commencer ou se terminer par un test qui échouerait sans la correction. Toute nouvelle fonctionnalité doit tester son comportement nominal et ses principaux refus.

Choisir le niveau adapté :

- unitaire : règle métier pure, formatage, validation, état ;
- intégration : route, service avec persistance, autorisation, transaction ;
- contrat : comptabilité, schéma ou invariant inter-module ;
- sécurité : contrôle d'accès, isolation, validation, régression sensible ;
- E2E : parcours utilisateur critique traversant plusieurs couches.

Avant de déclarer une tâche terminée, exécuter au minimum :

```bash
npm run check
npx vitest run <tests-concernés>
```

Puis, selon la portée :

```bash
npm run build              # frontend, API, config, imports ou packaging
npm run test:unit          # changement partagé ou transversal
npm run test:integration   # routes, DB, transactions ou autorisations
npm run test:security      # auth, RBAC/ABAC, tenant, fichiers ou données sensibles
npm run gl:contracts       # soldes, mouvements, ledger ou comptabilité
npm run test:e2e           # parcours utilisateur critique
```

- Ne jamais annoncer qu'un test passe s'il n'a pas été exécuté.
- Signaler clairement les tests non exécutables et la dépendance manquante, par exemple PostgreSQL ou un service externe.
- Ne pas supprimer, ignorer ou assouplir un test pour faire passer la CI sans corriger la cause.
- Les tests doivent être déterministes et ne pas dépendre de leur ordre d'exécution.

## 12. Observabilité et exploitation

- Journaliser les événements utiles avec un identifiant de corrélation quand il existe.
- Ajouter métriques et alertes pour une nouvelle tâche critique, un worker ou un point de défaillance silencieux.
- Les jobs planifiés doivent être idempotents, observables et protégés contre l'exécution concurrente si nécessaire.
- Prévoir timeouts, retries bornés et comportement de repli pour les fournisseurs externes.
- Maintenir les healthchecks, Dockerfiles et fichiers Compose lorsque le démarrage ou le packaging change.
- Ne pas ajouter une configuration uniquement locale qui diverge silencieusement de la production.

## 13. Documentation et décisions

- Mettre à jour le README, `DEPLOY.md`, les exemples d'environnement et les diagrammes concernés dans le même changement.
- Ne jamais laisser dans la documentation les anciens chemins `client/`, `server/` ou `shared/`.
- Documenter le pourquoi d'une décision structurante, ses compromis et sa stratégie de migration.
- Toute nouvelle variable d'environnement doit avoir un défaut sûr, être validée au démarrage et être décrite dans le fichier exemple approprié.
- Une nouvelle application client dédiée doit documenter son périmètre, ses dépendances communes et sa procédure de build isolé.

## 14. Git et discipline de changement

- Préserver les modifications existantes de l'utilisateur et les fichiers sans rapport avec la tâche.
- Faire des changements ciblés, faciles à relire et à revenir en arrière.
- Utiliser des commits conventionnels en français : `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Ne pas mélanger refactorisation, fonctionnalité et nettoyage opportuniste dans un même commit.
- Ne jamais réécrire l'historique, supprimer une branche ou utiliser une commande Git destructive sans demande explicite.
- Ne pas committer de secret, logs, artefacts de build ou fichiers locaux.

## 15. Définition de terminé

Une tâche n'est terminée que si :

- le comportement demandé est réellement implémenté ;
- les frontières d'architecture et les invariants métier sont respectés ;
- les autorisations et l'isolation tenant/agence sont vérifiées ;
- les tests pertinents existent et passent ;
- le typecheck passe et le build passe lorsque concerné ;
- la documentation et les exemples de configuration sont cohérents ;
- aucune régression connue, dette cachée ou étape manuelle non documentée n'est introduite ;
- le compte rendu final indique les fichiers importants, les validations exécutées et toute limite restante.

En cas de conflit entre rapidité et sûreté sur une opération financière, une migration, une autorisation ou un déploiement client, choisir la sûreté et rendre le risque explicite.
