# MicroFlex — Plateforme de Microfinance

Application de microfinance complète (Node.js / React / PostgreSQL / Drizzle / MinIO).

## Modules fonctionnels

| Module | Description |
| --- | --- |
| **Dashboard** | KPIs temps reel, alertes clients, previsions, comparatifs periodiques |
| **Clients** | Fiche client 360, scoring, alertes risque (KYC, PEP, blacklist) |
| **Credits** | Cycle complet : demande, enquete terrain, scoring, decaissement, echeancier, recouvrement |
| **Epargne** | Comptes epargne, comptes bloques, tontines (cycles, dispatcher intelligent) |
| **Caisse** | Sessions, operations, billetage, rapprochement, transferts, coffre-fort, supervision |
| **Agent Terrain** | Mode offline, geolocalisation, collecte, remise, commissions, prospection |
| **Comptabilite** | Grand Livre, plan comptable OHADA, ecritures auto, amortissements, provisions, DSF, TAFIRE |
| **RH** | Employes, conges, presence, paie, recrutement, evaluations, portail interne |
| **Mon Espace** | Portail employe : coordonnees, presence, conges, bulletins, documents, evaluations, offres internes |
| **Tresorerie** | Encaisse GL, ratio liquidite, transferts inter-coffres, evacuation |
| **Administration** | Utilisateurs, roles RBAC/ABAC (CASL), permissions, sessions, logs, maintenance |
| **Notifications** | SMS (MTN MoMo, Airtel), push, in-app, OTP, templates |

## Architecture

```
DEV (Docker local) :
  docker compose up -d
  db-init (one-shot) → schema push + seed
  app (API + WebSocket + SPA, hot reload)
  db (PostgreSQL 16) + pgbouncer + redis + minio
  monitoring (prometheus, grafana, loki, alertmanager)

PROD / PREPROD (VPS OVH) :
  PostgreSQL 16 (natif sur VPS)
  Nginx + Certbot (natif sur VPS)
  Docker : app + worker + redis + minio
  Backups : pg_dump quotidien (systemd timer)
  Deploy : tags Git → GitHub Actions → SSH
```

**Image unique** : `app` et `worker` utilisent la meme image Docker. Seule la variable `DISABLE_CRON_JOBS` determine le role.

**Initialisation automatique** : `db-init` execute `drizzle-kit push` (sync schema) puis les seeds de production. Connexion directe a PostgreSQL (pas pgbouncer) pour les DDL. Operations idempotentes.

## Stack technique

| Couche | Technologies |
| --- | --- |
| **Backend** | Node.js, Express, TypeScript, WebSocket |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS v4, Recharts |
| **Base de donnees** | PostgreSQL 16, Drizzle ORM (35 modules schema) |
| **Autorisation** | CASL (RBAC/ABAC), 23 modules, 70+ sujets |
| **Stockage** | MinIO (S3-compatible) |
| **Cache/Sessions** | Redis |
| **Monitoring** | Prometheus, Grafana, Loki, Alertmanager |
| **CI/CD** | GitHub Actions (tags), GHCR, Trivy |
| **Reverse proxy** | Nginx + Certbot (VPS natif) |

## Environnements

| Aspect | DEV | PREPROD | PROD |
| --- | --- | --- | --- |
| **Declencheur** | `docker compose up -d` | Tag `rc-v*` | Tag `v*` |
| **Compose** | `docker-compose.yml` + override | `docker-compose.vps.yml` | `docker-compose.vps.yml` |
| **Images** | Build local (dev target) | GHCR `rc-vX.Y.Z` | GHCR `vX.Y.Z` + `latest` |
| **Env source** | `.env` local | GitHub Environment `preprod` | GitHub Environment `production` |
| **Database** | Docker (postgres:16-alpine + pgbouncer) | VPS natif PostgreSQL 16 | VPS natif PostgreSQL 16 |
| **Reverse proxy** | Acces direct :5000 | Nginx natif + Certbot | Nginx natif + Certbot |
| **Hot reload** | tsx watch + Vite HMR | Non | Non |
| **NODE_ENV** | development | production | production |

