# Systeme de Notifications Unifie - COFINCO

## Architecture

```
server/services/notifications/
  notification-service.ts          # Facade (enqueue, emit, settings)
  notification-worker.ts           # Queue processor (SELECT FOR UPDATE SKIP LOCKED)
  providers/
    provider.interface.ts          # SmsProvider, EmailProvider, SendResult
    sms-mtn.provider.ts            # MTN API v2 + OAuth2 token cache
    email.provider.ts              # Nodemailer SMTP
  templates/
    template-engine.ts             # Handlebars render + cache memoire
    template-types.ts              # Interfaces variables par template
  otp/
    otp-service.ts                 # Generate/verify avec HMAC hash
  policy/
    routing-policy.ts              # Resolution canal + fallback
    rate-limiter.ts                # Quotas SMS/email par agence/global
  domain-events/
    event-types.ts                 # Types DomainEvent
    event-handlers.ts              # Mapping event -> notifications
    event-registry.ts              # Dispatch registry
  audit/
    notification-audit.ts          # Logs structures, metriques

shared/schema/notifications.ts     # 6 tables Drizzle
```

## Tables DB

| Table | Description |
|-------|-------------|
| `notification_jobs` | File d'attente unifiee (SMS/email). Status: QUEUED -> PROCESSING -> SENT/FAILED/DEAD_LETTER |
| `email_provider_settings` | Configuration SMTP/Resend/SendGrid |
| `email_templates` | Templates email Handlebars (subject, HTML, texte) |
| `otp_codes` | Codes OTP hashes (HMAC-SHA256 + salt, jamais en clair) |
| `notification_delivery_receipts` | Accuses de reception MTN |
| `notification_settings` | Configuration globale et par agence |

## Flux de notification

### 1. Enqueue via Domain Event

```typescript
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";

// Apres une operation metier
dispatchDomainEvent({
  type: "CREDIT_APPROVED",
  data: {
    demandeId: "...",
    numeroDemande: "DEM-2026-001",
    clientId: "...",
    montantApprouve: 500000,
    agenceId: "...",
    approvedByUserId: "...",
  },
});
```

Le dispatch est **fire-and-forget** : il ne bloque pas la requete HTTP. Les erreurs sont logguees sans remonter au caller.

### 2. Event Handler -> Notification Service

Le handler resout les destinataires et appelle `emitNotificationEvent()` :
- Enqueue SMS/email dans `notification_jobs` (si actives dans settings)
- Cree une notification in-app immediate + broadcast WebSocket

### 3. Worker Process

Le `notification-worker` poll `notification_jobs` toutes les 2 secondes :
- `SELECT FOR UPDATE SKIP LOCKED` (safe multi-instance)
- Rend le template Handlebars depuis DB
- Envoie via le provider (MTN SMS / SMTP email)
- Retry avec backoff exponentiel : 30s, 60s, 2min, 4min, 8min
- Apres 5 tentatives : status `DEAD_LETTER`

## Ajouter un nouveau domain event

### 1. Definir le type

Dans `event-types.ts` :

```typescript
export type DomainEventType =
  | "CREDIT_APPROVED"
  | "MY_NEW_EVENT"  // Ajouter ici
  // ...

export interface MyNewEventData {
  someField: string;
  // ...
}
```

### 2. Creer le handler

Dans `event-handlers.ts` :

```typescript
export async function handleMyNewEvent(event: DomainEvent<MyNewEventData>): Promise<void> {
  const contact = await getClientContact(event.data.clientId);
  if (!contact) return;

  await emitNotificationEvent(
    "MY_NEW_EVENT",
    {
      smsRecipients: contact.telephone ? [{ phone: contact.telephone }] : [],
      emailRecipients: contact.email ? [{ email: contact.email }] : [],
      inApp: { userId: contact.userId, title: "...", message: "...", type: "info" },
    },
    {
      smsTemplateCode: "MY_NEW_TEMPLATE",
      emailTemplateCode: "MY_NEW_EMAIL_TEMPLATE",
      templatePayload: { ... },
      agenceId: event.agenceId,
      userId: event.userId,
    },
  );
}
```

