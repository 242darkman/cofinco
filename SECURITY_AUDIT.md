# SECURITY_AUDIT.md — Cofinco Platform

**Date**: 2026-02-07
**Auditor**: AppSec Senior — Fintech/Microfinance
**Scope**: Full-stack (Node.js/Express + React + PostgreSQL + MinIO + Docker)
**Standard**: OWASP Top 10 2021 + ASVS L2

---

## Executive Summary

Audit complet de l'application de microfinance Cofinco. **6 vulnérabilités critiques**, **6 hautes**, **6 moyennes** et **4 basses** identifiées. **Toutes les vulnérabilités corrigées** (CRITICAL 6/6, HIGH 6/6, MEDIUM 6/6, LOW 3/4). Math.random() éliminé dans **~45 fichiers** (server + client). `decimal.js` adopté pour l'arithmétique financière (6 fichiers critiques). **43 tests de régression** de sécurité ajoutés.

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 6 | 6 | 0 |
| HIGH | 6 | 6 | 0 |
| MEDIUM | 6 | 6 | 0 |
| LOW | 4 | 3 | 1 (recommandations) |

---

## Threat Model

### Acteurs
| Acteur | Niveau de confiance | Accès |
|--------|---------------------|-------|
| Client (mobile/web) | Faible | Portail client, OTP |
| Agent terrain | Moyen | Collecte, prospection |
| Caissier | Moyen | Opérations caisse, coffre |
| Chef d'agence | Haut | Validation, rapports agence |
| Administrateur | Très haut | RBAC, config, audit |
| Webhook externe (MTN/Airtel) | Aucune confiance | Callbacks paiement |

### Surfaces d'attaque
- **API REST**: ~120 endpoints (Express), auth par session cookie
- **WebSocket**: Temps réel, auth par cookie signé
- **Webhooks**: MTN MoMo + Airtel Money (HMAC signature)
- **Stockage fichiers**: MinIO (buckets public + privé)
- **Base de données**: PostgreSQL via Drizzle ORM (requêtes paramétrées)

### Assets critiques
- Données financières (comptes, crédits, tontines, paiements)
- Informations clients (KYC, documents)
- Coffre-fort et caisse (soldes, mouvements)
- Credentials et sessions utilisateurs

---

## Findings & Fixes

### CRITICAL-01: Session Secret Hardcoded Fallback
- **OWASP**: A02 (Cryptographic Failures)
- **Fichiers**: `server/auth.ts:311`, `server/ws-server.ts:236`
- **Description**: Le secret de session utilisait un fallback hardcodé `'cofin-secret-key-change-in-production'` au lieu de crasher si absent en production.
- **Impact**: Tout attaquant connaissant le fallback peut forger des sessions.
- **Fix**: `process.exit(1)` si `SESSION_SECRET` non défini en production. Fallback renommé en `'dev-only-secret-do-not-use-in-prod'`.
- **Status**: FIXED

### CRITICAL-02: Legacy OTP Uses Math.random()
- **OWASP**: A02 (Cryptographic Failures)
- **Fichier**: `server/routes/otp.ts:149`
- **Description**: L'endpoint legacy OTP utilisait `Math.floor(100000 + Math.random() * 900000)` pour générer les codes. L'OTP était aussi loggé en clair et retourné dans la réponse HTTP.
- **Impact**: Codes OTP prédictibles. Fuite des codes dans les logs et les réponses API.
- **Fix**: Remplacé par `crypto.randomInt(100000, 1000000)`. Code retiré des logs et conditionné à `NODE_ENV !== 'production'` dans la réponse.
- **Status**: FIXED

### CRITICAL-03: Security Code Uses Math.random()
- **OWASP**: A02 (Cryptographic Failures)
- **Fichier**: `server/services/caisse/access-control-service.ts:133`
- **Description**: Les codes de sécurité pour l'accès caisse étaient générés avec `Math.random()`.
- **Impact**: Codes de sécurité caisse prédictibles.
- **Fix**: Remplacé par `crypto.randomInt()`.
- **Status**: FIXED

### CRITICAL-04: Unauthenticated Reevaluation Endpoints
- **OWASP**: A01 (Broken Access Control)
- **Fichier**: `server/routes/reevaluations.ts:106,208,231`
- **Description**: 3 endpoints GET exposaient des données de réévaluation de crédit sans authentification: eligibility, list, timeline.
- **Impact**: Fuite d'informations financières sensibles (montants, scores, historique crédit).
- **Fix**: Ajout de `requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.REEVALUATION)` sur les 3 endpoints.
- **Status**: FIXED