## Prerequis

- Docker + Docker Compose v2 (dev)
- VPS OVH Ubuntu 22.04/24.04 LTS (prod/preprod)
- Nom de domaine pointe sur le VPS

## Demarrage rapide

### 1. Configuration

```bash
# DEV — copier les defaults pre-remplis
cp .env.dev .env
```

### 2. Developpement (hot reload)

```bash
# Demarrer tout (infra + db-init + app avec hot reload)
docker compose up -d

# db-init s'execute automatiquement :
#   1. drizzle-kit push (sync schema -> DB)
#   2. seed-prod.ts (donnees de reference)
# Puis l'app demarre une fois db-init termine.

# Backend : tsx watch (restart auto)
# Frontend : Vite HMR (mise a jour sans rechargement)

# Acces :
#   App        -> http://localhost:5000
#   Grafana    -> http://localhost:3001 (admin/admin)
#   Prometheus -> http://localhost:9090
#   MinIO      -> http://localhost:9001
#   DB         -> localhost:5432
#   Redis      -> localhost:6379

# Avec les outils d'administration :
docker compose --profile admin up -d

#   Mailpit     -> http://localhost:8025 (capture emails)
#   pgAdmin     -> http://localhost:5050
#   RedisInsight -> http://localhost:5540

# Mettre a jour la base de donnees
docker compose exec app npm run db:push

# Lancer les tests
docker compose --profile test run --rm test-unit

# Voir les logs de db-init
docker compose logs db-init
```

### 3. Preprod / Production (VPS)

Le deploiement se fait via tags Git. Voir [DEPLOY.md](DEPLOY.md) pour le guide complet.

```bash
# Setup initial du VPS (une seule fois)
sudo DOMAIN=microflex-m.com ACME_EMAIL=admin@microflex-m.com bash scripts/vps/setup.sh

# Deployer en preprod (release candidate)
git tag rc-v3.62.0
git push origin rc-v3.62.0

# Deployer en production
git tag v3.62.0
git push origin v3.62.0

# Rollback (SSH sur le VPS)
bash /opt/microflex/scripts/vps/rollback.sh          # tag precedent
bash /opt/microflex/scripts/vps/rollback.sh v3.61.0  # tag specifique

# Verification sante
curl -sf https://microflex-m.com/api/health | jq .
```

## Structure des fichiers

```
docker-compose.yml              <- infrastructure DEV (DB, Redis, MinIO, monitoring)
docker-compose.override.yml     <- DEV overlay (auto-charge, hot reload, ports debug)
docker-compose.vps.yml          <- VPS PROD/PREPROD (app + worker + redis + minio)
Dockerfile                      <- multi-stage (deps -> dev -> init -> test -> build -> runtime)
.dockerignore                   <- exclut .env, node_modules, .git

.env.dev                        <- defaults DEV pre-remplis
.env.production.example         <- template secrets (documentation)
.env.vps.example                <- template VPS (documentation)

.github/workflows/
|-- ci.yml                      <- PR checks (lint, tests, GL audit, build)
+-- release.yml                 <- tag-based deploy (build + push GHCR + SSH deploy)

infra/
|-- nginx/microflex.conf          <- reverse proxy Nginx (VPS natif)
+-- systemd/                    <- backup timer + service

scripts/vps/
|-- setup.sh                    <- setup initial VPS (PG, Nginx, Docker, UFW)
|-- deploy.sh                   <- deploiement idempotent + healthcheck + auto-rollback
|-- rollback.sh                 <- rollback au tag precedent
|-- backup-db.sh                <- pg_dump quotidien + rotation + chiffrement
+-- restore-db.sh               <- restauration interactive

monitoring/
|-- prometheus.yml              <- scrape configs (app, worker, exporters)
|-- prometheus/alert-rules.yml  <- 15+ regles d'alerte
|-- alertmanager/alertmanager.yml
|-- loki/loki-config.yml
|-- promtail/promtail-config.yml
+-- grafana/provisioning/       <- datasources (Prometheus + Loki), dashboards

server/                         <- backend (47 fichiers routes, 166 services)
client/                         <- frontend React (19 modules composants)
shared/                         <- 35 modules schema Drizzle, types partages

seeds/
+-- seed-prod.ts                <- donnees de reference production (idempotent)

scripts/
|-- backup.sh                   <- sauvegarde DEV (DB Docker + MinIO)
|-- audit-integrity.ts          <- audit d'integrite comptable
|-- validate-seed.ts            <- validation seeds
|-- diagnose-balance-issues.ts  <- diagnostic soldes
|-- generate-gl-coverage.ts     <- couverture Grand Livre
|-- monitor-gl-strict.ts        <- monitoring GL strict
+-- ...                         <- utilitaires DB, nettoyage, reset

tests/                          <- 48 fichiers de tests
|-- unit/                       <- 28 tests unitaires (Vitest)
|-- integration/                <- 11 tests d'integration (Vitest)
|-- e2e/                        <- 4 tests E2E navigateur (Playwright)
|-- security/                   <- 2 tests de regression securite (Vitest)
+-- robustness/                 <- 3 tests de robustesse financiere (Vitest)
```

