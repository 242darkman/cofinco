# Guide Mobile Money Sandbox

## Problème résolu

En mode sandbox MTN MoMo, les **numéros réels** (non-test) restent bloqués en statut `PENDING` indéfiniment. Cela est normal et attendu par MTN.

## Solution implémentée

Le système détecte automatiquement l'environnement (sandbox vs production) et adapte son comportement :

### 1. Backend - Détection et validation

- **Fichier:** `server/services/mobile-money/providers/mtn/mtn-sandbox-helpers.ts`
- Détecte les numéros de test MTN
- Valide les numéros et retourne des warnings si nécessaire
- Suggère des numéros de test alternatifs

### 2. Frontend - Warnings visuels

- **Bandeau sandbox** en haut de l'interface
- **Warning jaune** quand un numéro non-test est utilisé
- **Suggestion** de numéros de test appropriés
- **Indicateur** du comportement attendu pour les numéros de test

### 3. API - Routes de validation

- `GET /api/payments/sandbox-info` - Informations sandbox
- `POST /api/payments/validate-phone` - Validation numéro

## Numéros de test MTN Sandbox

| Numéro | Comportement |
|--------|--------------|
| `56733123453` | ✅ Succès immédiat (~2s) |
| `46733123454` | ✅ Succès après 30 secondes |
| `46733123450` | ❌ Échec (erreur interne) |
| `46733123451` | ❌ Rejeté par l'utilisateur |
| `46733123452` | ⏱️ Expiré (timeout) |

## Configuration

### Variables d'environnement

```bash
# Environnement MTN MoMo
MTN_MOMO_ENVIRONMENT=sandbox  # ou "production"

# Credentials sandbox
MTN_MOMO_API_USER_ID=...
MTN_MOMO_API_KEY=...
MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY=...
MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY=...

# Callback
MTN_MOMO_CALLBACK_URL=https://votre-domaine.ngrok-free.dev/api/webhooks/mtn
```

## Tests

### Test E2E complet (avec numéros de test)

```bash
node --env-file=.env scripts/momo-sandbox-e2e.mjs
```

### Test avec un numéro spécifique

```bash
node --env-file=.env scripts/momo-sandbox-e2e.mjs 56733123453
```

### Simuler un webhook de succès (déblocage manuel)

Si un paiement reste bloqué en PENDING, vous pouvez simuler un webhook de succès :

```bash
node scripts/debug-simulate-webhook.mjs
```

Ce script :
1. Trouve le dernier intent PENDING dans la DB
2. Envoie un webhook de succès simulé
3. Débloque le paiement

## Comportements par environnement

### Sandbox

- ⚠️ Numéros réels → PENDING indéfini (attendu)
- ✅ Numéros de test → Comportement défini
- 🔧 Webhook signature → Optionnelle
- ⏱️ Timeouts → Plus courts (30s)

### Production

- ✅ Numéros réels → Fonctionnement normal
- 🔒 Webhook signature → **Obligatoire**
- ⏱️ Timeouts → Plus longs (60s)
- 🛡️ Validation IP → Activée

## Workflow recommandé en Sandbox

1. **Développement initial** : Utiliser `56733123453` (succès immédiat)
2. **Test des délais** : Utiliser `46733123454` (succès après 30s)
3. **Test d'erreurs** : Utiliser `46733123450-52` (différents cas d'erreur)
4. **Test manuel** : Si besoin de tester avec un vrai numéro, utiliser le script de simulation webhook

## Migration vers Production

Avant de passer en production, vérifiez :

1. ✅ `MTN_MOMO_ENVIRONMENT=production`
2. ✅ Credentials production configurés
3. ✅ `MTN_MOMO_CALLBACK_URL` en HTTPS
4. ✅ Callback token configuré pour vérification webhook
5. ✅ Tests E2E réussis avec numéros réels
6. ✅ Monitoring et alertes activés

## Dépannage

### Paiement bloqué en PENDING

**En sandbox avec numéro réel :**
- ✅ Normal - Utiliser numéros de test ou simuler webhook

**En sandbox avec numéro de test :**
- Vérifier les logs serveur
- Vérifier que le webhook callback est accessible
- Simuler webhook manuellement

**En production :**
- Vérifier les logs MTN
- Vérifier la signature webhook
- Contacter le support MTN

### Webhook non reçu

1. Vérifier que ngrok est actif :
   ```bash
   curl https://votre-domaine.ngrok-free.dev/api/webhooks/mtn
   ```

2. Vérifier les logs webhook :
   ```bash
   grep "MTN WEBHOOK" logs/combined.log
   ```

3. Tester manuellement :
   ```bash
   node scripts/debug-simulate-webhook.mjs
   ```

## Ressources

- [Documentation officielle MTN MoMo](https://momodeveloper.mtn.com/api-documentation)
- [Numéros de test sandbox](https://momodeveloper.mtn.com/api-documentation/testing)
- [Collection Postman](https://www.postman.com/momoapis/momo-open-apis)