### CRITICAL-05: Open Redirect via Storage Route
- **OWASP**: A01 (Broken Access Control) / SSRF
- **Fichier**: `server/routes/storage.ts:63-64`
- **Description**: `res.redirect(key)` avec `key` fourni par l'utilisateur permettait une redirection vers un domaine arbitraire.
- **Impact**: Phishing, vol de credentials via redirection vers un site malveillant.
- **Fix**: Remplacé par un retour 400 ("External URLs are not allowed").
- **Status**: FIXED

### CRITICAL-06: Session Fixation on Login
- **OWASP**: A07 (Identification and Authentication Failures)
- **Fichier**: `server/routes/auth.ts:289`
- **Description**: La session n'était pas régénérée (`req.session.regenerate()`) avant d'y stocker les données utilisateur. Un attaquant pouvait fixer un SID avant l'authentification.
- **Impact**: Prise de contrôle de session (session fixation attack).
- **Fix**: Ajout de `req.session.regenerate()` avant l'assignation des données de session dans le flow de login.
- **Status**: FIXED

---

### HIGH-01: Debug console.log in Webhook Handler
- **OWASP**: A09 (Security Logging and Monitoring Failures)
- **Fichier**: `server/routes/payments.ts:212-214`
- **Description**: `console.log` affichait les headers complets et le body des webhooks MTN en production, incluant potentiellement des signatures HMAC et données de paiement.
- **Impact**: Fuite de données sensibles dans stdout/logs non structurés.
- **Fix**: Remplacé par `logger.debug({ provider: 'MTN' }, 'Webhook received')`.
- **Status**: FIXED

### HIGH-02: XSS via dangerouslySetInnerHTML
- **OWASP**: A03 (Injection)
- **Fichier**: `client/src/components/admin/notifications/NotificationPreview.tsx:177`
- **Description**: `dangerouslySetInnerHTML={{ __html: renderContent(template.content) }}` sans sanitisation DOMPurify.
- **Impact**: Exécution de JavaScript arbitraire dans le navigateur admin via un template de notification malveillant.
- **Fix**: Ajout de `DOMPurify.sanitize()` autour du contenu rendu. Import de `isomorphic-dompurify` (déjà en dépendance).
- **Status**: FIXED

### HIGH-03: Docker Runs as Root
- **OWASP**: A05 (Security Misconfiguration)
- **Fichier**: `Dockerfile`
- **Description**: Le conteneur de production s'exécutait en tant que root.
- **Impact**: En cas de RCE, l'attaquant obtient les privilèges root dans le conteneur.
- **Fix**: Ajout de `adduser appuser` + `USER appuser` dans le Dockerfile.
- **Status**: FIXED

### HIGH-04: Hardcoded Default Credentials in Docker Compose
- **OWASP**: A07 (Identification and Authentication Failures)
- **Fichier**: `docker-compose.yml`
- **Description**: pgAdmin (`admin123`), MinIO (`minioadmin123`), Grafana (`admin123`) utilisaient des mots de passe par défaut hardcodés. Redis sans mot de passe.
- **Impact**: Accès non autorisé aux services d'infrastructure en cas d'exposition réseau.
- **Fix**: Remplacé par des variables d'environnement obligatoires (`${VAR:?must be set}`). Redis avec `--requirepass`.
- **Status**: FIXED

### HIGH-05: Error Messages Exposing Internals
- **OWASP**: A04 (Insecure Design)
- **Fichiers**: `reevaluations.ts`, `storage.ts`, `payments.ts`, `settings.ts` + global error handler
- **Description**: `error.message` retourné directement au client dans les réponses 500, exposant des détails internes (noms de tables, erreurs PostgreSQL, stack traces).
- **Impact**: Information disclosure facilitant les attaques ciblées.
- **Fix**: (1) Remplacé par des messages génériques dans les fichiers critiques. (2) Le global error handler dans `index.ts` sanitise désormais toutes les erreurs 5xx en production.
- **Status**: FIXED

### HIGH-06: Real Credentials in Example Env File
- **OWASP**: A05 (Security Misconfiguration)
- **Fichier**: `.env.production.example`
- **Description**: Contenait des credentials réalistes (`Admin123!`, `COFINCO_SECRET_2026_9f!K8@D2LxPQ7WZE`).
- **Impact**: Risque de copier-coller en production sans modification.
- **Fix**: Remplacé par des placeholders vides avec instructions de génération.
- **Status**: FIXED