## Scripts npm

```bash
# Developpement
npm run dev              # Serveur dev local (tsx, sans Docker)
npm run build            # Build production (esbuild + Vite)
npm run start            # Lancement production
npm run check            # Type check TypeScript

# Base de donnees
npm run db:push          # Sync schema -> DB (Drizzle Kit)
npm run db:seed          # Seeds de reference (production)
npm run db:reset         # Reset DB (dev uniquement)
npm run db:validate      # Validation seeds

# Audit & diagnostic
npm run audit:integrity  # Audit d'integrite comptable
npm run gl:coverage      # Couverture Grand Livre
npm run diagnose:balance # Diagnostic soldes
npm run monitor:gl       # Monitoring GL strict
npm run cleanup:logs     # Nettoyage logs

# Tests
npm run test             # Tous les tests (Vitest)
npm run test:unit        # Tests unitaires
npm run test:integration # Tests d'integration
npm run test:security    # Tests securite
npm run test:e2e         # Tests E2E (Playwright)
```

## Tests

Tous les tests sont dans `tests/` et s'executent via Docker (aucun Node.js local requis).

### Lancer les tests via Docker

```bash
# ===== Tests unitaires + integration + securite + robustesse =====
docker compose --profile test run --rm test-unit

# Filtrer par categorie :
docker compose --profile test run --rm test-unit npx vitest run tests/unit
docker compose --profile test run --rm test-unit npx vitest run tests/integration
docker compose --profile test run --rm test-unit npx vitest run tests/security
docker compose --profile test run --rm test-unit npx vitest run tests/robustness

# Filtrer par nom :
docker compose --profile test run --rm test-unit npx vitest run -t "coffre"

# ===== Tests E2E (navigateur) =====
docker compose --profile test run --rm test-e2e

# Filtrer par fichier :
docker compose --profile test run --rm test-e2e npx playwright test tests/e2e/credit-workflow.test.ts
```

### Frameworks

| Framework | Scope | Config |
| --- | --- | --- |
| **Vitest** | unit, integration, security, robustness | `vitest.config.ts` |
| **Playwright** | e2e (navigateur Chromium) | `playwright.config.ts` |

### Couverture par domaine

| Domaine | Unit | Integration | E2E | Security |
| --- | --- | --- | --- | --- |
| Credits | schedule, disbursements, reevaluation | workflow enquete, reminders | workflow complet, UI enquete | - |
| Caisse | guards, state machine, reversals, agents | reversal API, coffre API/config | - | - |
| Comptabilite | - | repayment allocation | - | precision decimale |
| RBAC | hardening, permissions | matrice API (403/200) | UI permissions | - |
| HR | logique conges/paie | attendance, leaves, payroll, recruitment | - | - |
| Notifications | templates, routing, worker, OTP | pipeline, MTN provider | - | - |
| Tontines | smart dispatcher | - | - | - |
| Auth | - | - | login page | CSRF, sessions, OTP, passwords |
| Securite | - | - | - | 70+ regressions (XSS, injection, crypto) |
| Transactions | labels, reversals, duplicates | - | - | robustesse concurrentielle |

