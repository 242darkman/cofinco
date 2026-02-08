# Cofinco — Plateforme de Microfinance

Application de microfinance (Node.js / React / PostgreSQL / Drizzle / MinIO) conteneurisée avec 3 environnements Docker.

## Architecture

```
db-init (one-shot)                ← schema push + seed (s'exécute puis quitte)
  ↓ service_completed_successfully
Caddy (TLS auto, L7 LB)          ← staging + prod uniquement
  ├── app  ×N  (API + WebSocket + SPA)   DISABLE_CRON_JOBS=true
  └── worker ×1 (cron jobs financiers)    DISABLE_CRON_JOBS=false

db (PostgreSQL 16) ── pgbouncer (connection pooling)
redis (sessions, cache)
minio (stockage documents S3-compatible)
pg-backup (backups automatiques quotidiens)

Observabilité :
  loki + promtail (logs centralisés, live tail)
  prometheus + alertmanager (métriques, alertes)
  grafana (dashboards, exploration)
  postgres-exporter, redis-exporter
```

**Image unique** : `app` et `worker` utilisent la même image Docker. Seule la variable `DISABLE_CRON_JOBS` détermine le rôle.

**Initialisation automatique** : Le conteneur `db-init` exécute `drizzle-kit push` (sync schéma) puis les seeds de production avant que l'app ne démarre. Connexion directe à PostgreSQL (pas pgbouncer) pour les DDL. Les deux opérations sont idempotentes.

## 3 Environnements

| Aspect | DEV | STAGING | PROD |
|--------|-----|---------|------|
| **Commande** | `docker compose up -d` | `docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| **Hot reload** | tsx watch + Vite HMR | Non | Non |
| **Séparation app/worker** | Non (instance unique) | Oui | Oui |
| **Caddy (reverse proxy)** | Non (accès direct :5000) | Oui (localhost) | Oui (public) |
| **TLS** | Non | Self-signed (localhost) | Let's Encrypt (auto) |
| **NODE_ENV** | development | production | production |
| **Ports** | `127.0.0.1:*` | `127.0.0.1:*` | 80/443 publics |
| **Resource limits** | Non | Non | Oui (CPU, RAM) |
| **Rétention métriques** | 3 jours | 7 jours | 30 jours |
| **Réseau interne** | bridge | bridge | `internal: true` |
| **Outils admin** | Profile `admin` | Non | Non |
| **Image** | Build `dev` target | Build `runtime` local | Registry (GHCR) |
| **Init DB auto** | Oui (`db-init`) | Oui (`db-init`) | Oui (`db-init`) |

## Prérequis

- Docker + Docker Compose v2
- Un nom de domaine pointé sur le VPS (production)

## Démarrage rapide

### 1. Configuration

```bash
# DEV — copier les defaults pré-remplis
cp .env.dev .env

# STAGING/PROD — partir du template et remplir les valeurs
cp .env.production.example .env
```

### 2. Développement (hot reload)

```bash
# Démarrer tout (infra + db-init + app avec hot reload)
docker compose up -d

# db-init s'exécute automatiquement :
#   1. drizzle-kit push (sync schéma → DB)
#   2. seed-prod.ts (données de référence)
# Puis l'app démarre une fois db-init terminé.

# L'app rebuild automatiquement sur chaque modification de fichier.
# Backend : tsx watch (restart auto)
# Frontend : Vite HMR (mise à jour sans rechargement)

# Accès :
#   App        → http://localhost:5000
#   Grafana    → http://localhost:3001 (admin/admin)
#   Prometheus → http://localhost:9090
#   MinIO      → http://localhost:9001
#   DB         → localhost:5432
#   Redis      → localhost:6379

# Avec les outils d'administration :
docker compose --profile admin up -d

#   Mailpit     → http://localhost:8025 (capture emails)
#   pgAdmin     → http://localhost:5050
#   RedisInsight → http://localhost:5540
```

### 3. Staging (pré-production)

```bash
STAGING="docker compose -f docker-compose.yml -f docker-compose.staging.yml"

# Build et démarrage (topologie identique à la prod)
$STAGING up -d --build

# Scaling horizontal (API uniquement)
$STAGING up -d --scale app=2

# Accès via Caddy :
#   App        → https://localhost (TLS self-signed)
#   Grafana    → http://localhost:3001
#   Prometheus → http://localhost:9090
```

### 4. Production

```bash
PROD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# Démarrage
$PROD up -d

# Scaling horizontal (API uniquement)
$PROD up -d --scale app=3