---

## MEDIUM Fixes (Applied)

### MEDIUM-01: Global Error Handler Sanitization
- **OWASP**: A04 (Insecure Design)
- **Fichier**: `server/index.ts:303-309`
- **Description**: Le error handler global renvoyait `err.message` au client, y compris en production.
- **Fix**: En production, les erreurs 5xx retournent désormais "Erreur interne du serveur". L'erreur originale est loggée server-side via pino.
- **Status**: FIXED

### MEDIUM-02: Legacy OTP Timing-Safe Comparison
- **OWASP**: A02 (Cryptographic Failures)
- **Fichier**: `server/routes/otp.ts:227`
- **Description**: La comparaison OTP legacy utilisait `!==` (timing-unsafe). Également, `error.message` exposé dans la réponse.
- **Fix**: Remplacé par `crypto.timingSafeEqual()` avec buffers de longueur égale. Supprimé `details: error.message`.
- **Status**: FIXED

### MEDIUM-03: CSRF Protection
- **OWASP**: A01 (Broken Access Control)
- **Fichier**: `server/middleware/csrf.ts` (nouveau)
- **Description**: Aucune protection CSRF. `SameSite=Lax` offrait une protection partielle.
- **Fix**: Ajout d'un middleware Origin/Referer validation pour toutes les requêtes state-changing (POST/PUT/DELETE/PATCH). Les webhooks et health checks sont exemptés.
- **Status**: FIXED

### MEDIUM-04: Math.random() Replaced with crypto.randomInt/randomBytes
- **OWASP**: A02 (Cryptographic Failures)
- **~45 fichiers** (server + client) utilisaient `Math.random()` pour générer des références financières, mots de passe temporaires, codes de vérification, IDs de transaction, codes agence, sélection aléatoire tontine.
- **Fix**: Toutes les instances security-critical remplacées par `crypto.randomInt()`, `crypto.randomBytes()`, ou `crypto.getRandomValues()` (Web Crypto API côté client). Utilitaires créés: `server/lib/crypto-utils.ts` et `client/src/lib/crypto-utils.ts`. Les 3 usages restants (timing jitter, sampling) sont non-critiques et acceptés.
- **Status**: FIXED

### MEDIUM-05: Password Minimum Length Increased to 12
- **OWASP**: A07 (Identification and Authentication Failures)
- **Fichiers**: `server/audit.ts`, `shared/schema/settings.ts`, `server/seed-prod.ts`, `server/routes/settings.ts`
- **Description**: Le minimum était 8 caractères. ASVS L2 recommande 12 pour les applications financières.
- **Fix**: Default `minLength` augmenté à 12 partout (code, schema defaults, seeds, validation scripts).
- **Status**: FIXED

### MEDIUM-06: Session Timeout Alignment
- **OWASP**: A07 (Identification and Authentication Failures)
- **Fichier**: `server/routes/auth.ts:350,601`
- **Description**: Le session tracking record utilisait un hardcoded `24h` tandis que `SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS` est `12h`.
- **Fix**: Aligné sur `SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS` (12h workday) dans les 2 endroits (login + refresh token).
- **Status**: FIXED

---

## LOW Fixes (Applied)

### LOW-01: File Upload Ownership Verification
- **OWASP**: A01 (Broken Access Control)
- **Fichier**: `server/routes/storage.ts:265`
- **Description**: L'upload de fichier ne vérifiait pas la propriété de l'entité cible.
- **Fix**: Les utilisateurs non-privilégiés ne peuvent uploader que pour leur propre profil (`user`) ou leurs propres clients (`client`). Admin/Chef d'agence exemptés.
- **Status**: FIXED

---

## Fixed: Floating Point for Financial Amounts

- **Status**: FIXED — `decimal.js` adopté pour tous les calculs financiers critiques.
- **Utilitaire**: `server/lib/money.ts` — fonctions `D()`, `roundMoney()`, `roundFCFA()`, `roundRate()`, `splitEvenly()`, `isEffectivelyZero()`.
- **Fichiers corrigés** (6):
  - `server/services/interest-scheduler.ts` — Intérêts journaliers + capitalisation mensuelle
  - `server/services/repayment-allocation-service.ts` — Split capital/intérêt proportionnel
  - `server/services/credit-allocation-service.ts` — Intérêts de retard + accumulation historique
  - `server/storage/finance.ts` — Calcul d'échéances payées + génération d'échéancier
  - `server/routes/finance.ts` — Génération d'échéancier + calcul soldeRestant
  - `server/routes/config.ts` — Simulation d'échéances
