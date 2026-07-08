# Livraison enterprise — identité tenant, flags dynamiques, images par client

Ce document décrit les mécanismes de robustesse ajoutés pour les déploiements SaaS et On-Premise (modèle **1 instance = 1 client**).

## Identité du déploiement

Au premier démarrage, l'instance inscrit son identifiant de tenant dans la table `deployment_identity` (migration `0001`). À chaque démarrage suivant, l'identifiant configuré (`TENANT_ID` / config tenant) doit correspondre, sinon **le serveur refuse de démarrer**. Cela empêche de pointer le livrable d'un client vers la base d'un autre.

Réassignation volontaire (ex : renommage d'un tenant) :

```bash
# Un seul démarrage avec la variable, puis la retirer
TENANT_IDENTITY_REBIND=true
```

L'opération est tracée en `warn` dans les logs. Sans cette variable, un écart d'identité est fatal (`DeploymentIdentityError`).

## Feature flags dynamiques

La configuration statique (fichier `config/tenants/*.json` + variables `TENANT_FEATURE_*`) reste la source par défaut. Les surcharges à chaud vivent dans `tenant_feature_overrides` (migration `0002`) :

- `GET /api/admin/tenant-features` — état effectif et provenance de chaque flag ;
- `PUT /api/admin/tenant-features/:feature` — corps `{ "enabled": bool, "reason": "..." }` ;
- `DELETE /api/admin/tenant-features/:feature` — retour à la configuration statique.

Ces routes exigent la permission `MANAGE SETTINGS` et chaque changement est journalisé dans `audit_logs` (risque `high`). Le cache est de 30 s. En cas d'erreur de lecture en base, l'application se replie sur la configuration statique.

## Branding dynamique

Le nom, les couleurs et les logos sont également surchargeables à chaud dans `tenant_branding_overrides` (migration `0003`) — les variables `TENANT_*` ne sont que des **défauts de démarrage** :

- `GET /api/admin/tenant-branding` — état effectif et provenance de chaque clé ;
- `PUT /api/admin/tenant-branding/:key` — corps `{ "value": "...", "reason": "..." }`, clés : `name`, `primaryColor`, `secondaryColor`, `logoUrl`, `faviconUrl` ;
- `DELETE /api/admin/tenant-branding/:key` — retour à la configuration statique.

L'**identifiant du tenant (`id`) n'est jamais surchargeable** : c'est l'ancre d'identité du déploiement (voir `deployment_identity`). `GET /api/tenant/config` renvoie la configuration effective (branding + flags fusionnés) consommée par le frontend.

Kill switch commun aux surcharges dynamiques :

```bash
TENANT_OVERRIDES_STATIC_ONLY=true   # ignore les surcharges en base (flags + branding)
```

Le test de contrat `tests/security/tenant-feature-coverage.test.ts` garantit qu'aucune route d'un domaine désactivable (tontines, SMS, mobile money, agents terrain) n'échappe au middleware `enforceTenantFeatures`. Toute nouvelle route de ces domaines doit être couverte par une règle du middleware, sinon la CI échoue.

## Images Docker par client

Chaque fichier `config/tenants/<tenant>.json` (hors `microflex`, l'image standard) déclenche en release la construction d'une image dédiée :

```
ghcr.io/<repo>:<tag>-<tenant>
```

L'image embarque uniquement la config de son client (`TENANT_CONFIG_FILE`), est scannée (Trivy), signée et attestée. Les configs sont validées en CI par `scripts/validate-tenant-configs.ts` (schéma Zod strict, id = nom du fichier).

Pour un client exigeant du code propriétaire isolé, créer une application dédiée dans `apps/` conformément à `AGENTS.md` §5.

## Vérification des livrables (côté client / audit)

```bash
# Signature de l'image (cosign keyless, OIDC GitHub Actions)
cosign verify \
  --certificate-identity-regexp 'github.com/<owner>/<repo>' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/<repo>@<digest>

# Attestations (provenance + SBOM)
gh attestation verify oci://ghcr.io/<repo>@<digest> --owner <owner>
```

Le SBOM (SPDX JSON) est aussi archivé comme artefact de release pendant 90 jours.

## Turborepo

Les dépendances sont déclarées par workspace (`apps/web`, `apps/api`, `packages/shared`) ; l'outillage transverse reste à la racine. Scripts :

```bash
npm run turbo:check      # typecheck avec cache
npm run turbo:test       # tests unitaires + sécurité avec cache
npm run turbo:affected   # uniquement ce qui est impacté par le diff
npm run build:apps       # builds par workspace
```

Le packaging complet (`npm run build`) reste la référence pour l'image Docker ; `script/build.ts` agrège les dépendances de tous les workspaces pour la liste d'externals esbuild.
