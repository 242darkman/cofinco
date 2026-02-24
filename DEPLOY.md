# Cofinco — Deployment Guide (Option B — Microfinance)

## Architecture

```
VPS OVH (Ubuntu 22.04/24.04 LTS)
├── Native Services:
│   ├── PostgreSQL 16 (localhost:5432, scram-sha-256)
│   ├── Nginx (reverse proxy, ports 80/443)
│   └── Certbot (auto-renew Let's Encrypt)
├── Docker Services (bridge network: microfinance_net):
│   ├── app ×3 (API stateless, ports 5001-5003 → Nginx least_conn)
│   ├── worker (cron jobs, single instance)
│   ├── redis 7.2 (sessions + cache, persistant)
│   └── minio (object storage S3-compatible)
├── Backups:
│   ├── pg_dump quotidien (systemd timer, 02:00 UTC)
│   ├── Rotation: 7 jours daily, 4 semaines weekly
│   └── Option offsite: S3-compatible / rsync
└── CI/CD:
    └── GitHub Actions → tags Git → deploy SSH
```

## Allocation des Ressources (VPS 64GB RAM / 16 vCores / 350GB SSD)

| Service | Replicas | RAM (limit) | CPU (limit) | Rôle |
|---|---|---|---|---|
| PostgreSQL (natif) | 1 | ~48 GB | reste | Base de données principale |
| app | 3 | 1 GB chacun | 2 CPU | API stateless, zero-downtime deploy |
| worker | 1 | 1 GB | 1 CPU | Cron jobs, tâches de fond (singleton) |
| redis | 1 | 1 GB | 1 CPU | Sessions + cache (512 MB maxmemory) |
| minio | 1 | 1 GB | 1 CPU | Stockage documents S3-compatible |
| db-init | 1 (one-shot) | 1 GB | 1 CPU | Schema push + seeds |
| Nginx + OS | — | ~10 GB | — | Reverse proxy, buffers, OS |

### PostgreSQL Tuning (auto-appliqué par setup.sh)

| Paramètre | Valeur | Explication |
|---|---|---|
| `shared_buffers` | 16 GB | 25% de la RAM — cache données en mémoire |
| `effective_cache_size` | 48 GB | 75% de la RAM — estimation cache OS |
| `work_mem` | 256 MB | Mémoire par opération (tri, jointure) |
| `maintenance_work_mem` | 2 GB | VACUUM, CREATE INDEX |
| `max_connections` | 200 | 3 app replicas × pool + worker + admin |
| `max_parallel_workers` | 8 | Parallélisme requêtes complexes |
| `random_page_cost` | 1.1 | Optimisé SSD |

### Ports réseau (host)

| Port | Service | Accès |
|---|---|---|
| 80/443 | Nginx | Public (HTTP/HTTPS) |
| 5001-5003 | app ×3 | Localhost uniquement (Nginx upstream) |
| 5432 | PostgreSQL | Localhost + Docker subnet (UFW bloqué) |
| 9001 | MinIO Console | Localhost (SSH tunnel) |

## Matrice des Environnements

| | **DEV** | **PREPROD** | **PROD** |
|---|---|---|---|
| **Trigger** | `docker compose up` | Tag `rc-v*` | Tag `v*` |
| **Compose** | `docker-compose.yml` + override | `docker-compose.vps.yml` | `docker-compose.vps.yml` |
| **Images** | Build local | GHCR `rc-vX.Y.Z` | GHCR `vX.Y.Z` + `latest` |
| **Env source** | `.env` local | GitHub Environment `preprod` | GitHub Environment `production` |
| **Database** | Docker (postgres:16-alpine) | VPS natif (PostgreSQL 16) | VPS natif (PostgreSQL 16) |
| **Reverse proxy** | Acces direct :5000 | Nginx natif + Certbot | Nginx natif + Certbot |
| **Redis** | Docker | Docker | Docker |
| **Domain** | localhost | preprod.cofinco-m.com | cofinco-m.com |
| **Replicas** | 1 | 1 | 3 (zero-downtime) |
| **Monitoring** | Optionnel (profile admin) | Optionnel | Prometheus + Grafana |
| **Backups** | Non | Quotidien | Quotidien + weekly + offsite |
| **Rollback** | N/A | Manuel ou auto | Auto (health check) |