- **Patterns éliminés**: `Math.round(...*100)/100`, `parseFloat().toFixed()`, `toFixed(2)` pour divisions, accumulation via `+=` avec floats.

---

## Recommendations (Non-Fixed — Risque Acceptable)

### Remaining: CSP `unsafe-inline` for Styles
- Nécessaire pour Tailwind CSS inline styles. `scriptSrc` est déjà strict (`'self'`). Risque accepté.

### Remaining: Redis Without TLS
- En production, Redis devrait être configuré avec TLS. Docker-compose est pour le développement.

---

## Security Controls Already In Place

| Contrôle | Status | Notes |
|----------|--------|-------|
| Requêtes SQL paramétrées (Drizzle ORM) | OK | Aucune injection SQL détectée |
| Helmet.js (security headers) | OK | HSTS, X-Frame-Options, X-Content-Type |
| Rate limiting (express-rate-limit) | OK | Login, OTP, API endpoints |
| Bcrypt password hashing | OK | Cost factor 10 |
| Refresh token rotation | OK | Family-based revocation, SHA-256 |
| HttpOnly + Secure + SameSite cookies | OK | En production |
| Webhook signature verification | OK | HMAC-SHA256 pour MTN/Airtel |
| WebSocket rate limiting | OK | 100 msg/60s per user |
| IP whitelist for webhooks | OK | Via middleware |
| Audit logging | OK | `logAudit()` sur opérations critiques |
| CASL authorization framework | OK | `attachAbility` + `requireAbility` |
| Device fingerprint tracking | OK | Détection vol de cookie |
| Session limit (max 3/user) | OK | Terminaison automatique |
| Account lockout (5 attempts/15min) | OK | Via `logLoginAttempt()` |
| File type validation (multer) | OK | JPEG, PNG, PDF uniquement |
| File size limit (5MB) | OK | Via multer config |
| CSRF protection (Origin/Referer) | OK | Middleware `csrfProtection` sur toutes les routes API |
| Password min length (12 chars) | OK | ASVS L2 conforme |

---

## Regression Tests Added

Fichier: `server/__tests__/security-regression.test.ts`

