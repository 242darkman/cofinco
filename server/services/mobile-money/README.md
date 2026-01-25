# Module Mobile Money

Service d'intégration MTN MoMo et Airtel Money pour Cofinco.

## Architecture

```
server/services/mobile-money/
├── payment-service.ts       # Service orchestrateur principal
├── provider-registry.ts     # Registry des providers
├── types.ts                 # Interfaces et types
├── providers/
│   ├── mtn/
│   │   ├── index.ts             # Export du module MTN
│   │   ├── mtn-provider.ts      # Provider MTN production-ready
│   │   ├── mtn-auth-service.ts  # OAuth avec cache token
│   │   └── mtn-config.ts        # Configuration avec validation
│   └── airtel/
│       ├── airtel-provider.ts   # Provider Airtel
│       └── airtel-encryption.ts # Chiffrement RSA
```

## Configuration MTN

### Variables d'environnement requises

```bash
# Environnement (sandbox | production)
MTN_MOMO_ENVIRONMENT=sandbox

# Credentials API User
MTN_MOMO_API_USER_ID=your-api-user-id
MTN_MOMO_API_KEY=your-api-key

# Subscription Keys (séparées par produit)
MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY=8baed02a5f95451fa5479a51ff32d559
MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY=5703635bfd7341798d9ee40a1ce46e79

# Callback (HTTPS obligatoire en production)
MTN_MOMO_CALLBACK_URL=https://cofinco.com/api/webhooks/mtn
MTN_MOMO_CALLBACK_TOKEN=your-webhook-secret

# Optionnel
MTN_MOMO_CURRENCY=XAF
MTN_MOMO_COUNTRY=CG
MTN_MOMO_TARGET_ENVIRONMENT=mtncongo
```

### Subscription Keys

Chaque produit MTN requiert une clé séparée:

| Produit | Variable d'env | Exemple |
|---------|----------------|---------|
| Collection (RequestToPay) | `MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY` | cofinco-recouvrement |
| Disbursement (Transfer) | `MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY` | cofinco-decaissement |
| Collection Widget | `MTN_MOMO_COLLECTION_WIDGET_KEY` | cofinco-collection-widget |

## Flux de Paiement

### Collection (Dépôt/Remboursement)

```
1. Client initie un dépôt
   POST /api/payments/collect
   { provider: "MTN", amount: 50000, phone: "+242064000000", ... }

2. Service crée PaymentIntent (CREATED)

3. Appel MTN RequestToPay (async)
   → Retourne providerRef (X-Reference-Id)

4. PaymentIntent passe à PENDING
   → Frontend affiche "Validez sur votre téléphone"

5. Client valide sur MTN MoMo

6. MTN envoie webhook → POST /api/webhooks/mtn
   { referenceId, status: "SUCCESSFUL", financialTransactionId }

7. Service vérifie signature, traite le webhook
   → executeWithLedger crée mouvement + màj solde
   → PaymentIntent passe à SUCCESS

8. WebSocket notifie le frontend
```

### Payout (Décaissement)

```
1. Agent initie un décaissement
   POST /api/payments/payout
   { provider: "MTN", amount: 100000, phone: "+242064000000", creditId, ... }

2. Service crée PaymentIntent (CREATED)

3. Appel MTN Transfer (async)

4. PaymentIntent passe à PENDING

5. MTN traite et envoie webhook

6. Service traite le webhook
   → executeWithLedger (sens DEBIT)
   → PaymentIntent passe à SUCCESS
```

## Sécurité Webhooks

### Validation IP (Optionnelle)

Activez avec `WEBHOOK_IP_VALIDATION=true` en production.

Les IPs autorisées sont configurées dans [payments.ts](../../routes/payments.ts).

### Signature HMAC-SHA256

MTN envoie une signature dans `X-Callback-Signature`.
Le provider vérifie avec `MTN_MOMO_CALLBACK_TOKEN`.

## Réconciliation

Le cron job [payment-reconciliation.ts](../../cron/payment-reconciliation.ts) vérifie les paiements PENDING:

