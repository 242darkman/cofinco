# Asset-Tracker (Cofinco) - Guide Go-Live Production

Application de microfinance (Node.js/React/PostgreSQL/Drizzle/MinIO) dockerisee pour un deploiement securise, performant et resilent sur VPS.

## Points clefs

- API/Client serves par un conteneur app Node.js.
- Postgres et MinIO accessibles uniquement sur le reseau interne Docker.
- Nginx en reverse proxy expose les ports 80/443, compression gzip + brotli pour mobile-first.
- Audit d'integrite comptable disponible via `npm run audit:integrity`.
- Backups chiffrables et rotation automatique.

## Prerequis

- Docker + Docker Compose
- Un nom de domaine pointe sur le VPS
- Acces SSH au VPS
- (Optionnel) gpg pour le chiffrement des backups
- (Optionnel) aws cli pour l'upload S3

## Fichiers importants

- `docker-compose.prod.yml` : stack production avec reseaux isoles et rotation de logs.
- `deploy/nginx/default.conf` : reverse proxy, SSL, gzip/brotli, cache des assets.
- `deploy/nginx/Dockerfile` : installe le module brotli pour Nginx.
- `deploy/postgresql/postgresql.conf` : tuning de base Postgres.
- `scripts/backup.sh` / `scripts/backup-daily.sh` : sauvegarde et rotation.
- `scripts/audit-integrity.ts` : audit d'integrite comptable.

## Configuration production

1) Creer le fichier d'environnement
   - Copier ` .env.production.example` vers `.env.production`.
   - Completer les valeurs (ne jamais commiter ce fichier).
   - Exemple de DB URL (utiliser `db` comme host Docker):
     - `DATABASE_URL=postgresql://user:password@db:5432/cofinco`

2) Configurer Nginx
   - Modifier `server_name` dans `deploy/nginx/default.conf`.
   - Verifier les chemins SSL:
     - `/etc/letsencrypt/live/<domaine>/fullchain.pem`
     - `/etc/letsencrypt/live/<domaine>/privkey.pem`

3) Obtenir le certificat SSL (premiere fois)
   - Demarrer la stack pour servir le challenge:
     - `docker compose -f docker-compose.prod.yml up -d nginx`
   - Lancer Certbot (profil):
     - `docker compose -f docker-compose.prod.yml --profile certbot run --rm certbot certonly --webroot -w /var/www/certbot -d example.com --email you@example.com --agree-tos --no-eff-email`

4) Demarrer la stack complete
   - `docker compose -f docker-compose.prod.yml up -d --build`
   - Verifier la sante:
     - `https://<domaine>/api/health`

## Hardening (resume)

- Headers securite et CSP via Helmet dans `server/index.ts`.
- Rate limiting deja applique sur `/api` et `/api/auth/login`.
- Pour CSRF strict, ajouter `csurf` ou double-submit token.
- Zod: preferer `.strict()` sur les schemas d'entree critiques.

## Mobile-first (compression)

- Gzip et Brotli sont actives dans `deploy/nginx/default.conf`.
- Les assets statiques sont caches long terme (immutable).

## Backups & Disaster Recovery

Script principal: `scripts/backup.sh`

Variables utiles:
- `ENV_FILE` (default `.env.production`)
- `BACKUP_DIR` (default `./backups`)
- `RETENTION_DAYS` (default `7`)
- `GPG_RECIPIENT` ou `GPG_PASSPHRASE`
- `BACKUP_S3_URI` (ex: `s3://my-bucket/backups`)
- `MINIO_VOLUME` (default `cofinco_minio_data`)

Execution manuelle:
- `./scripts/backup.sh`

Cron quotidien (3h00):
- `0 3 * * * /opt/asset-tracker/scripts/backup-daily.sh >> /var/log/asset-tracker-backup.log 2>&1`

## Audit d'integrite

Commande:
- `npm run audit:integrity`

Note: en conteneur prod, `tsx` (dev dependency) n'est pas present. Pour un audit horaire:
- Lancer le script depuis l'hote (repo complet), ou
- Creer un conteneur "audit" avec les dev deps, ou
- Compiler un binaire JS de l'audit.

## Observabilite

- Rotation des logs Docker activee dans `docker-compose.prod.yml`.
- Ajuster les seuils si besoin (`max-size`, `max-file`).

## CI/CD (optionnel)

Workflow: `.github/workflows/deploy.yml`

Secrets requis:
- `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`

Le pipeline:
- `npm test`
- `npm run audit:integrity`
- Build + push image GHCR
- Deploy SSH (pull + up -d)

## Remarques importantes

- Ne jamais exposer Postgres/MinIO publiquement.
- Verifier que `.env.production` n'est pas commite.
- Ajuster la config Postgres selon la RAM du VPS.