# Vérification santé
curl -sf https://cofin.co/api/health | jq .
```

## Structure des fichiers

```
docker-compose.yml              ← base infrastructure (DB, Redis, MinIO, monitoring)
docker-compose.override.yml     ← DEV (auto-chargé, hot reload, ports debug)
docker-compose.staging.yml      ← STAGING (Caddy + app/worker, localhost)
docker-compose.prod.yml         ← PROD (Caddy + app/worker, public, resource limits)
Dockerfile                      ← multi-stage (deps → dev → init → build → runtime)
.dockerignore                   ← exclut .env, node_modules, .git

.env.dev                        ← defaults DEV pré-remplis
.env.production.example         ← template STAGING/PROD

infra/caddy/Caddyfile           ← reverse proxy L7, TLS auto, WebSocket sticky

monitoring/
├── prometheus.yml              ← scrape configs (app, worker, exporters)
├── prometheus/alert-rules.yml  ← 15+ règles d'alerte
├── alertmanager/alertmanager.yml
├── loki/loki-config.yml
├── promtail/promtail-config.yml
└── grafana/provisioning/       ← datasources (Prometheus + Loki), dashboards

server/                         ← backend Node.js / Express / TypeScript
client/                         ← frontend React / Vite / TypeScript
shared/                         ← schéma Drizzle, types partagés

scripts/
├── backup.sh                   ← sauvegarde manuelle (DB + MinIO)
├── audit-integrity.ts          ← audit d'intégrité comptable
└── ...                         ← utilitaires DB, diagnostics
```

## Scripts npm

```bash
npm run dev              # Serveur dev local (tsx, sans Docker)
npm run build            # Build production (esbuild + Vite)
npm run start            # Lancement production
npm run check            # Type check TypeScript
npm run test             # Tests unitaires (Vitest)
npm run test:e2e         # Tests E2E (Playwright)

npm run db:push          # Sync schéma → DB (Drizzle Kit)
npm run db:seed          # Seeds de référence (production)
npm run db:seed:dry-run  # Prévisualisation seeds
npm run audit:integrity  # Audit d'intégrité comptable
```

## Observabilité

Accessible dans les 3 environnements (même stack) :

- **Logs live** : Grafana → Explore → Loki → `{service="app"}` → Live
- **Métriques** : Grafana → Dashboards → COFINCO Overview
- **Alertes** : 15+ règles (AppDown, DBDown, HighErrorRate, GLDiscrepancy...)
- **Endpoints** : `/api/health` (santé), `/api/metrics` (Prometheus)

## Backups

Backups automatiques via `pg-backup` (conteneur dédié) :
- Quotidiens, rétention 7 jours / 4 semaines / 6 mois
- Volume Docker `pg_backups`

```bash
# Backup manuel via le conteneur
docker compose exec pg-backup /backup.sh
```

## CI/CD

Pipeline GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) :

1. **Test** : `tsc` + `vitest` + `audit:integrity` + `npm audit`
2. **Build** : Docker build + push GHCR + scan Trivy
3. **Deploy** : SSH → pull + rolling restart + health check

Secrets requis : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`

## Sécurité

- Headers CSP/HSTS/X-Frame via Helmet
- Rate limiting (auth: 5/15min, API: 200/15min, financier: 20/min)
- CSRF (validation Origin/Referer)
- Sessions Redis (HttpOnly, Secure, SameSite=lax)
- Non-root dans Docker, tini PID 1
- Réseau interne isolé (DB/Redis/MinIO non exposés en prod)
- Backups chiffrables (GPG)

## Initialisation de la base de données

L'initialisation est **entièrement automatique** via le conteneur `db-init` :

1. **`drizzle-kit push`** — synchronise le schéma TypeScript vers PostgreSQL (DDL)
2. **`seed-prod.ts`** — insère les données de référence (géographie, permissions, produits, comptabilité...)

Le conteneur `db-init` :
- Se connecte directement à PostgreSQL (port 5432, pas pgbouncer) pour les opérations DDL
- S'exécute une seule fois puis quitte (`restart: "no"`)
- L'app et le worker ne démarrent qu'après son succès (`service_completed_successfully`)
- Les deux opérations sont **idempotentes** — safe à relancer

```bash
# Vérifier les logs d'initialisation
docker logs cofinco-db-init

# Relancer l'init manuellement (si nécessaire)
docker compose restart db-init
```

## Remarques importantes

- Ne jamais exposer PostgreSQL, Redis ou MinIO publiquement
- Le fichier `.env` ne doit jamais être commité
- Le `worker` ne doit **jamais** être scalé (replicas: 1)
- Ajuster `APP_REPLICAS` dans `.env` selon la charge