- Exécution toutes les 10 minutes (configurable)
- Interroge `getStatus()` sur le provider
- Retry avec backoff exponentiel
- Expire les paiements timeout

```bash
# Configuration
RECONCILIATION_INTERVAL_MINUTES=10
PENDING_THRESHOLD_MINUTES=10
RECONCILIATION_MAX_RETRIES=3
```

## API Endpoints

### Webhooks (Publics)

```
POST /api/webhooks/mtn    # Callback MTN MoMo
POST /api/webhooks/airtel # Callback Airtel Money
```

### API Authentifiée

```
POST   /api/payments/collect     # Initier collection
POST   /api/payments/payout      # Initier payout
GET    /api/payments/:id         # Statut d'un paiement
GET    /api/payments             # Liste avec filtres
POST   /api/payments/:id/cancel  # Annuler (PENDING uniquement)
```

### Test Endpoints (Dev)

```
POST /api/payments-test/create-mock-intent  # Créer intent sans appeler provider
POST /api/payments-test/simulate-webhook    # Simuler webhook SUCCESS/FAILED
GET  /api/payments-test/pending             # Lister les intents PENDING
GET  /api/payments-test/health              # Vérifier l'initialisation
```

## Base de Données

### Table `paymentIntents`

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | Identifiant unique |
| provider | ENUM | MTN, AIRTEL |
| type | ENUM | COLLECTION, PAYOUT |
| status | ENUM | CREATED, PENDING, SUCCESS, FAILED, EXPIRED, CANCELLED |
| amount | NUMERIC | Montant en XAF |
| phone | TEXT | Numéro MSISDN |
| externalRef | UUID | Notre référence (envoyée au provider) |
| providerRef | TEXT | Référence du provider (X-Reference-Id) |
| providerTxnId | TEXT | ID transaction finale |
| clientId | UUID FK | Client concerné |
| compteId | UUID FK | Compte à créditer/débiter |
| creditId | UUID FK | Crédit (si remboursement/décaissement) |
| mouvementId | UUID FK | Mouvement financier créé au SUCCESS |

### Table `providerEvents`

Stocke tous les webhooks reçus pour audit et debug.

## Intégration Ledger

Au SUCCESS, le service utilise `executeWithLedger()` pour:

1. Créer le mouvement financier (atomique)
2. Mettre à jour le solde du compte
3. Mettre à jour le solde du crédit (si applicable)
4. Publier l'événement via l'outbox

```typescript
executeWithLedger(
  "MOBILE_MONEY",
  {
    montant: amount.toString(),
    sens: intent.type === "COLLECTION" ? "CREDIT" : "DEBIT",
    clientId: intent.clientId,
    compteId: intent.compteId,
    creditId: intent.creditId,
    methodePaiement: "MOBILE_MONEY",
    typePaiement: "CREDIT_REPAYMENT", // ou DEPOSIT_SAVINGS, etc.
  },
  async (tx, mouvement) => {
    // Màj soldes dans la même transaction
    if (intent.compteId) {
      await updateCompteSolde(tx, intent.compteId, amount);
    }
    return { result: mouvement };
  }
);
```

## Debug et Logs

### Logs structurés

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "provider": "MTN",
  "intentId": "uuid",
  "referenceId": "mtn-ref",
  "status": "SUCCESS",
  "processingTimeMs": 150
}
```

### Masquage des secrets

Les clés API et tokens sont automatiquement masqués dans les logs:
```
apiKey: "8bae****"
subscriptionKey: "5703****"
```

## Production Checklist

- [ ] Variables d'environnement configurées
- [ ] `MTN_MOMO_ENVIRONMENT=production`
- [ ] URLs en HTTPS (callback, base URL)
- [ ] Subscription keys séparées par produit
- [ ] Callback token configuré pour la vérification des webhooks
- [ ] IP whitelist activée (`WEBHOOK_IP_VALIDATION=true`)
- [ ] Cron de réconciliation actif
- [ ] Monitoring des logs structurés configuré