### 3. Enregistrer dans le registry

Dans `event-registry.ts` :

```typescript
const handlerRegistry: Partial<Record<DomainEventType, (event: DomainEvent<any>) => Promise<void>>> = {
  // ...
  MY_NEW_EVENT: handleMyNewEvent,
};
```

### 4. Creer les templates

Ajouter dans `seed-prod.ts` (tables `sms_templates` et `email_templates`) avec la syntaxe Handlebars `{{variable}}`.

### 5. Dispatch dans le code metier

```typescript
dispatchDomainEvent({
  type: "MY_NEW_EVENT",
  data: { someField: "value" },
  agenceId: req.session?.user?.agenceId,
  userId: req.session?.user?.id,
});
```

## Ajouter un nouveau template

### SMS Template

```sql
INSERT INTO sms_templates (code, contenu, description, actif)
VALUES ('MY_TEMPLATE', 'Bonjour {{clientName}}, votre operation de {{amount}} FC est confirmee. COFIN&CO-M', 'Description', true);
```

### Email Template

```sql
INSERT INTO email_templates (code, nom, subject, contenu_html, contenu_text, placeholders, actif)
VALUES (
  'MY_EMAIL_TEMPLATE',
  'Mon template',
  'Notification: {{subject}}',
  '<h1>Bonjour {{clientName}}</h1><p>{{message}}</p>',
  'Bonjour {{clientName}}, {{message}}',
  '["clientName", "subject", "message"]',
  true
);
```

Helpers Handlebars disponibles :
- `{{formatNumber amount}}` : formatte un nombre en locale fr-FR (ex: 1 500 000)
- `{{uppercase text}}` : convertit en majuscules

Pour invalider le cache template apres une modification :

```typescript
import { invalidateTemplateCache } from "../services/notifications/templates/template-engine";
invalidateTemplateCache("MY_TEMPLATE"); // Un template specifique
invalidateTemplateCache();               // Tous les templates
```

## Configuration par agence

La table `notification_settings` supporte une configuration globale (agenceId = NULL) et des overrides par agence :

| Setting | Description | Default |
|---------|-------------|---------|
| `smsEnabled` | Activer les SMS | true |
| `emailEnabled` | Activer les emails | false |
| `pushEnabled` | Activer les push | false |
| `fallbackPolicy` | Politique de fallback | SMS_ONLY |
| `otpChannel` | Canal pour les OTP | SMS |
| `otpMaxPerMinute` | Rate limit OTP/minute | 3 |
| `otpMaxPerDay` | Rate limit OTP/jour | 20 |
| `smsQuotaDaily` | Quota SMS journalier | 1000 |
| `emailQuotaDaily` | Quota email journalier | 500 |

Politiques de fallback :
- `SMS_ONLY` : SMS uniquement
- `EMAIL_ONLY` : Email uniquement
- `SMS_THEN_EMAIL` : SMS en priorite, email en fallback
- `EMAIL_THEN_SMS` : Email en priorite, SMS en fallback

## OTP Securise

Le service OTP utilise :
- **HMAC-SHA256** avec secret (`OTP_HMAC_SECRET` env var) + salt aleatoire par code
- **`crypto.timingSafeEqual`** pour la verification (anti timing-attack)
- **Rate limiting** : par minute et par jour, configurable par agence
- **TTL** : 5 minutes
- **Max tentatives** : 3 par defaut

En dev : le `debugCode` est retourne dans la reponse. En production : seul `otpId` et `expiresAt`.

