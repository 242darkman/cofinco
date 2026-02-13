# Architecture "Offline Natif Total" — Cofinco Microfinance SaaS

> **Version** : 2.0 — Fevrier 2026
> **Contexte** : SaaS de microfinance au Congo-Brazzaville (zone CEMAC)
> **Philosophie** : Le mode offline n'est pas une degradation. C'est l'etat normal de fonctionnement.

---

## Table des matieres

1. [Vision et principes directeurs](#1-vision-et-principes-directeurs)
2. [Architecture globale](#2-architecture-globale)
3. [Offline Ledger — Modele evenementiel](#3-offline-ledger--modele-evenementiel)
4. [Integration evenementielle (Event-Driven)](#4-integration-evenementielle-event-driven)
5. [Modele de donnees offline](#5-modele-de-donnees-offline)
6. [Signature et integrite cryptographique](#6-signature-et-integrite-cryptographique)
7. [Strategie de synchronisation](#7-strategie-de-synchronisation)
8. [Resolution de conflits](#8-resolution-de-conflits)
9. [Tresorerie offline — Trois couches](#9-tresorerie-offline--trois-couches)
10. [Securite et controle interne](#10-securite-et-controle-interne)
11. [Conformite reglementaire COBAC / SYSCOHADA](#11-conformite-reglementaire-cobac--syscohada)
12. [Scenarios d'echec](#12-scenarios-dechec)
13. [Deploiement terrain — Zones rurales CEMAC](#13-deploiement-terrain--zones-rurales-cemac)
14. [Etat de l'implementation existante](#14-etat-de-limplementation-existante)

---

## 1. Vision et principes directeurs

### Realite terrain

Un agent terrain de microfinance au Congo-Brazzaville opere dans des conditions ou :
- Le reseau 3G est intermittent ou absent pendant des heures/jours
- L'electricite peut couper a tout moment (pas de datacenter local)
- Les montants manipules en cash representent le patrimoine de personnes vulnerables
- Une erreur comptable ou une fraude peut mettre en peril l'institution entiere
- La COBAC exige une tracabilite complete et inalterable

### Principes fondamentaux

| Principe | Description |
|----------|-------------|
| **Offline-First** | Le systeme est concu pour fonctionner offline. L'online est un bonus. |
| **Event Sourcing** | Chaque operation est un evenement immuable, signe et chaine. |
| **Zero Trust Local** | L'appareil est considere comme potentiellement compromis. |
| **Determinisme total** | Le meme ensemble d'evenements produit toujours le meme etat. |
| **Auditabilite native** | Chaque action est tracable, par qui, quand, sur quel appareil. |
| **Reconciliation obligatoire** | Pas de "fire and forget". Tout est verifie a la sync. |

---

## 2. Architecture globale

### Vue d'ensemble a trois niveaux

```
+==========================================+
|         APPAREIL AGENT (PWA)             |
|                                          |
|  +------------------------------------+ |
|  |        Couche Presentation          | |
|  |   React + TanStack Query + Hooks   | |
|  +------------------------------------+ |
|  |      Event Bus Local (OfflineBus)   | |  <-- NOUVEAU
|  +------------------------------------+ |
|  |        Couche Metier Offline        | |
|  |  +----------+  +----------------+  | |
|  |  | Offline  |  | Offline        |  | |
|  |  | Treasury |  | Ledger         |  | |
|  |  | Service  |  | (Journal       |  | |
|  |  |          |  |  Service)      |  | |
|  |  +----------+  +----------------+  | |
|  |  +----------+  +----------------+  | |
|  |  | Critical |  | Limits         |  | |
|  |  | Ops      |  | Enforcer       |  | |
|  |  | Registry |  | (HMAC-signed)  |  | |
|  |  +----------+  +----------------+  | |
|  +------------------------------------+ |
|  |     Couche Persistance Chiffree     | |
|  |  Dexie (IndexedDB) + AES-256-GCM   | |
|  +------------------------------------+ |
|  |     Couche Crypto & Identite        | |
|  |  ECDSA P-256 + PBKDF2 + HMAC       | |
|  +------------------------------------+ |
|  |     Service Worker (Workbox)        | |
|  |  6 caches + Background Sync         | |
|  +------------------------------------+ |
+==========================================+
            |                    ^
            | Sync (3 phases)    | Push/Pull
            v                    |
+==========================================+
|          COUCHE SYNC (Passerelle)        |
|                                          |
|  /api/sync/handshake                     |
|  /api/sync/journal      (upload batch)   |
|  /api/sync/pull          (delta pull)    |
|  /api/sync/devices/register-key          |
|                                          |
|  Middleware : Idempotency + Rate Limit   |
+==========================================+
            |                    ^
            v                    |
+==========================================+
|          CORE SERVER (Ledger Central)    |
|                                          |
|  +------------------------------------+ |
|  |   Event Ingestion Pipeline          | |  <-- NOUVEAU
|  |   (Validation + Ordering + Replay)  | |
|  +------------------------------------+ |
|  |   Core Ledger (PostgreSQL)          | |
|  |   - server_journal_entries          | |
|  |   - server_event_projections        | |
|  |   - reconciliation_reports          | |
|  +------------------------------------+ |
|  |   Comptabilite Generale (GL)        | |
|  |   - mouvements_financiers           | |
|  |   - ecritures SYSCOHADA             | |
|  +------------------------------------+ |
|  |   Event Reactor (Server-Side Bus)   | |  <-- NOUVEAU
|  |   - Projections comptables          | |
|  |   - Alertes & anomalies             | |
|  |   - Notifications superviseurs      | |
|  +------------------------------------+ |
+==========================================+
```

### Composants cles existants (implementes)

| Composant | Fichier | Lignes |
|-----------|---------|--------|
| Journal Service (Offline Ledger) | `client/src/lib/journal-service.ts` | ~553 |
| Offline Database (Dexie) | `client/src/lib/offline-db.ts` | ~1312 |
| Offline Treasury | `client/src/lib/offline-treasury.ts` | ~495 |
| Sync Service (3-phase) | `client/src/lib/syncService.ts` | ~1134 |
| Crypto (AES + ECDSA + HMAC) | `client/src/lib/offline-crypto.ts` | ~364 |
| Network Manager (Circuit Breaker) | `client/src/lib/networkManager.ts` | ~484 |
| Critical Operations | `client/src/lib/criticalOperations.ts` | ~268 |
| Device Key Manager | `client/src/lib/device-key-manager.ts` | ~136 |
| Service Worker | `client/src/sw-custom.ts` | ~475 |
| Idempotency Middleware | `server/middleware/idempotency.ts` | ~139 |

---

## 3. Offline Ledger — Modele evenementiel

### 3.1. Principes du journal immuable

Le coeur de l'architecture est un **journal local append-only** (event log) ou chaque operation
financiere est un evenement immuable, signe et chaine par hash.

```
+--------+     +--------+     +--------+     +--------+
|  E(1)  |---->|  E(2)  |---->|  E(3)  |---->|  E(4)  |
| GENESIS|     | hash=  |     | hash=  |     | hash=  |
| hash=H1|     |SHA(E1) |     |SHA(E2) |     |SHA(E3) |
| sig=S1 |     | sig=S2 |     | sig=S3 |     | sig=S4 |
+--------+     +--------+     +--------+     +--------+
```

**Garanties** :
- **Append-only** : les entrees ne sont jamais modifiees ni supprimees
- **Hash-chain** : chaque entree reference le hash SHA-256 de la precedente
- **Signe** : chaque entree est signee ECDSA P-256 par la cle de l'appareil
- **Ordonne** : compteur monotone croissant, sans trous (sequence gap-free)
- **Horodatage fiable** : timestamp local + horloge monotone + offset NTP

### 3.2. Structure d'un evenement journal

```typescript
interface JournalEntry {
  // Identite
  sequence: number;           // Compteur monotone, gap-free (1, 2, 3...)
  uuid: string;               // UUIDv7 (timestamp-ordonne)
  type: JournalEventType;     // DEPOSIT, WITHDRAWAL, LOAN_DISBURSEMENT, etc.

  // Contexte agent/appareil
  agentId: number;
  deviceId: string;           // Empreinte appareil
  agenceId: string;

  // Payload (donnees metier)
  payload: string;            // JSON chiffre AES-256-GCM (ou clair si pas de cle)
  payloadHash: string;        // SHA-256 du payload en clair

  // Chaine d'integrite
  previousHash: string;       // Hash de l'entree precedente ("GENESIS" pour la 1ere)
  entryHash: string;          // SHA-256(sequence|uuid|type|payloadHash|previousHash|timestamp)

  // Signature cryptographique
  signature: string;          // ECDSA P-256 du entryHash
  deviceKeyId: string;        // ID de la cle de signature (rotation)

  // Horodatage (triple source)
  localTimestamp: number;     // Date.now() a la creation
  monotonicClock: number;     // performance.now() relatif au boot de session
  ntpOffset?: number;         // Dernier offset NTP connu (serverTime - localTime)

  // Etat de synchronisation
  syncStatus: 'local' | 'syncing' | 'confirmed' | 'rejected';
  serverTimestamp?: number;   // Timestamp assigne par le serveur apres sync
  serverSequence?: number;    // Sequence globale serveur apres sync
  syncAttempts: number;
  syncError?: string;

  // Contexte operationnel
  sessionId: string;          // ID de la session journaliere agent
  operationRef: string;       // Reference metier (ex: DEP-20260213-000001)
  idempotencyKey: string;     // Cle d'idempotence pour la sync
  metadata?: string;          // JSON (coords GPS, billetage, etc.)
}
```

### 3.3. Types d'evenements

| Type | Impact caisse | Description |
|------|:------------:|-------------|
| `DEPOSIT` | +montant | Client depose du cash |
| `WITHDRAWAL` | -montant | Client retire du cash |
| `LOAN_DISBURSEMENT` | -montant | Decaissement de credit en cash |
| `LOAN_REPAYMENT` | +montant | Remboursement de credit en cash |
| `TONTINE_CONTRIBUTION` | +montant | Cotisation membre |
| `TONTINE_DISTRIBUTION` | -montant | Distribution du pot |
| `CLIENT_CREATE` | 0 | Nouveau client (KYC) |
| `CLIENT_UPDATE` | 0 | Mise a jour client |
| `CAISSE_OPEN` | 0 | Ouverture session (billetage initial) |
| `CAISSE_CLOSE` | 0 | Fermeture session (billetage final) |
| `CAISSE_RECONCILE` | 0 | Reconciliation manuelle |
| `REMISE_CREATE` | -montant | Versement agent vers agence |
| `SETTLEMENT` | -montant | Transfert de fonds agent -> coffre |

### 3.4. Cycle de vie d'un evenement

```
                CREATION LOCALE
                     |
                     v
    +----> [local] --------+
    |          |            |
    |      (sync attempt)   |
    |          |            |
    |          v            |
    |     [syncing] --------+-------> [rejected]
    |          |                         |
    |      (server ACK)            (erreur metier,
    |          |                    signature invalide)
    |          v
    |     [confirmed]
    |
    +--- (retry apres echec reseau)
```

---

## 4. Integration evenementielle (Event-Driven)

### 4.1. Architecture Event Bus — Vue d'ensemble

L'integration evenementielle repose sur un **bus d'evenements a deux niveaux** :
un bus local sur l'appareil et un bus serveur. Chaque evenement du journal
(Offline Ledger) declenche une cascade de reactions a travers le systeme.

```
+=================================================================+
|                    APPAREIL AGENT                                |
|                                                                  |
|  [Operation UI] --> [Offline Ledger] --> [OfflineBus]            |
|                       (append)            |                      |
|                                           |-- > TreasuryReactor  |
|                                           |-- > CacheReactor     |
|                                           |-- > UIReactor        |
|                                           |-- > SyncReactor      |
|                                           |-- > AuditReactor     |
|                                           |-- > LimitsReactor    |
|                                           '-- > AlertReactor     |
+=================================================================+
                         |
                    (sync 3 phases)
                         |
+=================================================================+
|                    SERVEUR CENTRAL                                |
|                                                                  |
|  [Sync Endpoint] --> [Event Ingestion] --> [ServerBus]           |
|                       (validate, order)      |                   |
|                                              |-->GLReactor       |
|                                              |   (ecritures      |
|                                              |    SYSCOHADA)     |
|                                              |-->BalanceReactor   |
|                                              |   (soldes temps   |
|                                              |    reel)          |
|                                              |-->ReconcReactor   |
|                                              |   (reconciliation |
|                                              |    tresorerie)    |
|                                              |-->AnomalyReactor  |
|                                              |   (detection      |
|                                              |    fraude)        |
|                                              |-->NotifReactor    |
|                                              |   (alertes        |
|                                              |    superviseurs)  |
|                                              '-->ReportReactor   |
|                                                  (rapports COBAC)|
+=================================================================+
```

### 4.2. OfflineBus — Bus d'evenements local

Le bus local est un **mediateur synchrone en memoire** qui diffuse les evenements
du journal vers les reacteurs locaux. Il ne persiste rien lui-meme (le journal
est la seule source de verite).

```typescript
// Architecture du bus local
type OfflineEventHandler = (event: JournalEntry) => void | Promise<void>;

interface OfflineBus {
  // Souscription par type d'evenement ou wildcard '*'
  on(eventType: JournalEventType | '*', handler: OfflineEventHandler): () => void;

  // Emission apres chaque append reussi dans le journal
  emit(entry: JournalEntry): void;

  // Emission d'evenements systeme (non-journal)
  emitSystem(type: SystemEventType, data: unknown): void;
}

type SystemEventType =
  | 'SYNC_STARTED'
  | 'SYNC_COMPLETED'
  | 'SYNC_FAILED'
  | 'NETWORK_CHANGED'
  | 'SESSION_OPENED'
  | 'SESSION_CLOSED'
  | 'CHAIN_INTEGRITY_BROKEN'
  | 'LIMITS_UPDATED'
  | 'KEY_ROTATED'
  | 'CONFLICT_DETECTED';
```

### 4.3. Reacteurs locaux (Client-Side)

#### TreasuryReactor
Reagit a chaque evenement financier pour mettre a jour le solde caisse en temps reel.

```typescript
// Pseudo-code
offlineBus.on('*', async (entry) => {
  if (!isFinancialEvent(entry.type)) return;

  const amount = parsePayload(entry).amount;
  const impact = getCashImpact(entry.type, amount);
  if (impact === 0) return;

  // Mise a jour atomique de la session journaliere
  await updateDaySession(entry.agentId, {
    currentCashBalance: (prev) => prev + impact,
    operationCount: (prev) => prev + 1,
    dailyVolume: (prev) => prev + Math.abs(amount),
    totalCollected: (prev) => prev + (impact > 0 ? amount : 0),
    totalDisbursed: (prev) => prev + (impact < 0 ? amount : 0),
    lastJournalSequence: entry.sequence,
  });
});
```

> **Etat actuel** : Deja implemente dans `offline-treasury.ts:executeOfflineOperation()`.
> Le reacteur est couple a l'appel (pas declenche par le bus). L'evolution proposee
> est de decoupler via le bus pour permettre des reacteurs supplementaires.

#### CacheReactor
Invalide les caches React Query correspondant a l'entite modifiee.

```typescript
offlineBus.on('DEPOSIT', (entry) => {
  queryClient.invalidateQueries({ queryKey: ['compte', entry.payload.compteId] });
  queryClient.invalidateQueries({ queryKey: ['caisse-session'] });
});

offlineBus.on('CLIENT_CREATE', (entry) => {
  queryClient.invalidateQueries({ queryKey: ['clients'] });
});
```

#### UIReactor
Emet des notifications toast/badge pour informer l'agent du resultat.

```typescript
offlineBus.on('*', (entry) => {
  showToast({
    title: getOperationLabel(entry.type),
    description: `Ref: ${entry.operationRef}`,
    variant: 'success',
  });
  updatePendingSyncBadge();
});

offlineBus.onSystem('CONFLICT_DETECTED', (data) => {
  showToast({
    title: 'Conflit detecte',
    description: 'Une operation necessite une resolution manuelle.',
    variant: 'warning',
  });
});
```

#### SyncReactor
Declenche une synchronisation opportuniste si le reseau est disponible.

```typescript
offlineBus.on('*', debounce(async () => {
  if (isNetworkUsable()) {
    // Attendre un court delai pour regrouper les operations proches
    await syncService.syncJournal();
  } else {
    // Enregistrer un background sync pour quand le reseau revient
    await syncService.requestBackgroundSync('cofin-journal-sync');
  }
}, 3000));
```

#### AuditReactor
Enregistre un log d'audit local (distinct du journal) pour les actions non-financieres.

```typescript
offlineBus.on('*', (entry) => {
  appendLocalAuditLog({
    timestamp: entry.localTimestamp,
    action: entry.type,
    agentId: entry.agentId,
    ref: entry.operationRef,
    deviceId: entry.deviceId,
    hashChainValid: true, // toujours vrai au moment de l'emit
  });
});
```

#### LimitsReactor
Verifie apres chaque operation si les limites offline approchent un seuil critique.

```typescript
offlineBus.on('*', async (entry) => {
  const session = await getCurrentSession(entry.agentId);
  const limits = await getOfflineLimits();
  if (!session || !limits) return;

  // Alerte a 80% des limites
  if (session.operationCount >= limits.maxDailyOperations * 0.8) {
    emitSystem('LIMITS_WARNING', {
      type: 'DAILY_OPS',
      current: session.operationCount,
      max: limits.maxDailyOperations,
    });
  }

  if (session.dailyVolume >= limits.maxDailyVolume * 0.8) {
    emitSystem('LIMITS_WARNING', {
      type: 'DAILY_VOLUME',
      current: session.dailyVolume,
      max: limits.maxDailyVolume,
    });
  }
});
```

### 4.4. Reacteurs serveur (Server-Side)

Quand le serveur recoit un batch d'evenements journal via `/api/sync/journal`,
il les valide puis les injecte dans le **ServerBus** pour traitement.

#### GLReactor (Comptabilite Generale)
Genere les ecritures SYSCOHADA correspondantes a chaque evenement confirme.

```
Evenement: DEPOSIT (100 000 XAF sur compte epargne CE-001)
  --> Debit  : 5711 "Caisse Agent X"         100 000 XAF
  --> Credit : 2511 "Comptes d'epargne"       100 000 XAF

Evenement: LOAN_DISBURSEMENT (500 000 XAF, credit CR-042)
  --> Debit  : 2011 "Credits a court terme"   500 000 XAF
  --> Credit : 5711 "Caisse Agent X"          500 000 XAF

Evenement: LOAN_REPAYMENT (50 000 XAF, dont 45 000 principal + 5 000 interets)
  --> Debit  : 5711 "Caisse Agent X"          50 000 XAF
  --> Credit : 2011 "Credits a court terme"   45 000 XAF
  --> Credit : 7021 "Interets sur credits"     5 000 XAF
```

> La generation GL est **uniquement server-side**. L'agent offline n'ecrit jamais
> d'ecritures comptables. Cela garantit que le GL est la projection fidele
> des evenements confirmes, sans risque de divergence.

#### BalanceReactor
Met a jour les projections de solde (materialized views) a partir des evenements.

```sql
-- Projection: solde du compte epargne
UPDATE comptes
SET solde = solde + event.amount,
    derniere_operation_at = event.server_timestamp
WHERE id = event.payload->>'compteId';
```

#### ReconcReactor
Apres chaque batch d'evenements d'un agent, reconcilie :
- Solde caisse physique (billetage declare) vs solde applicatif (somme des evenements)
- Total des ecritures GL vs total des evenements

```
Si |solde_physique - solde_applicatif| > seuil_tolerance:
  --> Creer une alerte de reconciliation
  --> Bloquer la prochaine ouverture de session de l'agent
  --> Notifier le superviseur
```

#### AnomalyReactor
Detecte des patterns suspects dans le flux d'evenements.

```
Regles de detection :
1. Frequence anormale  : > 20 operations en 30 min
2. Montants ronds      : > 5 operations consecutives a montants ronds
3. Split suspect       : > 3 operations proches du plafond single_op
4. Horaires inhabituels: operations entre 22h et 5h
5. Geo-anomalie        : operations a > 50km de l'agence de rattachement
6. Volume excessif     : volume journalier > 3x la moyenne mobile 30j
7. Client fantome      : nouveau client + grosse operation dans la meme session
```

#### NotifReactor
Envoie des notifications push (WebSocket + SMS de secours) aux superviseurs.

#### ReportReactor
Alimente les rapports reglementaires COBAC en temps reel.

### 4.5. Flux complet d'une operation (bout en bout)

```
Agent appuie "Depot 50 000 XAF" sur son telephone
  |
  v
[1] UI appelle executeOfflineOperation()
  |
  v
[2] canExecuteOffline() verifie les limites HMAC-signees
  |  - Plafond caisse: OK
  |  - Limite single op: OK
  |  - Limite journaliere: OK
  |  - Duree offline: OK
  |  - Backlog sync: OK
  |
  v
[3] appendJournalEntry() dans une transaction Dexie atomique
  |  - Obtenir next sequence + previous hash
  |  - Hasher le payload (SHA-256)
  |  - Chiffrer le payload (AES-256-GCM)
  |  - Calculer le hash de chaine
  |  - Signer avec ECDSA P-256
  |  - Ecrire dans IndexedDB
  |
  v
[4] OfflineBus.emit(entry) diffuse l'evenement
  |
  +---> TreasuryReactor : solde caisse 150 000 -> 200 000 XAF
  +---> CacheReactor    : invalidate(['compte', 'CE-001'])
  +---> UIReactor       : toast "Depot 50 000 XAF - Ref DEP-20260213-000004"
  +---> SyncReactor     : debounce 3s, puis tentative sync si online
  +---> LimitsReactor   : 12/50 ops (24%), OK
  +---> AuditReactor    : log audit local
  |
  v
[5] Retour vers l'UI : { journalUuid, operationRef, newCashBalance }
  |
  === Si reseau disponible (immediat ou plus tard) ===
  |
  v
[6] SyncService.syncJournal() — Phase 1: Handshake
  |  - Envoie chainHead, pendingCount, deviceKeyId
  |  - Recoit serverTime, offlineLimits mis a jour, cles revoquees
  |
  v
[7] Phase 2: Upload batch (10 entrees max par batch)
  |  - Envoie uuid, sequence, type, payload, hash, signature
  |  - Serveur valide : signature, hash chain, idempotence
  |  - Reponse : { accepted: [...], rejected: [...], conflicts: [...] }
  |
  v
[8] Serveur: Event Ingestion Pipeline
  |  - Insere dans server_journal_entries
  |  - ServerBus.emit(confirmedEntry)
  |    +---> GLReactor       : ecritures SYSCOHADA
  |    +---> BalanceReactor   : projection solde
  |    +---> ReconcReactor    : verification coherence
  |    +---> AnomalyReactor   : scan pattern fraude
  |    +---> NotifReactor     : alerte superviseur si besoin
  |    +---> ReportReactor    : alimentation rapports COBAC
  |
  v
[9] Phase 3: Pull updates
  |  - Client recoit confirmations, met a jour syncStatus -> 'confirmed'
  |
  v
[10] Operation complete. Tracabilite de bout en bout garantie.
```

---

## 5. Modele de donnees offline

### 5.1. Tables IndexedDB (Dexie v3)

```
COFINOfflineDB (IndexedDB)
|
+-- journalEntries          <-- Coeur: evenements immuables
|   [sequence, uuid, type, syncStatus, sessionId, localTimestamp]
|
+-- deviceKeys              <-- Cles ECDSA P-256
|   [id, status, agentId]
|
+-- agentDaySessions        <-- Sessions journalieres agent
|   [date, agentId, syncStatus]
|
+-- offlineLimits           <-- Limites server-signees (HMAC)
|   [id='current']
|
+-- operations              <-- Queue de sync legacy (migration en cours)
|   [uuid, type, priority, status, idempotencyKey]
|
+-- clients                 <-- Cache clients offline (chiffre)
|   [uuid, serverId, isDirty, agenceId]
|
+-- transfers               <-- Transferts en attente
+-- caisseTransactions      <-- Transactions caisse
+-- epargneAccounts         <-- Comptes epargne
+-- credits                 <-- Credits en cours
+-- tontines                <-- Tontines
+-- remises                 <-- Remises terrain
+-- enquetes                <-- Enquetes agent
|
+-- conflicts               <-- Conflits non resolus
+-- metadata                <-- Curseurs de sync, ETags
+-- cachedQueries           <-- Cache React Query persistant
+-- cachedConfigs           <-- Configs systeme
+-- preferences             <-- Preferences utilisateur
+-- offlineSessions         <-- Sessions auth offline
+-- mapTiles                <-- Tuiles OpenStreetMap
+-- gpsTrackPoints          <-- Trace GPS agent
```

### 5.2. Relations entre les modeles

```
AgentDaySession (1) ---< JournalEntry (N)
     |                      |
     |                      +-- deviceKeyId --> DeviceKey
     |                      +-- sessionId = AgentDaySession.date
     |
     +-- openingBalance / closingBalance
     +-- currentCashBalance = opening + SUM(cash impacts)
     +-- firstJournalSequence / lastJournalSequence

OfflineLimits (singleton 'current')
     +-- serverSignature (HMAC-SHA256 par le serveur)
     +-- maxCaisseBalance, maxSingleOperation
     +-- maxDailyOperations, maxDailyVolume
     +-- maxOfflineDays, maxPendingSync
```

### 5.3. Modele serveur (projections)

```sql
-- Table serveur miroir du journal (source de verite post-sync)
CREATE TABLE server_journal_entries (
  id              BIGSERIAL PRIMARY KEY,
  client_uuid     UUID UNIQUE NOT NULL,          -- uuid du journal client
  client_sequence INTEGER NOT NULL,
  event_type      VARCHAR(50) NOT NULL,
  agent_id        INTEGER REFERENCES utilisateurs(id),
  device_id       VARCHAR(128) NOT NULL,
  agence_id       UUID REFERENCES agences(id),

  payload         JSONB NOT NULL,
  payload_hash    VARCHAR(64) NOT NULL,

  -- Chain from client
  client_previous_hash  VARCHAR(64),
  client_entry_hash     VARCHAR(64) NOT NULL,
  signature             TEXT NOT NULL,
  device_key_id         VARCHAR(64) NOT NULL,

  -- Client timestamps
  client_timestamp      BIGINT NOT NULL,
  monotonic_clock       DOUBLE PRECISION,
  ntp_offset            INTEGER,

  -- Server-assigned ordering
  server_sequence       BIGSERIAL,
  server_timestamp      TIMESTAMPTZ DEFAULT NOW(),

  -- Processing
  session_id            VARCHAR(10) NOT NULL,     -- YYYY-MM-DD
  operation_ref         VARCHAR(50) NOT NULL,
  idempotency_key       VARCHAR(128) UNIQUE NOT NULL,

  -- Status
  processing_status     VARCHAR(20) DEFAULT 'received',
  gl_entry_id           BIGINT,                   -- FK vers ecritures GL
  reconciled            BOOLEAN DEFAULT FALSE,

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour le replay et la reconciliation
CREATE INDEX idx_sje_agent_session ON server_journal_entries(agent_id, session_id);
CREATE INDEX idx_sje_agence_date ON server_journal_entries(agence_id, server_timestamp);
CREATE INDEX idx_sje_processing ON server_journal_entries(processing_status);
CREATE INDEX idx_sje_device ON server_journal_entries(device_id, client_sequence);
```

---

## 6. Signature et integrite cryptographique

### 6.1. Pile cryptographique

| Couche | Algorithme | Objectif |
|--------|-----------|----------|
| Signature evenements | ECDSA P-256 (SHA-256) | Non-repudiation, detection d'alteration |
| Chaine de hash | SHA-256 | Integrite de la sequence (tamper-evident) |
| Chiffrement au repos | AES-256-GCM (PBKDF2) | Confidentialite des donnees dans IndexedDB |
| Limites serveur | HMAC-SHA256 | Anti-falsification des parametres offline |
| Identifiant entree | UUIDv7 | Ordre temporel + unicite globale |

### 6.2. Flux de signature d'un evenement

```
1. Serialiser le payload en JSON
2. payloadHash = SHA-256(payload_json)
3. Chiffrer le payload : AES-256-GCM(payload_json) -> payload_encrypted
4. Obtenir { sequence, previousHash } atomiquement (transaction Dexie)
5. entryHash = SHA-256(sequence | uuid | type | payloadHash | previousHash | timestamp)
6. signature = ECDSA-P256-Sign(entryHash, devicePrivateKey)
7. Ecrire l'entree dans IndexedDB (transaction atomique)
```

### 6.3. Verification d'integrite de la chaine

```
Pour chaque entree E(i) (i = 1 ... N):
  1. Verifier E(i).sequence == i (pas de trou)
  2. Recalculer hash = SHA-256(sequence|uuid|type|payloadHash|previousHash|timestamp)
  3. Verifier hash == E(i).entryHash (integrite du hash de chaine)
  4. (Optionnel) Verifier ECDSA-Verify(E(i).entryHash, E(i).signature, publicKey)
  5. Verifier E(i).previousHash == E(i-1).entryHash (continuite de la chaine)

Resultat: { valid: boolean, brokenAt?: number, brokenReason?: string }
```

> **Implementation existante** : `journal-service.ts:verifyChainIntegrity()`

### 6.4. Gestion des cles ECDSA

| Aspect | Valeur |
|--------|--------|
| Algorithme | ECDSA P-256 |
| Stockage cle privee | CryptoKey non-extractable (WebCrypto -> IndexedDB) |
| Duree de vie | 90 jours |
| Rotation | Automatique a J-7, non-bloquante |
| Enregistrement serveur | Public key (JWK) envoyee au serveur a la creation |
| Revocation | Serveur peut revoquer via handshake |

> **Implementation existante** : `device-key-manager.ts`

---

## 7. Strategie de synchronisation

### 7.1. Protocole 3-Phase

```
Phase 1: HANDSHAKE
  Client --> Serveur:
    { deviceId, deviceKeyId, lastConfirmedSequence, chainHeadHash, pendingCount }
  Serveur --> Client:
    { serverTime, offlineLimits, revokedKeys[], protocolVersion }

Phase 2: UPLOAD (batches de 10)
  Client --> Serveur:
    { entries: [ {uuid, sequence, type, payload, hash, signature, ...} ] }
  Serveur --> Client:
    { accepted: [uuid], rejected: [{uuid, reason}], conflicts: [{uuid, ...}] }

Phase 3: PULL (delta)
  Client --> Serveur:
    { cursors: { clients: "2026-02-13T...", credits: "...", ... }, limit: 200 }
  Serveur --> Client:
    { changes: { clients: [...], credits: [...] }, hasMore: {...}, cursors: {...} }
```

### 7.2. Idempotence

Chaque evenement porte un `idempotencyKey` unique :

```
Format: journal-{UUIDv4}-{timestamp_ms}
Exemple: journal-a1b2c3d4-e5f6-7890-abcd-ef1234567890-1707820800000
```

Cote serveur (middleware `idempotency.ts`) :
- Si la cle existe et le traitement est termine : retourner le resultat cache (200)
- Si la cle existe et le traitement est en cours : retourner 409 Conflict
- Sinon : traiter et cacher le resultat (TTL 5 min dans PostgreSQL)

> Consequence : envoyer 10 fois le meme evenement ne produit qu'une seule ecriture.

### 7.3. Batching et priorites

```
File de priorite:
  [critical] caisse, transfer, remise    --> sync immediate
  [high]     payment, credit             --> sync dans les 30s
  [medium]   epargne, client, tontine    --> sync dans les 60s
  [low]      enquete, other              --> sync au prochain cycle

Taille batch : 10 evenements max par requete
Retry : backoff exponentiel (5s, 10s, 20s, 40s... max 60s)
```

### 7.4. Pull Sync (Serveur -> Client)

Le pull utilise des curseurs par entite (`updatedAt` ISO timestamp).
A chaque pull, seuls les enregistrements modifies depuis le dernier curseur
sont telecharges. Les curseurs sont persistes dans IndexedDB.

```
Entites synchronisees:
  clients, credits, remboursements, comptes, transferts, tontines, prospections

Taille page: 200 max
Pagination: si hasMore[entity] == true, re-pull dans 1s
```

---

## 8. Resolution de conflits

### 8.1. Matrice de resolution deterministe

| Scenario | Detection | Resolution | Priorite |
|----------|-----------|-----------|----------|
| Meme idempotencyKey | Serveur | Ignorer le doublon | Serveur |
| Solde insuffisant au moment du confirm | Serveur rejette | `rejected` + alerte | Serveur |
| Client modifie online + offline | Version mismatch | **Last-Writer-Wins** base sur serverTimestamp | Serveur |
| Deux agents creent le meme client | Deduplication par telephone | Merge + notification | Serveur |
| Session caisse en conflit | Double session meme jour | Rejeter la plus recente | Serveur |
| Plafond depasse post-sync | Aggregation des volumes | Alerte + bloc prochaine session | Serveur |

### 8.2. Strategies de resolution

```typescript
type ConflictResolution = 'local' | 'server' | 'merged';

// Pour les donnees financieres: TOUJOURS server-wins
// L'evenement rejete est conserve localement pour audit
// L'agent est notifie de la raison du rejet

// Pour les donnees clients: merge intelligent
// - Champs modifies par l'agent offline: garder local
// - Champs modifies par un autre agent online: garder serveur
// - Si meme champ modifie des deux cotes: server-wins + notification
```

### 8.3. Table de conflits

```typescript
interface ConflictRecord {
  operationId: string;
  entityType: OperationType;
  entityId: string;
  localData: string;     // JSON
  serverData: string;    // JSON
  createdAt: number;
  resolvedAt?: number;
  resolution?: 'local' | 'server' | 'merged';
  resolvedBy?: string;   // agent ou superviseur
  mergedData?: string;
}
```

> Les conflits non resolus bloquent la synchronisation de l'entite concernee
> mais n'empechent pas les autres operations de se synchroniser.

---

## 9. Tresorerie offline — Trois couches

### 9.1. Separation des flux

```
+------------------+     +------------------+     +------------------+
|  COUCHE 1        |     |  COUCHE 2        |     |  COUCHE 3        |
|  Flux Physique   |     |  Flux Applicatif |     |  Flux Comptable  |
|  (Cash reel)     |     |  (Journal local) |     |  (GL serveur)    |
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
| Billetage        |     | JournalEntry     |     | Ecritures        |
| (coupures)       |     | (events signees) |     | SYSCOHADA        |
|                  |     |                  |     |                  |
| Declare par      |     | Calcule par      |     | Genere par       |
| l'agent          |     | le systeme       |     | le serveur       |
| (ouverture +     |     | (sum des events) |     | (GLReactor)      |
|  cloture)        |     |                  |     |                  |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        +----------+-------------+                        |
                   |                                      |
            Reconciliation                         Reconciliation
            locale (offline)                       serveur (post-sync)
```

### 9.2. Session journaliere agent

```
OUVERTURE (debut de journee)
  Agent declare le billetage initial :
    { "10000": 5, "5000": 10, "1000": 20, "500": 10 }
    = 5*10000 + 10*5000 + 20*1000 + 10*500 = 125 000 XAF

  --> openingBalance = 125 000 XAF
  --> Evenement CAISSE_OPEN dans le journal

OPERATIONS (journee)
  Depot 50 000   --> currentCashBalance = 175 000
  Depot 30 000   --> currentCashBalance = 205 000
  Retrait 20 000 --> currentCashBalance = 185 000

CLOTURE (fin de journee)
  Agent recompte physiquement :
    { "10000": 8, "5000": 12, "1000": 25, "500": 10 }
    = 170 000 XAF (physique)

  Solde attendu (applicatif) = 185 000 XAF
  Ecart = 170 000 - 185 000 = -15 000 XAF

  --> Si ecart > seuil : agent doit justifier
  --> Evenement CAISSE_CLOSE avec ecart + justification
```

### 9.3. Limites offline (server-signed)

```typescript
interface OfflineLimits {
  maxCaisseBalance: number;      // ex: 5 000 000 XAF
  maxSingleOperation: number;    // ex: 1 000 000 XAF
  maxDailyOperations: number;    // ex: 50
  maxDailyVolume: number;        // ex: 10 000 000 XAF
  maxOfflineDays: number;        // ex: 7
  maxPendingSync: number;        // ex: 200
  allowedOperationTypes: string[]; // types autorises offline
  serverSignature: string;       // HMAC-SHA256 (anti-falsification)
}
```

Les limites sont transmises lors du handshake de sync et stockees localement.
Avant chaque operation, `canExecuteOffline()` verifie :

1. Signature HMAC valide (les limites n'ont pas ete falsifiees)
2. Type d'operation autorise offline
3. Session ouverte
4. Plafond caisse non depasse (projection apres operation)
5. Pas de solde negatif
6. Montant unitaire dans les limites
7. Nombre d'operations journalier dans les limites
8. Volume journalier dans les limites
9. Duree offline dans les limites
10. Backlog de sync dans les limites

> **Implementation existante** : `offline-treasury.ts:canExecuteOffline()`

### 9.4. Reconciliation automatique post-sync

```
Apres chaque sync batch:
  1. Serveur recalcule le solde caisse de l'agent
     a partir de TOUS les evenements confirmes
  2. Compare avec le solde declare (session journaliere)
  3. Si ecart:
     - |ecart| < 1000 XAF : tolerance (erreur d'arrondi/comptage)
     - |ecart| < 10 000 XAF : alerte + justification requise
     - |ecart| >= 10 000 XAF : blocage + escalade superviseur
```

---

## 10. Securite et controle interne

### 10.1. Defense en profondeur

```
Couche 1: Appareil
  - Cle ECDSA non-extractable (WebCrypto)
  - Donnees chiffrees AES-256-GCM dans IndexedDB
  - Session auth avec expiration
  - Fingerprint appareil (hash composants navigateur)

Couche 2: Journal local
  - Hash-chain SHA-256 (detection d'alteration)
  - Signatures ECDSA (non-repudiation)
  - Sequence gap-free (detection de suppression)
  - Limites HMAC-signees (anti-falsification)

Couche 3: Transport
  - HTTPS (TLS 1.3)
  - Headers d'idempotence
  - Circuit breaker (anti-DDoS accidentel)
  - Rate limiting par agent

Couche 4: Serveur
  - Validation de signature sur chaque evenement
  - Verification de la chaine de hash
  - Reconciliation automatique
  - Detection d'anomalies
  - Cles revocables a distance (via handshake)
```

### 10.2. Detection de fraude offline

| Pattern | Detection | Action |
|---------|-----------|--------|
| Suppression d'entrees | Trou dans la sequence | Rejet du batch + alerte |
| Modification d'entree | Hash de chaine rompu | Rejet + blocage agent |
| Falsification signature | ECDSA verification echoue | Rejet + revocation cle |
| Falsification limites | HMAC invalide | Blocage immediat |
| Collusion multi-appareil | Meme agentId, deviceId different, meme jour | Alerte superviseur |
| Split operations | >3 ops proches du plafond unitaire | Alerte + audit |
| Operations fantomes | Sequence OK mais payload incoherent | Reconciliation echouee |

### 10.3. Separation des roles (COBAC)

```
Agent terrain:
  - Peut: creer client, depot, retrait, remboursement, cotisation tontine
  - Ne peut pas: modifier limites, valider credits, acceder aux rapports

Caissier agence:
  - Peut: ouverture/cloture session, approvisionnement, versement coffre
  - Ne peut pas: modifier les ecritures GL, supprimer des operations

Superviseur:
  - Peut: voir les rapports, resoudre conflits, revoquer cles
  - Ne peut pas: effectuer des operations financieres

Administrateur:
  - Peut: configurer limites, gerer les utilisateurs, acceder aux logs
  - Ne peut pas: modifier le journal immuable
```

---

## 11. Conformite reglementaire COBAC / SYSCOHADA

### 11.1. Exigences COBAC — Couverture par l'architecture

| Exigence COBAC | Mecanisme dans l'architecture |
|----------------|------------------------------|
| Tracabilite complete | Journal immuable hash-chaine + signe |
| Identification des operations | UUIDv7 + reference metier (DEP-YYYYMMDD-NNNNNN) |
| Horodatage fiable | Triple horodatage (local + monotone + offset NTP) |
| Non-repudiation | Signature ECDSA P-256 par appareil + agent |
| Separation des roles | RBAC dynamique (module permissions) |
| Controle interne | Limites parametrables + reconciliation auto |
| Audit trail inviolable | Append-only + hash-chain + signature |
| Reconstitution historique | Replay des evenements par session/jour/agent |
| Reporting reglementaire | ReportReactor genere les rapports a partir des evenements |

### 11.2. SYSCOHADA revise — Comptabilisation

Le plan comptable SYSCOHADA est applique exclusivement cote serveur via le
GLReactor. Les numeros de comptes suivent le referentiel des etablissements
de microfinance en zone CEMAC :

```
Classe 2 : Comptes de clientele
  2011 - Credits a court terme
  2012 - Credits a moyen terme
  2511 - Comptes d'epargne a vue
  2512 - Comptes d'epargne a terme

Classe 5 : Tresorerie
  5711 - Caisse agent
  5712 - Caisse agence
  5713 - Coffre-fort

Classe 7 : Produits
  7021 - Interets sur credits
  7022 - Commissions d'ouverture
  7031 - Frais de tenue de compte
```

### 11.3. Preuve que l'offline n'introduit pas de risque systemique

1. **Immutabilite** : les evenements offline sont proteges par hash-chain + ECDSA
2. **Limites** : les parametres offline sont signes HMAC par le serveur
3. **Reconciliation** : tout ecart est detecte automatiquement a la sync
4. **Auditabilite** : l'historique exact d'une journee offline est reconstituable
5. **Non-repudiation** : chaque operation est liee a un agent + appareil specifique
6. **Determinisme** : le replay des evenements produit toujours le meme etat
7. **Degradation controlee** : les operations a haut risque sont bloquees offline

---

## 12. Scenarios d'echec

### 12.1. Perte ou vol d'appareil

```
Impact:
  - Donnees chiffrees AES-256-GCM (inaccessibles sans session)
  - Cle ECDSA non-extractable (ne peut pas etre copiee)
  - Evenements non synchronises potentiellement perdus

Mitigation:
  1. Superviseur revoque la cle appareil via le serveur
  2. Au prochain handshake, le serveur signale la revocation
  3. Agent re-login sur nouvel appareil, nouvelle cle generee
  4. Les evenements non synces de l'ancien appareil sont marques "orphelins"

Recuperation des donnees:
  - Si l'appareil est retrouve: sync forcee avant wipe
  - Si perdu definitivement: reconstitution a partir du dernier sync
  - Operations entre le dernier sync et la perte: declaration manuelle
    avec piece justificative (reconciliation superviseur)

Procedure operationnelle:
  1. Agent signale la perte immediatement (appel/SMS)
  2. Superviseur verrouille le compte agent
  3. Revocation de la cle appareil
  4. Inventaire physique de la caisse de l'agent
  5. Rapprochement avec le dernier etat synchronise
  6. Ajustement comptable si necessaire (ecriture manuelle superviseur)
```

### 12.2. Fraude agent (alteration du journal)

```
Detection:
  A la synchronisation, le serveur verifie:
  1. La continuite de la chaine de hash
  2. La validite de chaque signature ECDSA
  3. La coherence de la sequence (pas de trous)
  4. La coherence des montants (pas de solde negatif)

Si alteration detectee:
  - Le batch entier est rejete
  - L'agent est bloque (impossible d'operer offline)
  - Alerte escaladee au superviseur + controle interne
  - L'ancien journal (tel que le serveur l'avait) fait foi
  - Procedure disciplinaire declenchee

Impossibilite de fraude sans detection:
  - Modifier une entree -> hash de chaine rompu -> rejete
  - Supprimer une entree -> trou de sequence -> rejete
  - Inserer une entree -> signature invalide (pas de cle) -> rejete
  - Modifier les limites -> HMAC invalide -> blocage immediat
```

### 12.3. Conflit multi-agents (meme client)

```
Scenario:
  Agent A (offline) fait un depot sur compte C1
  Agent B (online) fait un retrait sur compte C1

Resolution:
  1. L'operation de Agent B (online) est executee immediatement
  2. L'operation de Agent A arrive au sync et est evaluee:
     - Si solde suffisant apres l'op de B: acceptee
     - Si solde insuffisant: rejetee, agent A notifie
  3. L'evenement rejete reste dans le journal local (historique)
     avec syncStatus = 'rejected', syncError = 'INSUFFICIENT_BALANCE'

Prevention:
  - Les operations de retrait sont bloquees offline (offlinePolicy: 'block')
  - Seuls les depots et remboursements sont autorises offline (entrees de cash)
  - Les decaissements de credit sont bloques offline
```

### 12.4. Echec de sync partiel

```
Scenario:
  Batch de 10 evenements, 7 acceptes, 2 rejetes, 1 en conflit

Traitement:
  - 7 acceptes -> syncStatus = 'confirmed'
  - 2 rejetes -> syncStatus = 'rejected' (avec raison)
  - 1 conflit -> syncStatus = 'local' (reste en queue) + ConflictRecord cree

L'agent voit:
  - Badge: "1 conflit a resoudre"
  - Les 7 operations confirmees
  - Les 2 operations rejetees avec explication

Le prochain batch commence apres le dernier evenement confirme.
Les evenements rejetes ne sont JAMAIS re-envoyes (mais restent dans le journal
pour audit).
```

### 12.5. Corruption de la base IndexedDB

```
Scenario:
  L'utilisateur vide le cache navigateur, ou IndexedDB est corrompue

Impact:
  - Perte du journal local non synchronise
  - Perte des cles ECDSA (nouvelle generation necessaire)
  - Perte des caches et preferences

Mitigation:
  1. Verification d'integrite au demarrage (verifyChainIntegrity)
  2. Si corruption detectee:
     a. Alerte a l'agent: "Donnees locales corrompues"
     b. Forcer une sync complete (full pull) depuis le serveur
     c. Generer une nouvelle paire de cles
     d. Les operations non synchronisees sont perdues
  3. En prevention:
     - Sauvegardes periodiques du journal dans le cache Service Worker
     - Export chiffre optionnel vers stockage externe (si dispo)

Procedure:
  1. Agent signale le probleme
  2. Superviseur reconcilie avec le dernier etat serveur
  3. Inventaire physique de la caisse
  4. Ajustement si necessaire
```

### 12.6. Derive temporelle

```
Scenario:
  L'horloge de l'appareil derive de plusieurs heures (batterie, manipulation)

Detection:
  - A chaque sync, le serveur envoie serverTime
  - ntpOffset = serverTime - Date.now() est stocke
  - Si |ntpOffset| > 1 heure: alerte

Mitigation:
  - Le journal utilise un triple horodatage:
    1. localTimestamp (Date.now()) - potentiellement inexact
    2. monotonicClock (performance.now()) - relatif mais fiable pour l'ordre
    3. ntpOffset - permet de corriger au moment de la sync
  - Le serveur assigne un serverTimestamp definitif a la confirmation
  - L'ordre des evenements est determine par sequence, PAS par timestamp
```

---

## 13. Deploiement terrain — Zones rurales CEMAC

### 13.1. Contraintes terrain

| Contrainte | Impact | Mitigation |
|-----------|--------|-----------|
| Reseau 3G intermittent | Sync impossible pendant des heures | Architecture offline-first avec journal local |
| Coupures electriques | Appareil s'eteint sans prevenir | Transaction Dexie atomique (IndexedDB est durable) |
| Smartphones bas de gamme | RAM limitee (1-2 Go) | Batching petit (10), pas de gros cache en memoire |
| Ecrans petits | UI complexe difficile | Interface simplifiee pour agents terrain |
| Analphabetisme numerique | Erreurs de saisie frequentes | Validation stricte + confirmation avant execution |
| Chaleur/poussiere | Usure materielle acceleree | Rotation materielle planifiee (12-18 mois) |

### 13.2. Strategie de deploiement

```
Phase 1: Pre-deploiement (agence)
  - Installer la PWA sur l'appareil de l'agent
  - Generer et enregistrer la cle ECDSA
  - Telecharger les limites offline (signees)
  - Pre-cacher les donnees clients de la zone
  - Pre-cacher les tuiles cartographiques de la zone

Phase 2: Formation (1/2 journee)
  - Ouverture/cloture de session avec billetage
  - Depot et retrait sur compte epargne
  - Remboursement de credit
  - Consultation client
  - Procedure en cas de perte d'appareil

Phase 3: Accompagnement (2 semaines)
  - Agent opere avec superviseur a distance
  - Verification quotidienne des reconciliations
  - Ajustement des limites si necessaire

Phase 4: Autonomie
  - Agent opere de maniere independante
  - Sync opportuniste quand le reseau est dispo
  - Reconciliation automatique en arriere-plan
```

### 13.3. Dimensionnement stockage

```
Estimation pour un agent moyen (30 operations/jour, 5 jours offline max):

Journal entries:  30 ops/j * 5j * ~2 Ko = 300 Ko
Clients cache:    200 clients * 5 Ko = 1 Mo
Maps tiles:       Zone 10km2, zoom 12-16 = ~5 Mo
Service Worker:   App shell + assets = ~3 Mo
Config + limites: ~50 Ko
---
Total estime:     ~10 Mo

Capacite IndexedDB typique: 50 Mo - 500 Mo (selon appareil)
Marge confortable meme sur appareils bas de gamme.
```

### 13.4. Gestion de la bande passante

```
Priorite de sync quand le reseau est faible:
  1. Journal entries (evenements financiers) - critique
  2. Cles ECDSA (enregistrement/rotation) - critique
  3. Limites offline (mise a jour parametres) - haute
  4. Clients (delta pull) - moyenne
  5. Tuiles carte - basse
  6. Photos/documents - basse

Compression:
  - Les payloads JSON sont envoyes tels quels (deja compacts)
  - Les photos sont compressees client-side avant stockage (JPEG qualite 70%)
  - Gzip active sur les reponses API (Express compression middleware)

Detection qualite reseau:
  - Latence < 500ms : online (sync complete)
  - Latence 500ms-2s : unstable (sync critique uniquement)
  - Latence > 2s : considere offline (pas de sync)
  - Circuit breaker : 5 echecs -> blocage 30s -> probe
```

### 13.5. Modes de connectivite supportes

```
1. Wi-Fi agence       : Sync complete, pull + push, pre-caching
2. 3G/4G mobile       : Sync evenements, delta pull leger
3. 2G/EDGE            : Sync journal uniquement (critique)
4. Bluetooth/hotspot  : Agent-a-agent (futur) pour remise en main propre
5. Completement offline: Operations locales avec journal + limites
```

---

## 14. Etat de l'implementation existante

### 14.1. Ce qui est deja implemente

| Composant | Statut | Fichier |
|-----------|--------|---------|
| Journal immuable hash-chaine | Complet | `journal-service.ts` |
| Signature ECDSA P-256 | Complet | `offline-crypto.ts` |
| Chiffrement AES-256-GCM | Complet | `offline-crypto.ts` |
| Verification HMAC limites | Complet | `offline-crypto.ts` |
| Base Dexie (21 tables) | Complet | `offline-db.ts` |
| Gestion cles ECDSA | Complet | `device-key-manager.ts` |
| Session journaliere agent | Complet | `offline-treasury.ts` |
| Limites offline signees | Complet | `offline-treasury.ts` |
| Reconciliation locale | Complet | `offline-treasury.ts` |
| Sync 3-phase journal | Complet | `syncService.ts` |
| Pull sync delta | Complet | `syncService.ts` |
| Network circuit breaker | Complet | `networkManager.ts` |
| Critical ops registry | Complet | `criticalOperations.ts` |
| Service Worker 6 caches | Complet | `sw-custom.ts` |
| Background sync | Complet | `sw-custom.ts` |
| Idempotency middleware | Complet | `server/middleware/idempotency.ts` |
| PWA + manifest | Complet | `manifest.json` |

### 14.2. Ce qui reste a construire

| Composant | Priorite | Description |
|-----------|----------|-------------|
| **OfflineBus (Event Bus local)** | Haute | Decoupler les reacteurs du flux lineaire actuel |
| **ServerBus + Reacteurs serveur** | Haute | Pipeline d'ingestion evenements + projections |
| **GLReactor (ecritures SYSCOHADA)** | Haute | Generation auto des ecritures comptables |
| **server_journal_entries table** | Haute | Table serveur miroir du journal client |
| **AnomalyReactor** | Moyenne | Detection patterns de fraude |
| **ReconcReactor serveur** | Moyenne | Reconciliation auto post-sync |
| **UI resolution de conflits** | Moyenne | Interface pour resoudre les conflits manuels |
| **Endpoints /api/sync/** | Haute | Handshake, journal upload, pull (a completer) |
| **Export audit chiffre** | Basse | Sauvegarde locale exportable |
| **Recherche offline full-text** | Basse | Index de recherche dans IndexedDB |
| **Sync selective** | Basse | Choisir les entites a garder offline |

### 14.3. Architecture cible — Prochaines etapes

```
Etape 1 (Sprint 1-2): Event Bus + Server Pipeline
  - Implementer OfflineBus dans client/src/lib/offline-bus.ts
  - Decoupler les reacteurs de executeOfflineOperation()
  - Creer la table server_journal_entries
  - Implementer /api/sync/handshake et /api/sync/journal

Etape 2 (Sprint 3-4): Comptabilite + Reconciliation
  - Implementer GLReactor (ecritures SYSCOHADA automatiques)
  - Implementer ReconcReactor (reconciliation post-sync)
  - Alertes et notifications superviseur

Etape 3 (Sprint 5-6): Securite avancee + Conformite
  - AnomalyReactor (detection de fraude)
  - ReportReactor (rapports COBAC)
  - UI de resolution de conflits
  - Export audit chiffre

Etape 4 (Sprint 7-8): Deploiement terrain
  - Tests terrain avec agents pilotes
  - Ajustement des limites et seuils
  - Formation et documentation operationnelle
```

---

## Annexe A : Glossaire

| Terme | Definition |
|-------|-----------|
| **Billetage** | Decomposition en coupures (10 000, 5 000, 1 000, 500, 100 XAF) |
| **COBAC** | Commission Bancaire de l'Afrique Centrale |
| **SYSCOHADA** | Systeme Comptable des Etats de l'Afrique de l'Ouest et Centrale |
| **CEMAC** | Communaute Economique et Monetaire de l'Afrique Centrale |
| **XAF** | Franc CFA (monnaie zone CEMAC) |
| **Event Sourcing** | Pattern ou l'etat est derive d'une sequence d'evenements immuables |
| **Hash Chain** | Chaine ou chaque element reference le hash de l'element precedent |
| **Circuit Breaker** | Pattern de resilience qui coupe les appels apres N echecs |
| **Idempotence** | Propriete d'une operation qui produit le meme resultat si executee plusieurs fois |
| **PWA** | Progressive Web App (application web installable) |
| **NTP Offset** | Difference entre l'heure serveur et l'heure locale |
| **ECDSA P-256** | Algorithme de signature sur courbe elliptique |
| **AES-256-GCM** | Algorithme de chiffrement symetrique authentifie |

## Annexe B : References techniques

| Composant | Version | Usage |
|-----------|---------|-------|
| Dexie.js | 4.2.1 | IndexedDB wrapper |
| Workbox | 7.4.0 | Service Worker + caching |
| TanStack Query | 5.x | Cache + state management |
| Web Crypto API | - | ECDSA, AES-GCM, PBKDF2, SHA-256 |
| UUIDv7 | RFC 9562 | Identifiants ordonnables |
| Vite PWA Plugin | 0.21.x | PWA generation |

---

> **Ce document est le referentiel d'architecture pour le mode offline du SaaS Cofinco.**
> Toute modification de l'architecture offline doit etre refletee ici.