## Variables d'Environnement

### Classification

| Variable | Scope | Type | Requis |
|---|---|---|---|
| `NODE_ENV` | Runtime | Variable | Oui |
| `PORT` | Runtime | Variable | Oui (default: 5000) |
| `APP_VERSION` | Runtime | Variable | Oui (set by CI) |
| `DATABASE_URL` | Runtime | **Secret** | Oui |
| `REDIS_PASSWORD` | Runtime | **Secret** | Oui |
| `SESSION_SECRET` | Runtime | **Secret** | Oui (min 32 chars) |
| `OTP_HMAC_SECRET` | Runtime | **Secret** | Oui (min 32 chars) |
| `OFFLINE_LIMITS_HMAC_KEY` | Runtime | **Secret** | Recommandé |
| `MINIO_ROOT_USER` | Runtime | **Secret** | Oui |
| `MINIO_ROOT_PASSWORD` | Runtime | **Secret** | Oui |
| `MINIO_PUBLIC_ENDPOINT` | Runtime | Variable | Oui |
| `DOMAIN` | Runtime | Variable | Oui (prod) |
| `SMTP_HOST` | Runtime | Variable | Recommandé |
| `SMTP_PASSWORD` | Runtime | **Secret** | Recommandé |
| `MTN_SMS_CLIENT_ID` | Runtime | **Secret** | Optionnel |
| `MTN_SMS_CLIENT_SECRET` | Runtime | **Secret** | Optionnel |
| `PAWAPAY_API_TOKEN` | Runtime | **Secret** | Prod only |
| `GL_POSTING_MODE` | Runtime | Variable | Oui (STRICT) |
| `LOG_LEVEL` | Runtime | Variable | Oui (default: info) |
| `VITE_*` | **Build-time** | Variable | Optionnel |

### Build-time vs Runtime

- **Build-time** (`VITE_*`) : Baked dans l'image Docker pendant le build. Les valeurs par défaut sont suffisantes. Si des valeurs custom sont nécessaires, il faut rebuild l'image.
- **Runtime** (`process.env.*`) : Injectées via `.env.runtime` au démarrage des containers. Jamais dans l'image Docker.

### GitHub Environments Setup

Settings → Environments → chaque environnement a ses propres secrets & variables (pas de préfixes).

**`production`** (avec protection rules : required reviewers)
- Secrets : DATABASE_URL, REDIS_PASSWORD, SESSION_SECRET, OTP_HMAC_SECRET, OFFLINE_LIMITS_HMAC_KEY, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, MTN_SMS_CLIENT_ID, MTN_SMS_CLIENT_SECRET, MTN_SMS_WEBHOOK_SECRET, PAWAPAY_API_TOKEN, PAWAPAY_WEBHOOK_PUBLIC_KEYS, GRAFANA_ADMIN_PASSWORD, VPS_HOST, VPS_USER, VPS_SSH_KEY
- Variables : DOMAIN, MINIO_PUBLIC_ENDPOINT, SMTP_PORT, SMTP_FROM_EMAIL, SMTP_FROM_NAME, SMTP_SECURE, MTN_SMS_SENDER_ID, MTN_SMS_TOKEN_URL, MTN_SMS_BASE_URL, PAWAPAY_ENVIRONMENT, PAWAPAY_CALLBACK_URL, PAWAPAY_STATEMENT_PREFIX, WEBHOOK_IP_VALIDATION, GL_POSTING_MODE, BALANCE_RECONCILIATION_INTERVAL_MINUTES, ENABLE_BALANCE_AUTO_CORRECTION, LOG_LEVEL, APP_REPLICAS, GRAFANA_ADMIN_USER

**`preprod`** (sans protection rules)
- Mêmes clés avec des valeurs preprod (DB séparée, domain preprod, etc.)

## Setup Initial VPS

### 1. Provisionner le VPS

