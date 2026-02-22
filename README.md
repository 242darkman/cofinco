# Cofinco — Plateforme de Microfinance

Application de microfinance complète (Node.js / React / PostgreSQL / Drizzle / MinIO) conteneurisee avec 3 environnements Docker.

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
db-init (one-shot)                <- schema push + seed (s'execute puis quitte)
  | service_completed_successfully
Caddy (TLS auto, L7 LB)          <- staging + prod uniquement
  |-- app  xN  (API + WebSocket + SPA)   DISABLE_CRON_JOBS=true
  +-- worker x1 (cron jobs financiers)    DISABLE_CRON_JOBS=false

db (PostgreSQL 16) -- pgbouncer (connection pooling)
redis (sessions, cache)
minio (stockage documents S3-compatible)
pg-backup (backups automatiques quotidiens)

Observabilite :
  loki + promtail (logs centralises, live tail)
  prometheus + alertmanager (metriques, alertes)
  grafana (dashboards, exploration)
  postgres-exporter, redis-exporter
```

**Image unique** : `app` et `worker` utilisent la meme image Docker. Seule la variable `DISABLE_CRON_JOBS` determine le role.

**Initialisation automatique** : Le conteneur `db-init` execute `drizzle-kit push` (sync schema) puis les seeds de production avant que l'app ne demarre. Connexion directe a PostgreSQL (pas pgbouncer) pour les DDL. Les deux operations sont idempotentes.

## Stack technique

| Couche | Technologies |
| --- | --- |
| **Backend** | Node.js, Express, TypeScript, WebSocket |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS v4, Recharts |
| **Base de donnees** | PostgreSQL 16, Drizzle ORM (35 modules schema), PgBouncer |
| **Autorisation** | CASL (RBAC/ABAC), 23 modules, 70+ sujets |
| **Stockage** | MinIO (S3-compatible) |
| **Cache/Sessions** | Redis |
| **Monitoring** | Prometheus, Grafana, Loki, Alertmanager |
| **CI/CD** | GitHub Actions, GHCR, Trivy |
| **Reverse proxy** | Caddy (TLS auto, L7 LB, WebSocket sticky) |

## 3 Environnements

| Aspect | DEV | STAGING | PROD |
| --- | --- | --- | --- |
| **Commande** | `docker compose up -d` | `docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| **Hot reload** | tsx watch + Vite HMR | Non | Non |
| **Separation app/worker** | Non (instance unique) | Oui | Oui |
| **Caddy (reverse proxy)** | Non (acces direct :5000) | Oui (localhost) | Oui (public) |
| **TLS** | Non | Self-signed (localhost) | Let's Encrypt (auto) |
| **NODE_ENV** | development | production | production |
| **Ports** | `127.0.0.1:*` | `127.0.0.1:*` | 80/443 publics |
| **Resource limits** | Non | Non | Oui (CPU, RAM) |
| **Retention metriques** | 3 jours | 7 jours | 30 jours |
| **Reseau interne** | bridge | bridge | `internal: true` |
| **Outils admin** | Profile `admin` | Non | Non |
| **Image** | Build `dev` target | Build `runtime` local | Registry (GHCR) |
| **Init DB auto** | Oui (`db-init`) | Oui (`db-init`) | Oui (`db-init`) |

## Prerequis

- Docker + Docker Compose v2
- Un nom de domaine pointe sur le VPS (production)

## Demarrage rapide

### 1. Configuration

```bash
# DEV — copier les defaults pre-remplis
cp .env.dev .env

# STAGING/PROD — partir du template et remplir les valeurs
cp .env.production.example .env
```

### 2. Developpement (hot reload)

```bash
# Demarrer tout (infra + db-init + app avec hot reload)
docker compose up -d

# db-init s'execute automatiquement :
#   1. drizzle-kit push (sync schema -> DB)
#   2. seed-prod.ts (donnees de reference)
# Puis l'app demarre une fois db-init termine.

# L'app rebuild automatiquement sur chaque modification de fichier.
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

# Lancer l'application
docker compose up -d --build app

# Voir les logs de db-init
docker compose logs db-init
```

### 3. Staging (pre-production)

```bash
STAGING="docker compose -f docker-compose.yml -f docker-compose.staging.yml"

# Build et demarrage (topologie identique a la prod)
$STAGING up -d --build

# Scaling horizontal (API uniquement)
$STAGING up -d --scale app=2

# Acces via Caddy :
#   App        -> https://localhost (TLS self-signed)
#   Grafana    -> http://localhost:3001
#   Prometheus -> http://localhost:9090
```

### 4. Production

```bash
PROD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# Demarrage
$PROD up -d

# Scaling horizontal (API uniquement)
$PROD up -d --scale app=3

# Verification sante
curl -sf https://cofin.co/api/health | jq .
```

## Structure des fichiers

```
docker-compose.yml              <- base infrastructure (DB, Redis, MinIO, monitoring)
docker-compose.override.yml     <- DEV (auto-charge, hot reload, ports debug)
docker-compose.staging.yml      <- STAGING (Caddy + app/worker, localhost)
docker-compose.prod.yml         <- PROD (Caddy + app/worker, public, resource limits)
Dockerfile                      <- multi-stage (deps -> dev -> init -> test -> test-e2e -> build -> runtime)
.dockerignore                   <- exclut .env, node_modules, .git

.env.dev                        <- defaults DEV pre-remplis
.env.production.example         <- template STAGING/PROD

infra/caddy/Caddyfile           <- reverse proxy L7, TLS auto, WebSocket sticky

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
|-- backup.sh                   <- sauvegarde manuelle (DB + MinIO)
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
# (Vitest, execution rapide, mocks complets)
docker compose --profile test run --rm test-unit

# Filtrer par categorie :
docker compose --profile test run --rm test-unit npx vitest run tests/unit
docker compose --profile test run --rm test-unit npx vitest run tests/integration
docker compose --profile test run --rm test-unit npx vitest run tests/security
docker compose --profile test run --rm test-unit npx vitest run tests/robustness

# Filtrer par nom :
docker compose --profile test run --rm test-unit npx vitest run -t "coffre"

# ===== Tests E2E (navigateur) =====
# Requiert l'app en cours d'execution (docker compose up -d)
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

Accessible dans les 3 environnements (meme stack) :

- **Logs live** : Grafana -> Explore -> Loki -> `{service="app"}` -> Live
- **Metriques** : Grafana -> Dashboards -> COFINCO Overview
- **Alertes** : 15+ regles (AppDown, DBDown, HighErrorRate, GLDiscrepancy...)
- **Endpoints** : `/api/health` (sante), `/api/metrics` (Prometheus)

## Backups

Backups automatiques via `pg-backup` (conteneur dedie) :

- Quotidiens, retention 7 jours / 4 semaines / 6 mois
- Volume Docker `pg_backups`

```bash
# Backup manuel via le conteneur
docker compose exec pg-backup /backup.sh
```

## CI/CD

Pipeline GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)), declenche sur `master` :

1. **Test** : `tsc` + `vitest run` + `audit:integrity` + `npm audit`
2. **Build** : Docker build + push GHCR + scan Trivy
3. **Deploy** : SSH -> pull + rolling restart + health check

Secrets requis : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`

## Securite

- Headers CSP/HSTS/X-Frame via Helmet
- Rate limiting (auth: 5/15min, API: 200/15min, financier: 20/min)
- CSRF (validation Origin/Referer)
- Sessions Redis (HttpOnly, Secure, SameSite=lax)
- RBAC/ABAC via CASL (23 modules, 70+ sujets, separation des taches)
- Non-root dans Docker, tini PID 1
- Reseau interne isole (DB/Redis/MinIO non exposes en prod)
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
docker logs cofinco-db-init

# Relancer l'init manuellement (si necessaire)
docker compose restart db-init
```

## Remarques importantes

- Ne jamais exposer PostgreSQL, Redis ou MinIO publiquement
- Le fichier `.env` ne doit jamais etre commite
- Le `worker` ne doit **jamais** etre scale (replicas: 1)
- Ajuster `APP_REPLICAS` dans `.env` selon la charge