## Observabilite

- **Logs live** : Grafana -> Explore -> Loki -> `{service="app"}` -> Live
- **Metriques** : Grafana -> Dashboards -> MICROFLEX Overview
- **Alertes** : 15+ regles (AppDown, DBDown, HighErrorRate, GLDiscrepancy...)
- **Endpoints** : `/api/health` (sante), `/api/metrics` (Prometheus)

## Backups

**DEV** : `scripts/backup.sh` (sauvegarde DB Docker + MinIO)

**VPS** : `scripts/vps/backup-db.sh` (pg_dump natif, quotidien via systemd timer)
- Rotation : 7 jours daily, 4 semaines weekly
- Chiffrement GPG optionnel
- Upload S3 optionnel (offsite)
- Voir [DEPLOY.md](DEPLOY.md) pour la configuration

## CI/CD

Deux workflows GitHub Actions :

**[ci.yml](.github/workflows/ci.yml)** — sur chaque PR :
1. Type check (`tsc`) + unit tests + `npm audit`
2. GL contract tests (14 tests, 100% coverage)
3. Docker build verification

**[release.yml](.github/workflows/release.yml)** — sur tags Git :
1. Tests (unit + GL contracts)
2. Build & push images Docker vers GHCR (runtime + init)
3. Scan securite Trivy
4. Deploy VPS via SSH (generate .env.runtime, db-init, compose up, healthcheck)
5. Auto-rollback si healthcheck echoue

| Tag | Environnement | GitHub Environment |
| --- | --- | --- |
| `v*` (ex: v3.62.0) | Production | `production` |
| `rc-*` (ex: rc-v3.62.0) | Preprod | `preprod` |

Secrets requis par environnement : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `DATABASE_URL`, `SESSION_SECRET`, ...

## Securite

- Headers CSP/HSTS/X-Frame via Helmet
- Rate limiting (auth: 5/15min, API: 200/15min, financier: 20/min)
- CSRF (validation Origin/Referer)
- Sessions Redis (HttpOnly, Secure, SameSite=lax)
- RBAC/ABAC via CASL (23 modules, 70+ sujets, separation des taches)
- Non-root dans Docker, tini PID 1
- PostgreSQL scram-sha-256, UFW restrictif
- Backups chiffrables (GPG)

## Initialisation de la base de donnees

L'initialisation est **entierement automatique** via le conteneur `db-init` :

1. **`drizzle-kit push`** — synchronise le schema TypeScript vers PostgreSQL (DDL)
2. **`seed-prod.ts`** — insere les donnees de reference (geographie, permissions, produits, comptabilite...)

Le conteneur `db-init` :

- Se connecte directement a PostgreSQL (port 5432, pas pgbouncer) pour les operations DDL
- S'execute une seule fois puis quitte (`restart: "no"`)
- L'app et le worker ne demarrent qu'apres son succes (`service_completed_successfully`)
- Les deux operations sont **idempotentes** — safe a relancer

```bash
# Verifier les logs d'initialisation
docker logs microflex-db-init

# Relancer l'init manuellement (si necessaire)
docker compose restart db-init
```

## Remarques importantes

- Ne jamais exposer PostgreSQL, Redis ou MinIO publiquement
- Le fichier `.env` ne doit jamais etre commite
- Le `worker` ne doit **jamais** etre scale (replicas: 1)
- Deploiement uniquement via tags Git (pas de push direct sur le VPS)
- Voir [DEPLOY.md](DEPLOY.md) pour le guide complet de deploiement VPS