```bash
# Se connecter en root
ssh root@VPS_IP

# Cloner le repo (une seule fois, pour les scripts)
git clone https://github.com/your-org/cofinco.git /tmp/cofinco-setup
cd /tmp/cofinco-setup

# Lancer le setup (installe tout : PG, Nginx, Docker, UFW, etc.)
sudo DOMAIN=cofinco-m.com ACME_EMAIL=admin@cofinco-m.com bash scripts/vps/setup.sh
```

Le script setup.sh :
- Installe PostgreSQL 16 + crée la DB et l'utilisateur
- Installe Docker + configure le daemon
- Installe Nginx + Certbot + obtient le certificat SSL
- Configure UFW (SSH + HTTP/HTTPS only)
- Crée l'utilisateur `deploy` + l'arborescence `/opt/cofinco/`
- Configure le backup systemd timer
- Configure fail2ban + logrotate

**IMPORTANT** : Notez le `DATABASE_URL` affiché à la fin du setup pour le configurer dans GitHub Secrets.

### 2. Préparer le VPS pour les déploiements

```bash
# En tant qu'utilisateur deploy
su - deploy

# Copier les fichiers nécessaires
cp /tmp/cofinco-setup/docker-compose.vps.yml /opt/cofinco/
cp -r /tmp/cofinco-setup/scripts/vps/ /opt/cofinco/scripts/
chmod +x /opt/cofinco/scripts/vps/*.sh

# Login GHCR (utiliser un Personal Access Token avec read:packages)
echo "ghp_YOUR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Cleanup
rm -rf /tmp/cofinco-setup
```

### 3. Configurer GitHub

1. Créer les environments `production` et `preprod`
2. Ajouter tous les secrets et variables (voir section ci-dessus)
3. Ajouter la clé SSH du VPS dans `VPS_SSH_KEY`

### 4. Premier déploiement

```bash
# Depuis votre machine locale
git tag v3.61.0
git push origin v3.61.0
```

Le workflow `release.yml` va :
1. Exécuter les tests (unit + GL contracts)
2. Build et push les images Docker vers GHCR
3. Générer `.env.runtime` depuis les GitHub Secrets
4. SSH sur le VPS et exécuter `deploy.sh`
5. Vérifier la santé de l'application

## Déploiement Quotidien

### Release Production

```bash
# Depuis develop, créer un tag de release
git checkout master
git merge develop
git tag v3.62.0
git push origin master --tags
```

### Release Preprod (Release Candidate)

```bash
# Depuis develop
git tag rc-v3.62.0
git push origin rc-v3.62.0
```

### Rollback

```bash
# Automatique : si le health check échoue après deploy, rollback auto
# Manuel via SSH :
ssh deploy@VPS_IP
bash /opt/cofinco/scripts/vps/rollback.sh              # tag précédent
bash /opt/cofinco/scripts/vps/rollback.sh v3.60.0      # tag spécifique
```

### Vérification

```bash
# Santé de l'application
curl https://cofinco-m.com/api/health

# Logs
ssh deploy@VPS_IP
docker compose -f /opt/cofinco/docker-compose.vps.yml logs -f app
docker compose -f /opt/cofinco/docker-compose.vps.yml logs -f worker

# État des containers
docker compose -f /opt/cofinco/docker-compose.vps.yml ps
```

## PostgreSQL (VPS Natif)

### Connexion app → DB

Les containers Docker accèdent au PG natif via `host.docker.internal` :
```
DATABASE_URL=postgresql://cofinco_app:PASSWORD@host.docker.internal:5432/cofinco
```

Docker résout `host.docker.internal` vers l'IP du host gateway grâce à :
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

### Sécurité

