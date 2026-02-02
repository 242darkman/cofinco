# MTN MoMo - Checklist de conformité API

## ✅ Implémentation actuelle

### 1. Authentification OAuth 2.0
- [x] Bearer token avec cache automatique
- [x] Refresh proactif avant expiration
- [x] Gestion des erreurs 401
- [x] Séparation Collection/Disbursement tokens

### 2. Endpoints API

#### Collection (RequestToPay)
- [x] POST `/collection/v1_0/requesttopay`
- [x] GET `/collection/v1_0/requesttopay/{referenceId}`
- [x] Headers requis :
  - [x] `Authorization: Bearer {token}`
  - [x] `X-Reference-Id: {uuid}`
  - [x] `X-Target-Environment: sandbox|production`
  - [x] `Ocp-Apim-Subscription-Key`
  - [x] `X-Callback-Url` (optionnel mais recommandé)

#### Disbursement (Transfer)
- [x] POST `/disbursement/v1_0/transfer`
- [x] GET `/disbursement/v1_0/transfer/{referenceId}`
- [x] Mêmes headers que Collection

#### Balance
- [x] GET `/collection/v1_0/account/balance`

### 3. Webhooks/Callbacks

**Implémentation actuelle :**
- [x] Route webhook : `/api/webhooks/mtn`
- [x] Parsing payload MTN
- [x] Vérification signature HMAC-SHA256
- [x] Bypass signature en sandbox
- [x] Lookup intent par providerRef ou externalRef
- [x] Idempotence (statuts terminaux)
- [x] Logging détaillé

**À vérifier selon docs MTN :**
- [ ] Header de signature exact : `X-Callback-Signature` ? (actuellement implémenté)
- [ ] Format exact du payload callback
- [ ] Statuts possibles dans callback : `PENDING`, `SUCCESSFUL`, `FAILED`

### 4. Gestion d'erreurs

**Codes d'erreur gérés :**
- [x] 202 Accepted → PENDING
- [x] 400 Bad Request → Validation
- [x] 401 Unauthorized → Auth
- [x] 404 Not Found → Ressource non trouvée
- [x] 409 Conflict → Duplicate
- [x] 429 Rate Limit → Retry avec backoff
- [x] 500 Server Error → Retry avec backoff

**Raisons de FAILED connues :**
- [x] `INTERNAL_PROCESSING_ERROR`
- [x] `APPROVAL_REJECTED`
- [x] `EXPIRED`
- [x] `PAYER_NOT_FOUND`
- [x] `NOT_ENOUGH_FUNDS`

### 5. Sandbox - Numéros de test

**Implémenté :**
- [x] `56733123453` → Succès immédiat
- [x] `46733123454` → Succès après 30s
- [x] `46733123450` → Échec (erreur interne)
- [x] `46733123451` → Rejeté
- [x] `46733123452` → Expiré

**Validation :**
- [x] Détection numéros test vs réels
- [x] Warning UI pour numéros réels en sandbox
- [x] Suggestion numéros test

### 6. Sécurité

#### Production
- [x] HTTPS obligatoire (baseUrl + callback)
- [x] Validation signature webhook
- [ ] IP Whitelist (configurée mais à activer)
- [x] Rate limiting
- [x] Secrets masqués dans logs

#### Sandbox
- [x] Signature webhook optionnelle
- [x] HTTP autorisé en dev
- [x] Logs détaillés

### 7. Réconciliation

- [x] Cron job réconciliation
- [x] Polling status pour intents PENDING
- [x] Timeout configurable (30min par défaut)
- [x] Rapports de réconciliation
- [x] Réconciliation manuelle (admin)

### 8. Normalisation téléphone

- [x] Nettoyage caractères non-numériques
- [x] Suppression du `+`
- [x] Ajout indicatif pays (242 pour Congo)
- [x] Format MSISDN

### 9. Idempotence

- [x] `idempotencyKey` pour collections/payouts
- [x] Vérification avant création intent
- [x] Return existing intent si duplicate

### 10. Monitoring & Observabilité