```typescript
import { requestOtp, verifyOtp } from "../services/notifications/otp/otp-service";

// Generer
const result = await requestOtp({
  destination: "+242065000000",
  purpose: "TRANSFER_VALIDATION",
  channel: "SMS",
  userId: user.id,
  agenceId: user.agenceId,
});

// Verifier
const verification = await verifyOtp({
  destination: "+242065000000",
  purpose: "TRANSFER_VALIDATION",
  code: "123456",
});

if (verification.valid) {
  // Succes
}
```

## Monitoring Admin

Le dashboard admin est accessible via l'onglet "Notifications" dans le module Admin.

Endpoints API disponibles :
- `GET /api/notifications/admin/metrics` - Metriques globales
- `GET /api/notifications/admin/outbox?status=FAILED&limit=50` - File d'attente
- `GET /api/notifications/admin/failed?limit=20` - Jobs en erreur
- `POST /api/notifications/admin/retry-dead-letter` - Relancer les dead-letter
- `GET /api/notifications/admin/settings` - Lire la configuration
- `PUT /api/notifications/admin/settings` - Modifier la configuration

Tous ces endpoints requierent le role Admin avec permission `admin.settings`.

## MTN SMS Provider

Le provider MTN API v2 supporte :
- OAuth2 client_credentials avec cache token (refresh automatique 60s avant expiration)
- Retry automatique sur 401 (token expire)
- Idempotence via `clientCorrelator` (= correlationId de la notification)
- Delivery status check via `checkDeliveryStatus()`
- Format telephone : normalise automatiquement vers `tel:+242XXXXXXXXX`

Configuration dans `sms_provider_settings` :
```json
{
  "clientId": "...",
  "clientSecret": "...",
  "tokenUrl": "https://api.mtn.com/v1/oauth/access_token/accesstoken?grant_type=client_credentials",
  "smsBaseUrl": "https://api.mtn.com/v2/messages/sms/outbound"
}
```

## Troubleshooting

### Les notifications ne sont pas envoyees

1. Verifier que le worker tourne : logs `[NotifWorker] Worker started`
2. Verifier `notification_settings` : `smsEnabled` ou `emailEnabled` = true
3. Verifier qu'un provider est configure et actif dans `sms_provider_settings` ou `email_provider_settings`
4. Verifier les jobs dans `notification_jobs` : status FAILED avec `lastError`

### Rate limit OTP atteint

- Verifier `notification_settings.otpMaxPerMinute` et `otpMaxPerDay`
- Compter les OTP recents : `SELECT COUNT(*) FROM otp_codes WHERE destination = '...' AND created_at > NOW() - INTERVAL '1 day'`

### Jobs bloques en PROCESSING

Un job reste en PROCESSING si le worker crash pendant le traitement. Le lock expire apres 60 secondes, permettant un autre worker de le reprendre.

Pour debloquer manuellement :
```sql
UPDATE notification_jobs SET status = 'QUEUED', locked_at = NULL, locked_until = NULL
WHERE status = 'PROCESSING' AND locked_until < NOW();
```

### Template non trouve

1. Verifier que le template existe dans `sms_templates` ou `email_templates` avec `actif = true`
2. Le code du template doit correspondre exactement (case-sensitive)
3. Invalider le cache : `invalidateTemplateCache('CODE')`

## Tests

```bash
# Tous les tests notification
npx vitest run server/__tests__/otp-service.test.ts server/__tests__/template-engine.test.ts server/__tests__/routing-policy.test.ts server/__tests__/mtn-provider.test.ts server/__tests__/notification-worker.test.ts

# Un test specifique
npx vitest run server/__tests__/otp-service.test.ts
```

Tests couverts :
- **otp-service** (20 tests) : crypto primitives, rate limiting, request/verify flow
- **template-engine** (9 tests) : SMS/email rendering, cache, Handlebars helpers
- **routing-policy** (11 tests) : channel resolution, fallback policies, OTP channel
- **mtn-provider** (12 tests) : OAuth2, token caching, 401 retry, delivery status
- **notification-worker** (4 tests) : lifecycle management
