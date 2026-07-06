# MicroFlex — Mode Operatoire de Deploiement (VPS OVH)

> Guide complet et pratique pour deployer MicroFlex sur un VPS OVH.
> Teste et valide sur VPS OVH Rise-4 (64GB RAM, 16 vCores, 350GB SSD).

---

## Table des matieres

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Etape 1 — Provisionner le VPS](#etape-1--provisionner-le-vps)
4. [Etape 2 — Configurer GitHub](#etape-2--configurer-github)
5. [Etape 3 — Preparer le VPS pour les deploiements](#etape-3--preparer-le-vps-pour-les-deploiements)
6. [Etape 4 — Premier deploiement](#etape-4--premier-deploiement)
7. [Etape 5 — Verification post-deploiement](#etape-5--verification-post-deploiement)
8. [Deploiements suivants](#deploiements-suivants)
9. [Rollback](#rollback)
10. [Maintenance](#maintenance)
11. [Troubleshooting](#troubleshooting)
12. [Reference rapide](#reference-rapide)

---

## Architecture

```
VPS OVH (Ubuntu 22.04/24.04 LTS)
├── Services natifs (hors Docker) :
│   ├── PostgreSQL 16 (localhost:5432, scram-sha-256)
│   ├── Nginx (reverse proxy, ports 80/443, least_conn)
│   └── Certbot (auto-renew Let's Encrypt)
│
├── Services Docker (bridge network: microfinance_net) :
│   ├── app x3 (API stateless, ports 5001-5003 → Nginx)
│   ├── worker x1 (cron jobs, singleton — NE JAMAIS scaler)
│   ├── redis 7.2 (sessions + cache, 512MB maxmemory)
│   └── minio (stockage documents S3-compatible)
│
├── Backups :
│   ├── pg_dump quotidien (systemd timer, 02:00 UTC)
│   ├── Rotation : 7 jours daily, 4 semaines weekly
│   └── Option offsite : S3-compatible
│
└── CI/CD :
    └── GitHub Actions → tags Git → build GHCR → deploy SSH
```

### Flux reseau

```
Internet
   │
   ▼
Nginx (80/443)
   │ least_conn
   ├──► app:5001
   ├──► app:5002
   └──► app:5003
         │
         ├──► PostgreSQL (host.docker.internal:5432)
         ├──► Redis (redis:6379)
         └──► MinIO (minio:9000)
```

### Allocation des ressources (64GB RAM / 16 vCores)

| Service | Replicas | RAM (limit) | CPU (limit) | Role |
|---|---|---|---|---|
| PostgreSQL (natif) | 1 | ~48 GB | reste | Base de donnees principale |
| app | 3 | 1 GB chacun | 2 CPU | API stateless |
| worker | 1 | 1 GB | 1 CPU | Cron jobs (singleton) |
| redis | 1 | 1 GB | 1 CPU | Sessions + cache |
| minio | 1 | 1 GB | 1 CPU | Stockage documents |
| db-init | 1 (one-shot) | 1 GB | 1 CPU | Schema push + seeds |

---

## Prerequisites

Avant de commencer, vous devez avoir :

- [ ] **Un VPS OVH** avec Ubuntu 22.04 ou 24.04 LTS
- [ ] **Un nom de domaine** pointe vers l'IP du VPS (A record + www CNAME)
- [ ] **Un repo GitHub** avec le code MicroFlex et les workflows CI/CD
- [ ] **Un Personal Access Token GitHub** (PAT) avec scope `read:packages` pour GHCR
- [ ] **Acces root** au VPS (SSH)

### DNS (a faire AVANT le setup)

Configurez les enregistrements DNS pour votre domaine :

```
Type    Nom       Valeur            TTL
A       @         91.134.136.73     3600
CNAME   www       microflex-m.com.    3600
```

> **Important** : Le DNS doit etre propage AVANT de lancer Certbot (etape setup). Verifiez avec `dig +short microflex-m.com`.

---

## Etape 1 — Provisionner le VPS

### 1.1 Se connecter en root

```bash
ssh root@91.134.136.73
```

### 1.2 Cloner le repo (temporairement, pour les scripts)

```bash
git clone https://github.com/242darkman/microflex.git /tmp/microflex-setup
cd /tmp/microflex-setup
```

### 1.3 Lancer le script de setup

```bash
sudo DOMAIN=microflex-m.com ACME_EMAIL=admin@microflex-m.com bash scripts/vps/setup.sh
```

Ce script installe et configure automatiquement :
- **PostgreSQL 16** : base `microflex`, user `microflex_app`, tuning auto (shared_buffers=16GB, etc.)
- **Docker** : daemon avec log rotation, live-restore, subnet `172.20.0.0/16`
- **Nginx** : reverse proxy avec config MicroFlex (least_conn, rate limiting, security headers)
- **Certbot** : certificat SSL Let's Encrypt + auto-renew
- **UFW** : firewall restrictif (SSH + HTTP/HTTPS + PostgreSQL Docker)
- **Fail2ban** : protection SSH + Nginx
- **User `deploy`** : acces Docker, arborescence `/opt/microflex/`
- **Backup timer** : pg_dump quotidien a 02:00 UTC

### 1.4 NOTER les informations affichees

A la fin du script, **notez imperativement** :

```
  PostgreSQL
    Database:  microflex
    User:      microflex_app
    Password:  <MOT_DE_PASSE_GENERE>
    URL:       postgresql://microflex_app:<PASSWORD>@host.docker.internal:5432/microflex
```

> **CRITIQUE** : Le `DATABASE_URL` sera necessaire pour GitHub Secrets. Notez-le maintenant.

### 1.5 Verifier que tout fonctionne

```bash
# PostgreSQL
sudo -u postgres psql -c "SELECT 1;"

# Docker
docker --version
docker compose version

# Nginx
nginx -t
systemctl status nginx

# UFW
ufw status numbered

# Certbot
certbot certificates
```

---

## Etape 2 — Configurer GitHub

### 2.1 Creer les GitHub Environments

Allez dans **Settings → Environments** de votre repo GitHub et creez deux environments :

1. **`production`** — avec protection rules (required reviewers recommande)
2. **`preprod`** — sans protection rules

### 2.2 Generer les secrets de securite

Sur votre machine locale (ou sur le VPS) :

```bash
# Redis password — IMPORTANT : PAS de caracteres speciaux URL (/, +, =, @, :, %)
openssl rand -base64 32 | tr -d '/+=' | head -c 32
# Exemple : 0rYnqEJzeMwTzdrE9UzCHIIhm9evNHxX

# Session secret
openssl rand -base64 32

# OTP HMAC secret
openssl rand -hex 32

# Offline limits HMAC key
openssl rand -hex 32

# MinIO credentials
openssl rand -base64 16 | tr -d '/+=' | head -c 16  # user
openssl rand -base64 32 | tr -d '/+=' | head -c 32  # password
```

> **ATTENTION — REDIS_PASSWORD** : Le mot de passe Redis est utilise directement dans une URL (`redis://:PASSWORD@redis:6379`). Les caracteres `/`, `+`, `=`, `@`, `:`, `%` cassent le parsing de l'URL. Utilisez uniquement des caracteres alphanumeriques.

### 2.3 Configurer les secrets (environment `production`)

Dans **Settings → Environments → production → Environment secrets**, ajoutez :

| Secret | Description | Exemple |
|---|---|---|
| `DATABASE_URL` | URL PostgreSQL (du setup) | `postgresql://microflex_app:xxx@host.docker.internal:5432/microflex` |
| `REDIS_PASSWORD` | Mot de passe Redis (alphanum only) | `0rYnqEJzeMwTzdrE9UzCHIIhm9evNHxX` |
| `SESSION_SECRET` | Secret sessions Express | `openssl rand -base64 32` |
| `OTP_HMAC_SECRET` | Secret HMAC pour OTP | `openssl rand -hex 32` |
| `OFFLINE_LIMITS_HMAC_KEY` | Secret HMAC offline | `openssl rand -hex 32` |
| `MINIO_ROOT_USER` | User MinIO | `microflex_minio_admin` |
| `MINIO_ROOT_PASSWORD` | Password MinIO | `openssl rand -base64 32` |
| `SMTP_HOST` | Serveur SMTP | `smtp-relay.brevo.com` |
| `SMTP_USERNAME` | User SMTP | (votre login SMTP) |
| `SMTP_PASSWORD` | Password SMTP | (votre password SMTP) |
| `MTN_SMS_CLIENT_ID` | API MTN SMS | (optionnel) |
| `MTN_SMS_CLIENT_SECRET` | API MTN SMS | (optionnel) |
| `MTN_SMS_WEBHOOK_SECRET` | Webhook MTN SMS | (optionnel) |
| `PAWAPAY_API_TOKEN` | API pawaPay | (optionnel) |
| `PAWAPAY_WEBHOOK_PUBLIC_KEYS` | Cles publiques pawaPay | (optionnel) |
| `GRAFANA_ADMIN_PASSWORD` | Admin Grafana | (optionnel) |
| `VPS_HOST` | IP du VPS | `91.134.136.73` |
| `VPS_USER` | Utilisateur SSH | `deploy` |
| `VPS_SSH_KEY` | Cle privee SSH | (contenu de `~/.ssh/id_ed25519`) |

### 2.4 Configurer les variables (environment `production`)

Dans **Settings → Environments → production → Environment variables**, ajoutez :

| Variable | Valeur |
|---|---|
| `DOMAIN` | `microflex-m.com` |
| `MINIO_PUBLIC_ENDPOINT` | `https://microflex-m.com/storage` |
| `SMTP_PORT` | `587` |
| `SMTP_FROM_EMAIL` | `noreply@microflex-m.com` |
| `SMTP_FROM_NAME` | `MICROFLEX-M` |
| `SMTP_SECURE` | `false` |
| `MTN_SMS_SENDER_ID` | `MICROFLEX` |
| `MTN_SMS_TOKEN_URL` | (URL token MTN) |
| `MTN_SMS_BASE_URL` | (URL base MTN) |
| `PAWAPAY_ENVIRONMENT` | `production` |
| `PAWAPAY_CALLBACK_URL` | `https://microflex-m.com/api/webhooks/pawapay` |
| `PAWAPAY_STATEMENT_PREFIX` | `MicroFlex` |
| `WEBHOOK_IP_VALIDATION` | `true` |
| `GL_POSTING_MODE` | `STRICT` |
| `BALANCE_RECONCILIATION_INTERVAL_MINUTES` | `60` |
| `ENABLE_BALANCE_AUTO_CORRECTION` | `false` |
| `LOG_LEVEL` | `info` |
| `APP_REPLICAS` | `3` |
| `GRAFANA_ADMIN_USER` | `admin` |

### 2.5 Configurer la cle SSH de deploiement

La cle SSH doit permettre au runner GitHub Actions de se connecter au VPS en tant que `deploy`.

**Option A** (recommande) : Generer une cle dediee sur votre machine locale :
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/microflex-deploy
# Copier la cle publique sur le VPS
ssh-copy-id -i ~/.ssh/microflex-deploy.pub deploy@91.134.136.73
# Copier le contenu de la cle PRIVEE dans le secret VPS_SSH_KEY
cat ~/.ssh/microflex-deploy
```

**Option B** : Reutiliser la cle du VPS (deja copiee par setup.sh vers l'user deploy).

---

## Etape 3 — Preparer le VPS pour les deploiements

### 3.1 Copier les fichiers necessaires

```bash
ssh deploy@91.134.136.73
```

```bash
# Depuis le clone temporaire (si encore present)
cp /tmp/microflex-setup/docker-compose.vps.yml /opt/microflex/
cp -r /tmp/microflex-setup/scripts/vps/ /opt/microflex/scripts/
cp -r /tmp/microflex-setup/infra/ /opt/microflex/infra/
chmod +x /opt/microflex/scripts/vps/*.sh

# Nettoyer le clone temporaire
rm -rf /tmp/microflex-setup
```

> **Si le clone a deja ete supprime**, copiez les fichiers depuis votre machine locale :
> ```bash
> scp docker-compose.vps.yml deploy@91.134.136.73:/opt/microflex/
> scp -r scripts/vps/ deploy@91.134.136.73:/opt/microflex/scripts/
> scp -r infra/ deploy@91.134.136.73:/opt/microflex/infra/
> ```

### 3.2 Se connecter a GHCR (GitHub Container Registry)

```bash
# Sur le VPS, en tant que deploy
ssh deploy@91.134.136.73

# Login GHCR avec un Personal Access Token (scope: read:packages)
echo "ghp_VOTRE_TOKEN" | docker login ghcr.io -u VOTRE_USERNAME_GITHUB --password-stdin
```

> Le login est persistant (credentials stockees dans `~/.docker/config.json`).

### 3.3 Creer les repertoires manquants

```bash
mkdir -p /opt/microflex/{logs,data/geonames}
```

### 3.4 Verifier l'arborescence

```bash
tree /opt/microflex/ -L 2
```

Resultat attendu :
```
/opt/microflex/
├── backups/
├── data/
│   └── geonames/
├── docker-compose.vps.yml
├── env/
│   └── .env.runtime   (sera genere par CI/CD au premier deploy)
├── infra/
│   └── nginx/
├── logs/
└── scripts/
    └── vps/
        ├── backup-db.sh
        ├── deploy.sh
        ├── rollback.sh
        └── setup.sh
```

---

## Etape 4 — Premier deploiement

### 4.1 Creer et pousser un tag

Depuis votre machine locale, sur la branche `master` :

```bash
git checkout master
git tag v2.0.0
git push origin v2.0.0
```

### 4.2 Le pipeline CI/CD s'execute automatiquement

Le workflow `.github/workflows/release.yml` :

1. **Parse tag** : `v2.0.0` → environment `production`
2. **Tests** : unit tests + GL contract tests (en parallele)
3. **Build** : images Docker `runtime` + `init` → GHCR
4. **Deploy** :
   - Genere `.env.runtime` depuis les GitHub Secrets
   - Upload `.env.runtime` vers `/opt/microflex/env/` via SCP
   - Execute `deploy.sh v2.0.0` via SSH

### 4.3 Ce que fait `deploy.sh`

1. Sauvegarde le tag precedent (pour rollback)
2. Met a jour `APP_VERSION` dans `.env.runtime`
3. Pull les images depuis GHCR
4. **DB init** (one-shot) :
   - Telecharge GeoNames (~1.6 GB, cache dans `/opt/microflex/data/geonames/`)
   - Schema push (`drizzle-kit push --force`)
   - SQL functions/triggers/views (`ensure-sql.ts`)
   - Seeds production (`seed-prod.ts`)
5. Demarre les containers (`docker compose up -d`)
6. Health check app (30 tentatives, 2s interval)
7. Health check worker
8. Nettoyage des anciennes images
9. Sauvegarde du tag reussi

### 4.4 Surveiller le deploiement

Dans GitHub Actions → onglet "Actions" → workflow "Release & Deploy", suivez l'avancement.

Le premier deploiement est plus long car :
- Le DB init cree toutes les tables et seeds (~70 SQL objects, 143k villes GeoNames)
- Les images Docker sont telechargees pour la premiere fois

**Duree estimee du premier deploiement** : 8-15 minutes (selon la bande passante).

---

## Etape 5 — Verification post-deploiement

### 5.1 Verifier les containers

```bash
ssh deploy@91.134.136.73
docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime ps
```

Resultat attendu :
```
NAME              IMAGE                                    STATUS                   PORTS
microflex-app-1     ghcr.io/242darkman/microflex:v2.0.0       Up (healthy)             127.0.0.1:5001->5000/tcp
microflex-app-2     ghcr.io/242darkman/microflex:v2.0.0       Up (healthy)             127.0.0.1:5002->5000/tcp
microflex-app-3     ghcr.io/242darkman/microflex:v2.0.0       Up (healthy)             127.0.0.1:5003->5000/tcp
microflex-worker    ghcr.io/242darkman/microflex:v2.0.0       Up (healthy)             5000/tcp
microflex-redis     redis:7.2-alpine                        Up (healthy)             6379/tcp
microflex-minio     minio/minio:...                         Up (healthy)             127.0.0.1:9001->9001/tcp
```

### 5.2 Verifier la sante de l'API

```bash
# Depuis le VPS (direct)
curl http://127.0.0.1:5001/api/health

# Depuis l'exterieur (via Nginx + HTTPS)
curl https://microflex-m.com/api/health
```

Reponse attendue : `{"status":"ok"}` (HTTP 200)

### 5.3 Verifier les cron jobs (worker)

```bash
docker logs microflex-worker --tail 50
```

Les crons doivent s'afficher (ils tournent UNIQUEMENT sur le worker, pas sur les 3 instances app) :
```
[CRON] CoffreBalanceSnapshots: scheduled ...
[CRON] TreasuryReconciliation: scheduled ...
[CRON] PaymentReconciliation: scheduled ...
```

### 5.4 Verifier le seeding GeoNames

```bash
ssh deploy@91.134.136.73
sudo -u postgres psql -d microflex -c "SELECT COUNT(*) AS total_villes FROM villes;"
```

Resultat attendu : `143699` villes.

### 5.5 Verifier les backups

```bash
systemctl status microflex-backup.timer
systemctl list-timers microflex-backup.timer
```

### 5.6 Verifier Nginx et SSL

```bash
# Certificat SSL
sudo certbot certificates

# Config Nginx
sudo nginx -t

# Logs d'acces
tail -5 /var/log/nginx/microflex_access.log
```

---

## Deploiements suivants

### Release Production

```bash
# Depuis votre machine locale
git checkout master
git merge develop       # ou cherry-pick des commits specifiques
git tag vX.Y.Z          # ex: v2.1.0
git push origin master --tags
```

Le pipeline se declenche automatiquement sur le tag `v*`.

### Release Preprod (Release Candidate)

```bash
git tag rc-vX.Y.Z       # ex: rc-v2.1.0
git push origin rc-vX.Y.Z
```

Deploie sur l'environment GitHub `preprod` (meme infrastructure, config differente).

### Deploiement manuel (urgence)

Si le CI/CD est en panne, deployer directement depuis le VPS :

```bash
ssh deploy@91.134.136.73
bash /opt/microflex/scripts/vps/deploy.sh v2.1.0
```

> **Prerequis** : le `.env.runtime` doit deja contenir les bonnes valeurs et les images doivent etre disponibles sur GHCR.

### Convention de tags

| Pattern | Environnement | Exemple |
|---|---|---|
| `vX.Y.Z` | Production | `v2.0.0`, `v2.1.0` |
| `rc-vX.Y.Z` | Preprod | `rc-v2.1.0`, `rc-v3.0.0-beta.1` |

- **MAJOR** (vX.0.0) : Breaking changes, migration majeure
- **MINOR** (v0.X.0) : Nouvelles fonctionnalites
- **PATCH** (v0.0.X) : Bug fixes, correctifs urgents

---

## Rollback

### Rollback automatique

Si le health check echoue apres un deploiement, `deploy.sh` tente automatiquement un rollback vers le tag precedent.

### Rollback manuel

```bash
ssh deploy@91.134.136.73

# Rollback au tag precedent
bash /opt/microflex/scripts/vps/rollback.sh

# Rollback a un tag specifique
bash /opt/microflex/scripts/vps/rollback.sh v2.0.0
```

Le rollback :
1. Pull les images de l'ancien tag
2. Redemarre les containers
3. Verifie la sante (20 tentatives)
4. **NE relance PAS le DB init** (le schema doit etre retro-compatible)

> **Attention** : Si une migration de schema non-retrocompatible a ete appliquee, un rollback applicatif seul peut ne pas suffire. Il faudra aussi restaurer la base.

---

## Maintenance

### Backups PostgreSQL

```bash
# Lancer un backup manuel
bash /opt/microflex/scripts/vps/backup-db.sh

# Verifier le timer automatique
systemctl status microflex-backup.timer
journalctl -u microflex-backup.service --since today

# Lister les backups
ls -lht /opt/microflex/backups/

# Restaurer un backup
sudo -u postgres pg_restore -d microflex -c /opt/microflex/backups/microflex_2026-02-24_020000.sql.gz
```

### Logs

```bash
# Logs applicatifs (docker)
docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime logs -f app
docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime logs -f worker

# Logs de deploiement
cat /opt/microflex/logs/deploy.log

# Logs Nginx
tail -f /var/log/nginx/microflex_access.log
tail -f /var/log/nginx/microflex_error.log
```

### PostgreSQL

```bash
# Connexion psql
sudo -u postgres psql -d microflex

# Taille de la base
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('microflex'));"

# Vacuum analyze
sudo -u postgres psql -d microflex -c "VACUUM ANALYZE;"

# Requetes lentes (> 1s, logged par defaut)
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

### Docker

```bash
# Espace disque Docker
docker system df

# Nettoyage images non utilisees (> 7 jours)
docker image prune -a --filter "until=168h"

# Nettoyage complet (attention : supprime les volumes non utilises)
docker system prune --volumes
```

### Certbot

```bash
# Verifier le certificat
sudo certbot certificates

# Test du renouvellement automatique
sudo certbot renew --dry-run

# Forcer le renouvellement
sudo certbot renew --force-renewal
```

### MinIO (console admin)

Accessible via SSH tunnel uniquement :

```bash
# Depuis votre machine locale
ssh -L 9001:127.0.0.1:9001 deploy@91.134.136.73
# Puis ouvrir http://localhost:9001 dans votre navigateur
```

---

## Troubleshooting

### L'app ne demarre pas

```bash
# 1. Verifier les logs
docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime logs app --tail 100

# 2. Verifier la connectivite PostgreSQL
docker run --rm --network host postgres:16-alpine \
  pg_isready -h localhost -p 5432 -U microflex_app

# 3. Verifier Redis
docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime exec redis redis-cli -a "VOTRE_REDIS_PASSWORD" ping

# 4. Verifier MinIO
docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime exec minio mc ready local
```

### Erreur PostgreSQL : connection timeout depuis Docker

**Symptome** : Les containers ne peuvent pas se connecter a PostgreSQL (timeout).

**Cause** : UFW bloque le port 5432 pour les containers Docker.

**Solution** :
```bash
# Verifier les regles UFW
sudo ufw status numbered

# La regle suivante DOIT etre presente :
# [ X] 5432/tcp    ALLOW IN    172.16.0.0/12    # PostgreSQL from Docker

# Si absente :
sudo ufw allow from 172.16.0.0/12 to any port 5432 proto tcp comment 'PostgreSQL from Docker'
```

### Erreur Redis : Invalid URL

**Symptome** : `TypeError: Invalid URL` dans les logs de l'app.

**Cause** : Le `REDIS_PASSWORD` contient des caracteres speciaux (`/`, `+`, `=`, `@`).

**Solution** : Generer un nouveau mot de passe sans caracteres speciaux :
```bash
openssl rand -base64 32 | tr -d '/+=' | head -c 32
```
Mettre a jour le secret `REDIS_PASSWORD` dans GitHub Environments et redeployer.

### Erreur deploy : "container name already in use"

**Symptome** : `microflex-db-init` "is already in use by container".

**Cause** : Un deploy precedent a echoue et le container init n'a pas ete nettoye.

**Solution** : Le script `deploy.sh` gere ce cas automatiquement (`docker rm -f`). Si le probleme persiste :
```bash
docker rm -f microflex-db-init
```

### DB init echoue

```bash
# Relancer manuellement le db-init
bash /opt/microflex/scripts/vps/deploy.sh v2.0.0
# (le deploy.sh relance le db-init)

# Ou relancer uniquement le db-init via compose
docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime run --rm db-init
```

### Health check echoue (502/503)

```bash
# 1. Verifier que les containers tournent
docker ps | grep microflex

# 2. Test direct sur un container
curl -v http://127.0.0.1:5001/api/health

# 3. Test via Nginx
curl -v https://microflex-m.com/api/health

# 4. Verifier Nginx
sudo nginx -t
sudo systemctl status nginx
tail -20 /var/log/nginx/microflex_error.log
```

### Espace disque sature

```bash
# Verifier l'espace
df -h

# Docker (images, volumes, build cache)
docker system df
docker image prune -a --filter "until=168h"

# Backups
du -sh /opt/microflex/backups/

# Logs systeme
sudo journalctl --vacuum-size=500M

# Logs Docker
docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime logs --tail 0
# Les logs Docker sont limites a 10MB x 5 fichiers par container (daemon.json)
```

### GeoNames non seedees (0 villes)

**Cause** : Le download GeoNames a echoue (reseau, timeout).

**Solution** : Le cache dans `/opt/microflex/data/geonames/` evite le re-telechargement. Si le cache est vide, redeployer relancera le download.

```bash
# Verifier le cache
ls -lh /opt/microflex/data/geonames/
# Devrait contenir allCountries.txt (~1.6 GB) et cities5000.txt

# Si vide, supprimer le cache et redeployer
rm -rf /opt/microflex/data/geonames/*
bash /opt/microflex/scripts/vps/deploy.sh vX.Y.Z
```

---

## Reference rapide

### Commandes essentielles

```bash
# Alias utile (a ajouter dans ~/.bashrc du user deploy)
alias cdc='docker compose -f /opt/microflex/docker-compose.vps.yml --env-file /opt/microflex/env/.env.runtime'

# Etat des containers
cdc ps

# Logs en temps reel
cdc logs -f app
cdc logs -f worker

# Redemarrer un service
cdc restart app

# Deployer un tag
bash /opt/microflex/scripts/vps/deploy.sh v2.1.0

# Rollback
bash /opt/microflex/scripts/vps/rollback.sh

# Backup manuel
bash /opt/microflex/scripts/vps/backup-db.sh
```

### Ports (tous sur localhost sauf 80/443)

| Port | Service | Acces |
|---|---|---|
| 80/443 | Nginx | Public |
| 5001-5003 | app x3 | Localhost (Nginx upstream) |
| 5432 | PostgreSQL | Localhost + Docker subnet |
| 6379 | Redis | Docker network uniquement |
| 9000 | MinIO API | Docker network uniquement |
| 9001 | MinIO Console | Localhost (SSH tunnel) |

### Fichiers importants sur le VPS

```
/opt/microflex/
├── docker-compose.vps.yml       # Compose principal
├── env/.env.runtime             # Variables d'environnement (genere par CI)
├── env/.previous-tag            # Tag precedent (pour rollback)
├── scripts/vps/deploy.sh        # Script de deploiement
├── scripts/vps/rollback.sh      # Script de rollback
├── scripts/vps/backup-db.sh     # Script de backup PostgreSQL
├── logs/deploy.log              # Historique des deploiements
├── backups/                     # Backups PostgreSQL quotidiens
└── data/geonames/               # Cache GeoNames (~1.6 GB)
```

### Variables d'environnement

Voir `.env.vps.example` pour la liste complete avec descriptions.

Classification :
- **Secrets** (GitHub Environment Secrets) : DATABASE_URL, REDIS_PASSWORD, SESSION_SECRET, OTP_HMAC_SECRET, MINIO_*, SMTP_PASSWORD, VPS_SSH_KEY, etc.
- **Variables** (GitHub Environment Variables) : DOMAIN, GL_POSTING_MODE, LOG_LEVEL, APP_REPLICAS, SMTP_PORT, etc.

### Matrice CI/CD

| Tag | Environment | Images GHCR | Deploy |
|---|---|---|---|
| `v*` | production | `vX.Y.Z` + `latest` + `sha-xxx` | VPS via SSH |
| `rc-*` | preprod | `rc-vX.Y.Z` + `sha-xxx` | VPS via SSH |