- [x] Logs structurés (Winston + Pino)
- [x] Masquage secrets
- [x] Métriques (tentatives, succès, échecs)
- [x] Webhook logs avec activityId
- [x] Audit trail complet

## 🔍 Points à vérifier avec la doc officielle

### Callbacks
- [ ] **Vérifier le nom exact du header de signature**
  - Actuellement : `X-Callback-Signature`
  - À confirmer dans doc MTN

- [ ] **Format exact du payload callback**
  ```json
  {
    "referenceId": "uuid",
    "externalId": "string",
    "status": "SUCCESSFUL|FAILED|PENDING",
    "amount": "string",
    "currency": "string",
    "financialTransactionId": "string",
    "reason": {
      "code": "string",
      "message": "string"
    }
  }
  ```

### Statuts
- [ ] **Confirmer tous les statuts possibles**
  - Collection : `PENDING`, `SUCCESSFUL`, `FAILED`
  - États intermédiaires ? `CREATED` ?
  - Timeout devient `EXPIRED` ou `FAILED` ?

### Erreurs
- [ ] **Mapping complet codes erreur → raisons**
  - Voir page : https://momodeveloper.mtn.com/api-documentation/common-error

### Timeouts
- [ ] **Délai d'expiration réel MTN**
  - Actuellement configuré : 30 minutes
  - Valeur recommandée MTN ?

## 📋 Tests de conformité

### À tester en Sandbox

```bash
# 1. Succès immédiat
node --env-file=.env scripts/momo-sandbox-e2e.mjs 56733123453

# 2. Succès différé (30s)
node --env-file=.env scripts/momo-sandbox-e2e.mjs 46733123454

# 3. Échec - Erreur interne
node --env-file=.env scripts/momo-sandbox-e2e.mjs 46733123450

# 4. Échec - Rejet utilisateur
node --env-file=.env scripts/momo-sandbox-e2e.mjs 46733123451

# 5. Échec - Timeout
node --env-file=.env scripts/momo-sandbox-e2e.mjs 46733123452
```

### À tester en Production (après validation)

- [ ] Collection avec numéro réel
- [ ] Disbursement avec numéro réel
- [ ] Webhook réel (pas de simulation)
- [ ] Réconciliation automatique
- [ ] Gestion timeout
- [ ] Balance check

## 🚀 Migration Sandbox → Production

### Checklist pré-production

1. **Configuration**
   - [ ] `MTN_MOMO_ENVIRONMENT=production`
   - [ ] Credentials production (API User + Key)
   - [ ] Subscription keys production
   - [ ] Callback URL HTTPS valide
   - [ ] Callback token configuré

2. **Infrastructure**
   - [ ] Serveur accessible publiquement en HTTPS
   - [ ] Certificats SSL valides
   - [ ] Firewall configuré
   - [ ] Monitoring actif

3. **Tests**
   - [ ] Tous les tests sandbox passent
   - [ ] Simulation charge (rate limiting)
   - [ ] Plan de rollback

4. **Documentation**
   - [ ] Procédures opérationnelles
   - [ ] Contacts support MTN
   - [ ] Plan d'escalade incidents

## 📚 Ressources MTN MoMo

- [Documentation officielle](https://momodeveloper.mtn.com/api-documentation)
- [Testing Guide](https://momodeveloper.mtn.com/api-documentation/testing)
- [Common Errors](https://momodeveloper.mtn.com/api-documentation/common-error)
- [Callback Documentation](https://momodeveloper.mtn.com/api-documentation/callback)
- [Use Cases](https://momodeveloper.mtn.com/api-documentation/use-cases)
- [Postman Collection](https://www.postman.com/momoapis/momo-open-apis)

## 🔧 Actions recommandées

1. **Immédiat** (avant mise en production)
   - Consulter https://momodeveloper.mtn.com/api-documentation/callback
   - Vérifier nom exact header signature
   - Confirmer format payload webhook

2. **Court terme**
   - Tester exhaustivement en sandbox
   - Documenter tous les cas d'erreur rencontrés
   - Préparer runbook opérationnel

3. **Moyen terme**
   - Configurer alerting sur échecs
   - Dashboard métriques temps réel
   - Tests de charge