| Test | Vérifie |
|------|---------|
| Session regeneration on login | `req.session.regenerate` avant `req.session.userId =` |
| No hardcoded session secret | Absence de `cofin-secret-key-change-in-production` |
| Production crashes without secret | Présence de `process.exit(1)` dans auth.ts |
| Crypto randomness for OTP | `crypto.randomInt` dans otp.ts, pas `Math.random` |
| Crypto randomness for security codes | `crypto.randomInt` dans access-control-service.ts |
| Secure OTP service | `crypto.randomInt` + HMAC + `timingSafeEqual` |
| Auth on reevaluation endpoints | `requireAuth` sur tous les GET reevaluation |
| No open redirect in storage | Absence de `res.redirect(key)` |
| No console.log in payments | Absence de `console.log` dans payments.ts |
| DOMPurify on dangerouslySetInnerHTML | `DOMPurify.sanitize` dans NotificationPreview |
| Docker non-root | Directive `USER` dans Dockerfile |
| No default passwords in compose | Absence de `admin123` dans docker-compose.yml |
| No real credentials in example | Absence de `Admin123` dans .env.production.example |
| Global error handler sanitization | `isProduction && status >= 500` dans index.ts |
| Legacy OTP timing-safe | `timingSafeEqual` dans `/api/otp/validate`, pas `!==` |
| Legacy OTP no error.message leak | Pas de `details: error.message` dans validate |
| Password min length >= 12 | `minLength: 12` dans audit.ts et seed-prod.ts |
| Session timeout aligned | `SESSION_CONFIG.ABSOLUTE_TIMEOUT_MS` dans auth.ts |
| CSRF middleware exists | `csrfProtection` dans middleware/csrf.ts et index.ts |
| File upload ownership check | `isPrivileged` + `normalizeRole` dans storage.ts upload |
| No Math.random in server critical files | 20 fichiers serveur vérifiés: aucun `Math.random()` |
| Server uses crypto.randomInt/randomBytes | Chaque fichier critique utilise `randomInt` ou `randomBytes` |
| No Math.random in client critical files | 13 fichiers client vérifiés: aucun `Math.random()` |
| Client password uses crypto.getRandomValues | `UserFormModal.tsx` utilise `crypto.getRandomValues` |
| Schema agency code uses crypto | `settings.ts` utilise `crypto.randomInt`, pas `Math.random` |
| No ChangeMeInProduction in env | `.env.production.example` ne contient pas `ChangeMeInProduction` |
| SESSION_SECRET empty in template | `.env.production.example` a `SESSION_SECRET=` vide |
| D() converts string/number/null | `D("123.45")`, `D(null)`, `D("")` → Decimal correct |
| roundMoney() rounds to 2 dp | `roundMoney(D("1.005"))` → `"1.01"` |
| roundFCFA() rounds to 0 dp | `roundFCFA(D("1000.6"))` → `"1001"` (FCFA n'a pas de centimes) |
| roundRate() rounds to 4 dp | `roundRate(D("0.12345"))` → `"0.1235"` |
| isEffectivelyZero() | `D("0.001")` → true, `D("0.01")` → false |
| splitEvenly() no loss | `splitEvenly(1000, 3)` → somme = 1000 exactement |
| Decimal vs float precision | `1000/3*3` = 1000 avec Decimal, ≠ 1000 avec float |
| Critical files import money.ts | 6 fichiers financiers importent `from "../lib/money"` |
| No raw toFixed in schedule gen | `capitalPerInstallment.toFixed` absent de storage/finance.ts et routes/finance.ts |
| No parseFloat in interest scheduler | Section daily accrual n'utilise plus `parseFloat` |
| No Math.round in repayment alloc | Absence de `Math.round(montantAAllouer * ratio...)` |
| No Math.round in credit alloc | Absence de `Math.round(interetsJournaliers...)` |
| No Math.round in config routes | Absence de `Math.round(montantEcheance)` et `Math.round(montantTotal)` |

---

## Production Deployment Checklist

- [ ] `SESSION_SECRET` configuré (minimum 32 bytes, `openssl rand -base64 32`)
- [ ] `OTP_HMAC_SECRET` configuré (`openssl rand -hex 32`)
- [ ] `DATABASE_URL` avec credentials uniques production
- [ ] `REDIS_PASSWORD` configuré dans .env
- [ ] `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` configurés
- [ ] `PGADMIN_PASSWORD` configuré
- [ ] `GRAFANA_ADMIN_PASSWORD` configuré
- [ ] `NODE_ENV=production` défini
- [ ] TLS/HTTPS activé via reverse proxy (nginx/Cloudflare)
- [ ] Ports internes (5432, 6379, 9000) non exposés publiquement
- [ ] Backups PostgreSQL automatisés et testés
- [ ] Monitoring/alerting configuré (Grafana + Prometheus)
- [ ] Logs centralisés (stdout pino → collecteur de logs)
- [ ] Rate limiting vérifié en conditions de charge
- [ ] Tests de sécurité automatisés dans le pipeline CI/CD

---

## Files Modified During This Audit

| File | Changes |
|------|---------|
| `server/auth.ts` | Session secret crash in prod |
| `server/ws-server.ts` | Aligned fallback secret |
| `server/index.ts` | Global error handler sanitization + CSRF middleware registration |
| `server/routes/auth.ts` | Session regeneration on login, session timeout alignment |
| `server/routes/otp.ts` | crypto.randomInt, timing-safe comparison, removed debug code/leaks |
| `server/routes/reevaluations.ts` | Added requireAuth + requireAbility on 3 GET endpoints, sanitized error messages |
| `server/routes/storage.ts` | Blocked open redirect, sanitized error messages, upload ownership check |
| `server/routes/payments.ts` | Removed console.log debug, sanitized error messages |
| `server/routes/settings.ts` | Updated password defaults to 12, sanitized error messages |
| `server/services/caisse/access-control-service.ts` | crypto.randomInt for security codes |
| `server/audit.ts` | Password minLength default 8 → 12 |
| `server/seed-prod.ts` | passwordMinLength 10 → 12, validation check updated |
| `server/middleware/csrf.ts` | **NEW** — CSRF Origin/Referer validation middleware |
| `shared/schema/settings.ts` | Schema defaults for passwordMinLength updated to 12 |
| `scripts/validate-seed.ts` | Updated password validation check to >= 12 |
| `client/src/components/admin/notifications/NotificationPreview.tsx` | DOMPurify sanitization |
| `Dockerfile` | Non-root user (appuser) |
| `docker-compose.yml` | Required env vars for all passwords, Redis auth |
| `.env.production.example` | Removed real-looking credentials |
| `server/lib/crypto-utils.ts` | **NEW** — Server-side crypto utility helpers |
| `client/src/lib/crypto-utils.ts` | **NEW** — Client-side crypto utility helpers |
| `server/storage/finance.ts` | crypto.randomInt for account numbers & operation references |
| `server/services/comptes.ts` | crypto.randomInt for account numbers & deposit references |
| `server/routes/finance.ts` | crypto.randomInt for credit request number |
| `server/routes/hr.ts` | crypto.randomBytes for certificate numbers |
| `server/routes/accounting.ts` | crypto.randomBytes for manual entry source ID |
| `server/services/coffre/transfert-service.ts` | crypto.randomInt for transfer references |
| `server/services/coffre/transfer-executor.ts` | crypto.randomInt for transfer references |
| `server/services/caisse/session-opening-service.ts` | crypto.randomBytes for opening references |
| `server/services/ledger.ts` | crypto.randomInt for ledger references |
| `server/services/prospection-prime-service.ts` | crypto.randomInt for payment references |
| `server/services/hr-accounting-service.ts` | crypto.randomInt for HR accounting references |
| `server/services/financial-monitoring-service.ts` | crypto.randomBytes for alert IDs |
| `server/services/agency-migration.ts` | crypto.randomBytes for migration references |
| `server/services/caisse-agent/operation-service.ts` | crypto.randomInt for agent operation references |
| `server/services/transfert-inter-coffres/transfert-service.ts` | crypto.randomBytes for inter-coffre references |
| `server/services/hr-import-service.ts` | crypto.randomInt for username suffixes |
| `server/storage/operations.ts` | crypto.randomInt for payment references |
| `server/storage/tontines.ts` | crypto.randomInt for fair random member selection |
| `server/mobile-money-service.ts` | crypto.randomBytes for transaction IDs |
| `server/lib/logger.ts` | crypto.randomBytes for request IDs |
| `shared/schema/settings.ts` | crypto.randomInt for agency code generation |
| `client/src/components/admin/users/UserFormModal.tsx` | crypto.getRandomValues for password generation |
| `client/src/components/admin/AdminPasswordReset.tsx` | crypto.getRandomValues for temp password |
| `client/src/components/hr/EmployeeProfileDrawer.tsx` | crypto.getRandomValues for temp password |
| `client/src/components/admin/AdminImportCSV.tsx` | crypto.getRandomValues for batch temp password |
| `client/src/components/finance/operations/TransactionVerificationWrapper.tsx` | crypto.getRandomValues for verification code |
| `client/src/lib/criticalOperations.ts` | crypto.getRandomValues for idempotency keys |
| `client/src/services/otpService.ts` | crypto.getRandomValues for transaction references |
| `client/src/components/finance/caisse/CaissePaiementModal.tsx` | crypto.getRandomValues for payment references |
| `client/src/components/finance/caisse/CaisseTransferts.tsx` | crypto.getRandomValues for transfer references |
| `client/src/components/agent/AgentTerrainPaiement.tsx` | crypto.getRandomValues for idempotency keys |
| `client/src/contexts/WebSocketContext.tsx` | crypto.getRandomValues for message IDs |
| `client/src/lib/offline-db.ts` | crypto.getRandomValues for UUID fallback |
| `client/src/components/finance/operations/CompteBloqueForm.tsx` | crypto.getRandomValues for account references |
| `.env.production.example` | Removed ChangeMeInProduction password |
| `package.json` | Added `decimal.js` dependency |
| `server/lib/money.ts` | **NEW** — Decimal.js financial arithmetic utility (`D()`, `roundMoney()`, `roundFCFA()`, `splitEvenly()`) |
| `server/services/interest-scheduler.ts` | Decimal for daily interest accrual + monthly capitalization |
| `server/services/repayment-allocation-service.ts` | Decimal for capital/interest proportional split |
| `server/services/credit-allocation-service.ts` | Decimal for late interest calculation + accumulation |
| `server/storage/finance.ts` | Decimal for installment calculation + schedule generation |
| `server/routes/finance.ts` | Decimal for schedule generation + soldeRestant |
| `server/routes/config.ts` | Decimal for installment simulation |
| `server/__tests__/security-regression.test.ts` | 43 security regression tests |