- `listen_addresses = 'localhost'` (pas d'écoute réseau)
- `pg_hba.conf` : scram-sha-256, Docker subnet autorisé
- UFW : port 5432 bloqué en entrée
- Utilisateur `cofinco_app` avec least privileges (pas superuser)

### Maintenance

```bash
# Connexion psql
sudo -u postgres psql -d cofinco

# Taille de la base
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('cofinco'));"

# Vacuum analyze (auto-vacuum est activé par défaut)
sudo -u postgres psql -d cofinco -c "VACUUM ANALYZE;"
```

## Backups

### Exécution manuelle

```bash
bash /opt/cofinco/scripts/vps/backup-db.sh
```

### Vérifier le timer

```bash
systemctl status cofinco-backup.timer
systemctl list-timers cofinco-backup.timer
journalctl -u cofinco-backup.service --since today
```

### Restauration

```bash
# Lister les backups disponibles
ls -lht /opt/cofinco/backups/

# Restaurer (avec confirmation interactive)
bash /opt/cofinco/scripts/vps/restore-db.sh /opt/cofinco/backups/cofinco_2026-02-24_020000.sql.gz

# Restaurer dans une base de test
bash /opt/cofinco/scripts/vps/restore-db.sh backup.sql.gz --target cofinco_test --confirm
```

### Backup offsite (optionnel)

Configurer dans le systemd service ou .bashrc du deploy user :
```bash
export S3_BUCKET=cofinco-backups
export S3_ENDPOINT=https://s3.your-provider.com
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

## Nginx

### Configuration

```bash
# Éditer la config
sudo nano /etc/nginx/sites-available/cofinco

# Tester
sudo nginx -t

# Recharger
sudo systemctl reload nginx
```

### Certbot

```bash
# Vérifier le certificat
sudo certbot certificates

# Renouvellement manuel (normalement automatique)
sudo certbot renew --dry-run

# Forcer le renouvellement
sudo certbot renew --force-renewal
```

### Logs

```bash
# Access log
tail -f /var/log/nginx/cofinco_access.log

# Error log
tail -f /var/log/nginx/cofinco_error.log
```

## Monitoring (Optionnel)

Le stack monitoring existant (Prometheus, Grafana, Loki, Alertmanager) peut être ajouté sur le VPS via un compose overlay séparé :

```bash
# Copier les configs monitoring sur le VPS
scp -r monitoring/ deploy@VPS_IP:/opt/cofinco/

# Créer un overlay monitoring (à adapter du docker-compose.yml existant)
# Puis lancer :
docker compose -f docker-compose.vps.yml -f docker-compose.monitoring.yml up -d
```

Grafana est accessible via `/grafana/` (proxy Nginx, accès restreint localhost).

## Tagging Convention

| Pattern | Environnement | Exemple |
|---|---|---|
| `vX.Y.Z` | Production | `v3.61.0`, `v4.0.0` |
| `rc-vX.Y.Z` | Preprod | `rc-v3.62.0`, `rc-v4.0.0-beta.1` |

### Semantic Versioning

- **MAJOR** (vX.0.0) : Breaking changes, migration majeure
- **MINOR** (v0.X.0) : Nouvelles fonctionnalités, rétrocompatible
- **PATCH** (v0.0.X) : Bug fixes, correctifs urgents

### Tags automatiques (optionnel, futur)

Pour automatiser le tagging avec conventional commits :
1. Installer `release-please` ou `semantic-release`
2. Configurer un workflow qui crée les tags automatiquement
3. Les workflows de déploiement restent identiques

## Troubleshooting

### L'app ne démarre pas

```bash
# Vérifier les logs
docker compose -f /opt/cofinco/docker-compose.vps.yml logs app

# Vérifier la connectivité DB
docker run --rm --network host postgres:16-alpine \
  pg_isready -h localhost -p 5432 -U cofinco_app

# Vérifier Redis
docker compose -f /opt/cofinco/docker-compose.vps.yml exec redis redis-cli ping
```

### Health check échoue

```bash
# Test direct
curl -v http://127.0.0.1:5000/api/health

# Test via Nginx
curl -v https://cofinco-m.com/api/health

# Si 502/503, vérifier que le container tourne
docker ps | grep cofinco
```

### DB init échoue

```bash
# Logs du db-init
docker logs cofinco-db-init

# Relancer manuellement
docker compose -f /opt/cofinco/docker-compose.vps.yml run --rm db-init
```

### Disk space

```bash
# Docker
docker system df
docker image prune -a --filter "until=168h"  # images > 7 jours

# Backups
du -sh /opt/cofinco/backups/

# Logs
du -sh /opt/cofinco/logs/
journalctl --vacuum-size=500M
```
