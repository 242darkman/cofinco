# Architecture Offline-First — COFIN&CO Microfinance

> Stack : React (Vite/PWA) + Node/Express + PostgreSQL + Drizzle ORM + Dexie (IndexedDB) + WebSocket
> Date : 2026-02-09 | Auteur : Architecture Session

---

## Table des matières

1. [Analyse des modules & priorisation offline](#1-analyse-des-modules--priorisation-offline-first)
2. [Architecture résiliente end-to-end](#2-architecture-résiliente-end-to-end)
3. [Modèle de données offline + outbox](#3-modèle-de-données-offline--outbox)
4. [Gestion réseau & reconnexion automatique](#4-gestion-réseau--reconnexion-automatique)
5. [API Backend + garanties](#5-api-backend--garanties)
6. [Implémentation concrète](#6-implémentation-concrète)
7. [Plan de tests & validation](#7-plan-de-tests--validation)
8. [Guide d'intégration progressive](#8-guide-dintégration-progressive)

---

## Audit de l'existant (baseline)

Avant de concevoir, voici ce qui existe déjà et ce qui manque.

### Ce qui existe (18 composants)

| Couche | Composant | Fichier | État |
|--------|-----------|---------|------|
| Network | `NetworkManager` (state machine + circuit breaker) | `client/src/lib/networkManager.ts` | ✅ Solide |
| Network | `connectivityService` (HEAD ping /api/health) | `client/src/lib/connectivityService.ts` | ⚠️ Doublon avec ServerHealth |
| Network | `ServerHealthContext` (polling backoff) | `client/src/contexts/ServerHealthContext.tsx` | ⚠️ Doublon |
| Network | `NetworkContext` (React wrapper) | `client/src/contexts/NetworkContext.tsx` | ✅ OK |
| Offline DB | Dexie IndexedDB (16 tables) | `client/src/lib/offline-db.ts` | ✅ Complet |
| Sync | `SyncService` (push queue, batches) | `client/src/lib/syncService.ts` | ✅ Bon |
| Sync | `OfflineContext` (agrégateur) | `client/src/contexts/OfflineContext.tsx` | ✅ OK |
| SW | Service Worker (BackgroundSync) | `client/src/sw-custom.ts` | ✅ 2 queues |
| PWA | VitePWA (Workbox, 11 caching strategies) | `vite.config.ts` | ✅ Complet |
| Fetch | Global fetch override (retry, backoff, circuit) | `client/src/main.tsx` | ✅ Robuste |
| Fetch | API client (idempotency key injection) | `client/src/lib/api-client.ts` | ✅ OK |
| Critical | Registry 16 opérations financières | `client/src/lib/criticalOperations.ts` | ⚠️ Toutes en `block` |
| Query | `useAdaptiveQuery` (staleTime adaptatif) | `client/src/hooks/useAdaptiveQuery.ts` | ✅ OK |
| Query | `usePersistentQuery` (IndexedDB double-cache) | `client/src/hooks/usePersistentQuery.ts` | ✅ OK |
| WS | WebSocket (reconnect, offline buffer) | `client/src/contexts/WebSocketContext.tsx` | ✅ OK |
| Backend | Idempotency middleware (in-memory TTL 5min) | `server/middleware/idempotency.ts` | ❌ Non persisté |
| Backend | Duplicate detection (heuristique DB) | `server/middleware/duplicate-detection.ts` | ✅ OK |
| Backend | Outbox Worker (polling 500ms → WS broadcast) | `server/services/outbox-worker.ts` | ✅ OK |

### Ce qui manque (10 lacunes critiques)

| # | Lacune | Impact | Priorité |
|---|--------|--------|----------|
| 1 | **Idempotency serveur en mémoire** — perdu au restart, pas multi-instance | Risque de doublons post-restart | P0 |
| 2 | **Toutes opérations critiques bloquées offline** — agents terrain inutilisables | UX terrain brisée | P0 |
| 3 | **Pas de sync pull (serveur → client)** — le client push mais ne récupère pas les changements | Données locales stale | P0 |
| 4 | **Pas de versioning entités** — pas d'`entity_version`/ETag pour détection conflits | Conflit silencieux = corruption | P1 |
| 5 | **Systèmes de connectivité dupliqués** — 3 systèmes parallèles | Incohérence d'état | P1 |
| 6 | **File offline dupliquée** — `useOfflineQueue` (localStorage) ≠ `offline-db` (IndexedDB) | Désync entre files | P1 |
| 7 | **Pas de delta sync incrémental** — pas de curseur/watermark | Sync lente sur gros volumes | P2 |
| 8 | **Pas de chiffrement IndexedDB** — données financières en clair localement | Risque compliance | P2 |
| 9 | **Pas d'ETag/conditional requests** — pas d'`If-None-Match` | Bande passante gaspillée | P2 |
| 10 | **Outbox polling uniquement** — 500ms poll au lieu d'event-driven | Latence publication events | P3 |

---

## 1. Analyse des modules & priorisation offline-first

### Modules COFIN&CO et classification

| Module | Classification | Actions offline | Risques | Données locales minimales |
|--------|---------------|-----------------|---------|---------------------------|
| **Agent Terrain** (collecte, prospection) | **OFFLINE OBLIGATOIRE** | Enregistrement clients, collecte remboursements, photos, GPS, enquêtes crédit | Conflit identité client, montants incorrects | Portefeuille clients (50-200), échéanciers actifs, carte offline |
| **Caisse** (sessions, encaissements) | **OFFLINE RECOMMANDÉ** | Encaissements espèces, reçus, consultation solde | Double encaissement, solde désynchronisé | Session ouverte, plafond, historique jour |
| **Clients** (fiche, KYC) | **OFFLINE RECOMMANDÉ** | Consultation, création fiche, upload docs | Doublons clients, photos manquantes | Fiches clients de l'agence |
| **Épargne** (dépôts, retraits) | **OFFLINE RECOMMANDÉ** | Dépôts en mode queue | Double dépôt, retrait sans solde réel | Comptes actifs + soldes snapshot |
| **Crédit** (remboursement) | **OFFLINE RECOMMANDÉ** | Remboursements en mode queue | Double remboursement, échéancier stale | Crédits actifs + échéanciers |
| **Tontine** (cotisations) | **OFFLINE RECOMMANDÉ** | Cotisations en mode queue | Double cotisation | Tontines actives + état cycle |
| **Coffre-Fort** (transferts) | **ONLINE SEULEMENT** | Aucune (opérations inter-structures) | Coffre = registre central, pas de tolérance au stale | — |
| **Administration** (users, RBAC) | **ONLINE SEULEMENT** | Aucune | Modification permissions offline = faille sécurité | — |
| **Reporting** (tableaux de bord) | **ONLINE SEULEMENT** | Consultation cache stale | Décisions sur données obsolètes | Derniers snapshots en cache IndexedDB |
| **Comptabilité GL** | **ONLINE SEULEMENT** | Aucune | GL = référence unique, pas de tolérance | — |

### Décision architecturale : mode `queue` vs `block`

```
BLOCK  = Opération refusée offline. L'utilisateur voit un message "connexion requise".
QUEUE  = Opération enregistrée localement, synchronisée dès retour réseau.
         Un reçu "provisoire" est émis avec mention explicite du statut.
```

**Règle critique** : Toute opération en mode `queue` DOIT :
1. Avoir une clé d'idempotence (UUID v7 générée côté client)
2. Être validée localement (solde snapshot suffisant, plafond respecté)
3. Générer un reçu provisoire avec statut `EN_ATTENTE_SYNC`
4. Être visible dans l'UI avec badge "en attente de synchronisation"
5. Être rejouable (retry automatique) et annulable (tant que non sync)

### Reclassification `criticalOperations.ts`

Changements par rapport à l'existant (toutes en `block` actuellement) :

| Opération | Existant | Proposé | Justification |
|-----------|----------|---------|---------------|
| `depot_epargne` | `block` | **`queue`** | Agent terrain encaisse en brousse |
| `remboursement_credit` | `block` | **`queue`** | Agent terrain collecte en brousse |
| `cotisation_tontine` | `block` | **`queue`** | Collecte terrain |
| `ouverture_session` | `block` | `block` | Nécessite vérification coffre temps réel |
| `cloture_session` | `block` | `block` | Nécessite réconciliation temps réel |
| `decaissement_credit` | `block` | `block` | Déblocage fonds = risque fraude |
| `retrait_epargne` | `block` | `block` | Retrait nécessite solde réel vérifié |
| `virement` | `block` | `block` | Transfert entre comptes = atomique |
| `transfert_coffre` | `block` | `block` | Inter-structures = registre central |
| `approvisionnement_caisse` | `block` | `block` | Coffre → Caisse = registre central |
| `versement_coffre` | `block` | `block` | Caisse → Coffre = registre central |
| `mm_depot` | `block` | `block` | Dépend de provider externe (MTN/Orange) |
| `mm_retrait` | `block` | `block` | Dépend de provider externe |
| `paiement_tontine` | `block` | `block` | Distribution = fonds sortants |
| `remboursement_anticipe` | `block` | `block` | Calcul intérêts serveur |

**Résumé : 3 opérations passent de `block` à `queue`** — toutes liées au terrain.

---

## 2. Architecture résiliente end-to-end

### Diagramme d'architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React PWA)                          │
│                                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │   UI      │  │ React Query  │  │ API Client │  │ Offline Context  │  │
│  │Components │←→│ (TanStack)   │←→│ (fetch +   │←→│ (état sync,      │  │
│  │           │  │ staleWhile   │  │ interceptor│  │  conflits, file) │  │
│  └──────────┘  │ Revalidate   │  │ idempotency│  └────────┬─────────┘  │
│                └──────┬───────┘  │ key inject) │           │            │
│                       │          └──────┬──────┘           │            │
│                       │                 │                  │            │
│                       ▼                 ▼                  ▼            │
│              ┌────────────────────────────────────────────────┐         │
│              │          UNIFIED NETWORK GATEWAY               │         │
│              │                                                │         │
│              │  ┌─────────────┐  ┌───────────┐  ┌─────────┐ │         │
│              │  │ Network     │  │ Circuit   │  │ Request │ │         │
│              │  │ Monitor     │  │ Breaker   │  │ Router  │ │         │
│              │  │ (consolidé) │  │ (existant)│  │(online/ │ │         │
│              │  └─────────────┘  └───────────┘  │ queue)  │ │         │
│              │                                   └────┬────┘ │         │
│              └────────────────────────────────────────┼──────┘         │
│                           │ ONLINE                    │ OFFLINE        │
│                           ▼                           ▼                │
│  ┌────────────────────────────┐   ┌────────────────────────────────┐   │
│  │    fetch() → Backend API   │   │   OUTBOX (IndexedDB/Dexie)    │   │
│  │    (credentials: include)  │   │                                │   │
│  │    timeout: 10s            │   │  ┌──────────────────────────┐  │   │
│  │    retry: backoff + jitter │   │  │ operations (queue)       │  │   │
│  └────────────────────────────┘   │  │ • uuid (ULID)           │  │   │
│                                   │  │ • idempotencyKey         │  │   │
│                                   │  │ • payload + hash         │  │   │
│                                   │  │ • priority + status      │  │   │
│                                   │  │ • retryCount             │  │   │
│                                   │  └──────────────────────────┘  │   │
│                                   │                                │   │
│                                   │  ┌──────────────────────────┐  │   │
│                                   │  │ entities (cache local)   │  │   │
│                                   │  │ • clients, comptes       │  │   │
│                                   │  │ • crédits, échéanciers   │  │   │
│                                   │  │ • entity_version (ETag)  │  │   │
│                                   │  └──────────────────────────┘  │   │
│                                   │                                │   │
│                                   │  ┌──────────────────────────┐  │   │
│                                   │  │ sync_state               │  │   │
│                                   │  │ • cursor (watermark)     │  │   │
│                                   │  │ • last_pull_at           │  │   │
│                                   │  │ • checkpoints per entity │  │   │
│                                   │  └──────────────────────────┘  │   │
│                                   └────────────────────────────────┘   │
│                                            │                           │
│              ┌─────────────────────────────┤                           │
│              │    SERVICE WORKER            │                           │
│              │    (BackgroundSync API)      │                           │
│              │    • financial-sync (7 jours)│                           │
│              │    • general-sync (24h)      │                           │
│              └─────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (cookies HttpOnly)
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (Node/Express)                        │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐   │
│  │ /api/health  │  │ /api/sync    │  │ /api/* (routes métier)      │   │
│  │ (healthcheck)│  │  /pull       │  │                             │   │
│  │              │  │  /push       │  │  ┌───────────────────────┐  │   │
│  └──────────────┘  │  /ack        │  │  │ Middleware chain:     │  │   │
│                    └──────────────┘  │  │ 1. sessionGuard       │  │   │
│                                      │  │ 2. idempotency (DB)   │  │   │
│                                      │  │ 3. duplicateDetection │  │   │
│                                      │  │ 4. optimisticLock     │  │   │
│                                      │  │ 5. handler            │  │   │
│                                      │  │ 6. auditTrail         │  │   │
│                                      │  │ 7. outboxEvent        │  │   │
│                                      │  └───────────────────────┘  │   │
│                                      └─────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     PostgreSQL                                   │   │
│  │                                                                  │   │
│  │  Tables existantes                    Tables à ajouter           │   │
│  │  ─────────────────                    ──────────────────         │   │
│  │  mouvements_financiers               idempotency_keys (P0)      │   │
│  │  operations_caisse                   entity_versions (P1)       │   │
│  │  transactions_compte                 sync_cursors (P1)          │   │
│  │  evenements_outbox                   offline_operation_log (P1)  │   │
│  │  active_sessions                                                 │   │
│  │  ...                                                             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐                                    │
│  │ Outbox Worker│  │ WebSocket    │                                    │
│  │ (polling DB) │→→│ Server       │→→→ Push events aux clients         │
│  └──────────────┘  └──────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Composants clés et responsabilités

#### A. Unified Network Gateway (CONSOLIDATION — lacune #5)

**Problème** : 3 systèmes parallèles (`networkManager`, `connectivityService`, `ServerHealthContext`) avec des seuils et intervalles différents.

**Solution** : Fusionner en un seul pipeline.

```
navigator.onLine (OS)
    │
    ▼
networkManager (circuit breaker + latence)  ← GARDER comme source unique
    │
    ▼
ping /api/health (intégré dans networkManager)  ← ABSORBER connectivityService
    │
    ▼
NetworkContext (React wrapper)  ← GARDER
    │
    ▼
ServerHealthContext  ← SUPPRIMER (absorbé par networkManager)
```

Statut final exposé :

```typescript
type NetworkStatus = 'online' | 'unstable' | 'offline' | 'api_down';
// online     → fetch direct
// unstable   → fetch avec retry agressif, UI warning
// offline    → outbox queue, UI mode dégradé
// api_down   → outbox queue, UI "serveur indisponible"
```

#### B. Request Router (nouveau composant central)

Intercepte chaque requête et décide du chemin :

```
Request Router
    ├── GET (lecture) :
    │   ├── online → fetch + cache IndexedDB
    │   ├── offline → IndexedDB cache (stale-while-revalidate)
    │   └── cache miss → UI "données indisponibles offline"
    │
    ├── POST/PATCH/DELETE (écriture) :
    │   ├── online + circuit closed → fetch direct
    │   ├── online + circuit open → outbox queue
    │   ├── offline + opération `queue` → outbox queue + reçu provisoire
    │   └── offline + opération `block` → UI "connexion requise"
    │
    └── Sync endpoints (/sync/*) :
        ├── pull → delta sync (curseur)
        └── push → batch operations depuis outbox
```

#### C. Sync Engine (AMÉLIORATION — lacune #3 + #7)

Le `syncService.ts` existant gère le **push** (client → serveur). Il manque le **pull** (serveur → client).

```
SYNC ENGINE
│
├── PUSH (existant, à améliorer)
│   1. Lire outbox (pending, triés par priorité)
│   2. Batch de N opérations
│   3. POST /api/sync/push { operations: [...], idempotencyKeys: [...] }
│   4. Pour chaque réponse :
│   │   ├── 200 → marquer completed, notifier UI
│   │   ├── 409 CONFLICT → stocker conflit, notifier UI
│   │   ├── 409 DUPLICATE → marquer completed (déjà traité)
│   │   ├── 422 VALIDATION → marquer failed, notifier UI
│   │   └── 5xx/timeout → retry avec backoff
│   5. ACK au serveur : POST /api/sync/ack { processedIds: [...] }
│
├── PULL (nouveau)
│   1. GET /api/sync/pull?cursor={lastCursor}&entities=clients,comptes,credits
│   2. Réponse : { changes: [...], newCursor: "2026-02-09T...", hasMore: bool }
│   3. Pour chaque changement :
│   │   ├── entity_version > local → upsert IndexedDB
│   │   ├── entity_version == local → skip
│   │   └── entity modifiée localement (dirty) → conflit → merge ou UI
│   4. Stocker newCursor dans sync_state
│   5. Si hasMore → continuer (pagination)
│
└── DÉCLENCHEURS
    ├── Réseau revient (online event) → push puis pull
    ├── WebSocket "SYNC_AVAILABLE" → pull ciblé
    ├── Tab focus (visibility change) → pull si stale > 30s
    ├── Timer adaptatif (30s actif, 120s inactif)
    └── Manuel (bouton "rafraîchir")
```

---

## 3. Modèle de données offline + outbox

### 3.1 Schéma IndexedDB (Dexie) — existant + ajouts

L'existant dans `offline-db.ts` couvre déjà 16 tables. Ajouts nécessaires :

```typescript
// === AJOUTS AU SCHÉMA DEXIE ===

// Table: sync_state (nouvelle)
interface SyncState {
  id: string;           // "global" ou nom d'entité ("clients", "comptes")
  cursor: string;       // watermark ISO du serveur (ex: "2026-02-09T12:00:00Z")
  lastPullAt: number;   // timestamp du dernier pull réussi
  lastPushAt: number;   // timestamp du dernier push réussi
  entityCount: number;  // nombre d'entités en cache local
  checksum?: string;    // hash optionnel pour vérification d'intégrité
}

// Modification table: OfflineOperation (existant)
// Ajout du champ `entityVersion` pour optimistic locking
interface OfflineOperation {
  // ... champs existants ...
  entityVersion?: number;  // AJOUT: version de l'entité au moment de la création
  localValidation?: {      // AJOUT: résultat de la validation locale
    passed: boolean;
    checks: string[];      // ex: ["solde_suffisant", "plafond_respecte"]
  };
}

// Modification tables entités (clients, comptes, etc.)
// Ajout systématique de `serverVersion` + `etag`
interface OfflineEntity {
  // ... champs existants ...
  serverVersion: number;   // RENFORCER: toujours requis (pas optionnel)
  etag?: string;           // AJOUT: ETag HTTP pour conditional requests
  lastModifiedAt?: string; // AJOUT: Last-Modified header
}
```

### 3.2 Schéma PostgreSQL — tables à ajouter

```sql
-- ================================================================
-- P0: Table d'idempotence persistante (remplace le Map en mémoire)
-- ================================================================
CREATE TABLE idempotency_keys (
  key         TEXT PRIMARY KEY,
  resource    TEXT NOT NULL,           -- ex: "payment", "depot", "remboursement"
  status      TEXT NOT NULL DEFAULT 'processing', -- processing | completed | failed
  request_hash TEXT,                   -- hash du body pour détecter payload différent avec même clé
  response_code INTEGER,
  response_body JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  user_id     UUID REFERENCES users(id),
  agence_id   UUID REFERENCES agences(id)
);

-- Index pour cleanup et lookup
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX idx_idempotency_resource ON idempotency_keys(resource, created_at);

-- Cleanup automatique (cron pg_cron ou job Node)
-- DELETE FROM idempotency_keys WHERE expires_at < NOW();

-- ================================================================
-- P1: Versioning des entités pour détection de conflits
-- ================================================================
-- Approche : colonne `version` ajoutée aux tables existantes
-- Pas de table séparée — on ajoute directement aux entités :
--   ALTER TABLE clients ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
--   ALTER TABLE comptes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
--   ALTER TABLE credits ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
--   etc.
-- Le trigger ci-dessous incrémente automatiquement :

CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer sur chaque table :
-- CREATE TRIGGER trg_clients_version
--   BEFORE UPDATE ON clients
--   FOR EACH ROW EXECUTE FUNCTION increment_version();

-- ================================================================
-- P1: Curseurs de synchronisation par client/agence
-- ================================================================
CREATE TABLE sync_cursors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,           -- "clients", "comptes", "credits"
  cursor      TIMESTAMPTZ NOT NULL,    -- watermark
  agence_id   UUID REFERENCES agences(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entity_type)
);

-- ================================================================
-- P1: Journal des opérations offline synchronisées
-- ================================================================
CREATE TABLE offline_operation_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  client_uuid     TEXT NOT NULL,        -- UUID généré côté client
  operation_type  TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'received', -- received | processed | rejected | conflict
  created_at_client TIMESTAMPTZ NOT NULL, -- horodatage CLIENT (peut diverger)
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  error_message   TEXT,
  user_id         UUID REFERENCES users(id),
  agence_id       UUID REFERENCES agences(id),
  device_fingerprint TEXT,
  -- Résolution conflit
  conflict_type   TEXT,                 -- version_mismatch | duplicate | validation_failed
  resolution      TEXT                  -- accepted | rejected | merged
);

CREATE INDEX idx_offline_oplog_key ON offline_operation_log(idempotency_key);
CREATE INDEX idx_offline_oplog_user ON offline_operation_log(user_id, created_at_client);
```

### 3.3 Format des opérations outbox

```typescript
// Format d'une opération dans l'outbox IndexedDB
const exampleOperation: OfflineOperation = {
  uuid: "01JKQR5X8M-abcdef123456",     // ULID (triable par temps)
  type: "payment",                       // OperationType
  priority: "critical",                  // critical > high > medium > low
  endpoint: "/api/credits/abc-123/remboursement",
  method: "POST",
  payload: JSON.stringify({
    montant: 25000,
    modePaiement: "ESPECES",
    reference: "REMB-2026-001",
    dateOperation: "2026-02-09T14:30:00+01:00", // Horodatage LOCAL
  }),
  payloadHash: "sha256:a1b2c3...",       // Hash pour dédup
  status: "pending",
  retryCount: 0,
  maxRetries: 5,
  createdAt: Date.now(),
  idempotencyKey: "pay_01JKQR5X8M_abc123",  // Unique, préfixé par type
  userId: 42,
  agenceId: "agence-001",
  entityVersion: 7,                      // Version du crédit au moment de l'op
  localValidation: {
    passed: true,
    checks: ["solde_restant_suffisant", "echeance_due", "credit_actif"],
  },
};
```

### 3.4 Horodatage et identifiants

**Problème** : Clock skew entre client et serveur.

**Solution** :

```
1. UUID : ULID (Universally Unique Lexicographically Sortable Identifier)
   → Préfère ULID à UUID v4 car triable chronologiquement
   → Généré côté client pour les opérations offline

2. Timestamps :
   → Le CLIENT envoie son horodatage local (created_at_client)
   → Le SERVEUR enregistre son propre horodatage (received_at)
   → Le SERVEUR fait autorité pour l'ordonnancement
   → En cas de conflit d'ordre : server timestamp wins

3. Clock skew :
   → Au premier sync réussi : calculer delta = server_time - client_time
   → Stocker le delta dans sync_state
   → Appliquer en amont pour les opérations futures
   → Si |delta| > 5 minutes : avertir l'utilisateur
```

### 3.5 Chiffrement local (mobile/PWA)

```
STRATÉGIE :
┌─────────────────────────────────────────────────┐
│ Niveau 1 : PWA Web (navigateur)                 │
│ → IndexedDB est dans la sandbox du navigateur   │
│ → Pas de chiffrement applicatif (trop coûteux)  │
│ → Se reposer sur le chiffrement disque OS       │
│ → SAUF : données sensibles (PIN hash, tokens)   │
│   → Chiffrer avec SubtleCrypto (AES-GCM)       │
│   → Clé dérivée du mot de passe session         │
│                                                  │
│ Niveau 2 : Mobile natif (futur)                 │
│ → SQLCipher ou Realm encryption                  │
│ → Keychain/Keystore pour la clé master          │
│ → Chiffrement transparent                        │
└─────────────────────────────────────────────────┘
```

---

## 4. Gestion réseau & reconnexion automatique

### 4.1 Stratégie de détection (consolidée)

```
COUCHE 1 — OS (immédiat, grossier)
├── navigator.onLine (événements online/offline)
├── Fiabilité : ~80% — ne détecte pas "internet OK mais API down"
└── Rôle : fast path pour basculer circuit breaker

COUCHE 2 — Applicatif (précis, polled)
├── HEAD /api/health (léger, ~200 bytes)
├── Intervalle adaptatif :
│   ├── Online + actif : 30s
│   ├── Online + inactif : 60s
│   ├── Offline : 5s (probe rapide pour détecter retour)
│   └── API down : 10s (probe pour détecter retour API)
├── Timeout : 5s pour le health check
└── Rôle : distinguer offline vs api_down

COUCHE 3 — Implicite (chaque requête)
├── Succès fetch → networkManager.reportSuccess(latencyMs)
├── Échec fetch → networkManager.reportFailure(error)
├── Latence > 2s → status: unstable
└── Rôle : ajuster le status en temps réel entre les polls
```

**Consolidation concrète** : Supprimer `connectivityService.ts` et intégrer son ping dans `networkManager.ts`. Supprimer `ServerHealthContext.tsx` et faire consommer `NetworkContext` partout.

### 4.2 Stratégie de retry (existante, à documenter)

L'existant dans `main.tsx` (fetch override) est déjà solide :

```
RETRY POLICY (existant)
├── GET  : 3 tentatives, backoff [1s, 2s, 4s] + jitter 0-500ms
├── POST : 1 tentative seulement (sauf avec idempotency key → 3)
├── Pas de retry sur 4xx (erreur client)
├── Retry sur 5xx, timeout, network error
├── Circuit breaker : 5 failures → open (30s cooldown)
│   → Half-open : 1 probe request
│   → 3 succès → closed
└── AJOUT RECOMMANDÉ :
    └── Dead Letter Queue : après maxRetries, déplacer dans DLQ
        avec notification UI "opération échouée définitivement"
```

### 4.3 Stratégie de reprise

```
SCÉNARIO 1 — Réseau revient après offline court (<5 min)
├── Trigger : navigator.online + health check OK
├── Action :
│   1. Push outbox (opérations en attente) — priorité critique d'abord
│   2. Pull delta sync (curseur)
│   3. Invalider React Query cache stale
│   4. UI : banner "reconnecté, synchronisation en cours..."
│   5. UI : badge "X opérations synchronisées"
└── Temps attendu : <5s

SCÉNARIO 2 — Réseau revient après offline long (>5 min)
├── Trigger : navigator.online + health check OK
├── Action :
│   1. Push outbox (attention : opérations potentiellement obsolètes)
│   2. Pull FULL sync si curseur trop ancien
│   3. Résolution conflits (serveur gagne sauf merge explicite)
│   4. UI : overlay "synchronisation en cours, veuillez patienter"
│   5. UI : panel conflits si nécessaire
└── Temps attendu : <30s

SCÉNARIO 3 — Reprise après crash/fermeture app
├── Trigger : App boot (initialize)
├── Action :
│   1. Vérifier outbox : opérations pending non envoyées ?
│   2. Vérifier sync_state : dernier sync réussi quand ?
│   3. Si opérations pending → sync automatique au premier online
│   4. Si curseur > 24h → force full pull
└── Note : IndexedDB persiste au crash, pas de perte

SCÉNARIO 4 — Reprise après mise à jour app
├── Trigger : Service Worker update detected
├── Action :
│   1. Terminer sync en cours (ne pas interrompre)
│   2. Migrer IndexedDB si schéma Dexie modifié (.upgrade())
│   3. Re-pull full sync (le schéma des entités peut avoir changé)
│   4. UI : "Mise à jour installée, resynchronisation..."
└── Note : Dexie gère les migrations de schéma nativement
```

### 4.4 UX réseau

```
ÉTAT                 UI                                    FONCTIONNALITÉS
─────────────────────────────────────────────────────────────────────────
online               Rien (état normal)                    Toutes
unstable             Banner jaune "connexion instable"     Toutes (retry auto)
offline              Banner rouge "mode hors-ligne"        Lecture + queue ops
                     Badge "N opérations en attente"       Pas de block ops
                     Reçus "provisoires" marqués           Recherche locale
api_down             Overlay "serveur indisponible"        Lecture cache
                     Bouton retry                          Queue ops
                     Countdown prochain retry

OPÉRATIONS EN ATTENTE :
├── Badge sur le menu principal : "3 🔄"
├── Page dédiée /sync : liste des opérations en attente
│   ├── Status : en attente | en cours | échouée | conflit
│   ├── Action : annuler (si pas encore sync) | retry (si échouée)
│   └── Détail : payload, horodatage, tentatives
└── Notification toast quand sync réussit : "Remboursement #REF synchronisé ✓"

CONFLITS :
├── Notification badge rouge "1 conflit"
├── Panel de résolution :
│   ├── Affiche version locale vs serveur
│   ├── Bouton "Garder ma version" / "Garder version serveur" / "Fusionner"
│   └── Pour les montants : TOUJOURS serveur gagne (sécurité financière)
└── Auto-résolution silencieuse pour les champs non-critiques (nom, téléphone)
```

---

## 5. API Backend + garanties

### 5.1 Endpoints à ajouter

```
NOUVEAUX ENDPOINTS
──────────────────

GET  /api/health
     → Existant. Réponse : { status: "ok", timestamp: ISO, version: "x.y.z" }
     → Ajout recommandé : { ..., dbOk: bool, redisOk: bool }

GET  /api/sync/pull
     Query : ?cursor=ISO&entities=clients,comptes,credits&limit=100
     Auth : session cookie (credentials: include)
     Réponse : {
       changes: [
         { entity: "clients", id: "uuid", action: "upsert", data: {...}, version: 7, updatedAt: ISO },
         { entity: "comptes", id: "uuid", action: "delete", deletedAt: ISO },
         ...
       ],
       cursor: "2026-02-09T14:35:00Z",  // Nouveau watermark
       hasMore: false
     }
     Notes :
     - Filtré par agenceId de l'utilisateur (pas d'accès cross-agence)
     - Max 100 changements par page (pagination via hasMore + cursor)
     - Inclut les suppressions logiques (soft delete)

POST /api/sync/push
     Body : {
       operations: [
         {
           clientUuid: "ULID",
           idempotencyKey: "pay_01JK...",
           type: "remboursement_credit",
           endpoint: "/api/credits/abc/remboursement",
           method: "POST",
           payload: { montant: 25000, ... },
           createdAtClient: "2026-02-09T14:30:00+01:00",
           entityVersion: 7
         }
       ]
     }
     Réponse : {
       results: [
         { clientUuid: "ULID", status: "ok", serverResponse: {...} },
         { clientUuid: "ULID", status: "conflict", serverVersion: 8, serverData: {...} },
         { clientUuid: "ULID", status: "duplicate", originalResponse: {...} },
         { clientUuid: "ULID", status: "rejected", error: "Solde insuffisant" },
       ]
     }
     Notes :
     - Chaque opération est traitée dans sa propre transaction DB
     - L'idempotency key est vérifiée AVANT le traitement
     - Les opérations sont ordonnées par le serveur (pas par le client)

POST /api/sync/ack
     Body : { processedIds: ["ULID1", "ULID2"] }
     Réponse : { acknowledged: 2 }
     Notes : Permet au serveur de nettoyer les curseurs/logs
```

### 5.2 Invariants serveur

```
IDEMPOTENCE (P0 — remplacer le Map mémoire)
─────────────────────────────────────────────
Middleware flow :

1. Extraire idempotencyKey (header X-Idempotency-Key ou body.idempotencyKey)
2. Si pas de clé → passer au handler (pas d'idempotence)
3. SELECT FROM idempotency_keys WHERE key = $1
   ├── Trouvé + status = 'completed' + non expiré
   │   → Rejouer la réponse cachée (même statusCode + body)
   ├── Trouvé + status = 'processing'
   │   → 409 { error: "DUPLICATE_REQUEST", message: "Opération en cours" }
   ├── Trouvé + expiré
   │   → Supprimer, traiter comme nouveau
   └── Non trouvé
       → INSERT (key, status='processing', request_hash, user_id, agence_id)
       → Passer au handler
4. Après handler :
   → UPDATE idempotency_keys SET status='completed', response_code, response_body, completed_at
5. En cas d'erreur handler :
   → UPDATE idempotency_keys SET status='failed'
   → Le client peut retenter avec la même clé

TRANSACTIONS ACID
─────────────────
Toutes les opérations financières DOIVENT :
1. Utiliser db.transaction() (Drizzle)
2. Dans la transaction :
   a. Vérifier idempotency key
   b. Vérifier entity_version (optimistic lock)
   c. Effectuer l'opération métier
   d. Insérer l'événement outbox
   e. Mettre à jour les soldes
3. Si version mismatch → rollback + 409 CONFLICT

OPTIMISTIC LOCKING
──────────────────
Chaque UPDATE critique inclut :
  WHERE id = $1 AND version = $expectedVersion
Si 0 rows affected → 409 { error: "VERSION_CONFLICT", currentVersion: X }
Le client doit pull la version courante et réessayer ou présenter le conflit à l'utilisateur.

AUDIT TRAIL
───────────
Toute opération financière génère automatiquement :
1. Une entrée dans mouvements_financiers (existant)
2. Un événement dans evenements_outbox (existant)
3. Une entrée dans offline_operation_log si c'est une opération sync (nouveau)
4. Les champs created_by, created_at, ip_address, device_fingerprint
```

### 5.3 Résolution de conflits par entité

```
ENTITÉ         STRATÉGIE                     DÉTAILS
────────────────────────────────────────────────────────────────────
Client         Last-Write-Wins (LWW)         Champs non-financiers → merge auto
               + merge champs                Nom/téléphone : LWW
                                             Photo : client gagne (upload)

Compte solde   SERVER WINS (toujours)        Le solde est calculé par le serveur
                                             Jamais de merge sur les montants

Remboursement  Idempotency key               Si même clé → duplicate → OK
                                             Si version mismatch → reject
                                             Le client re-pull et retente

Dépôt épargne  Idempotency key               Même logique que remboursement

Session caisse SERVER WINS                   La session est l'état du serveur
                                             Pas de modification offline

Tontine        Idempotency key               Cotisations : idempotent
               + cycle version               Si cycle changé → reject
```

### 5.4 Sécurité offline

```
AUTH OFFLINE
────────────
1. Cookie de session : HttpOnly, Secure, SameSite=Lax, MaxAge=24h
2. Mode offline : le cookie reste valide localement
3. Au retour online : premier appel = /api/auth/me (revalidation session)
4. Si session expirée pendant offline :
   → Tenter refresh (POST /api/auth/refresh)
   → Si échec → forcer re-login (mais conserver outbox!)
   → Les opérations en outbox seront sync après re-login

PERMISSIONS OFFLINE
───────────────────
1. Les permissions sont chargées dans authService.permissionsMap (mémoire)
2. Elles restent valides offline (snapshot)
3. Au retour online : re-pull permissions (/api/my-permissions)
4. Si les permissions ont changé → UI s'adapte
5. Le SERVEUR re-vérifie les permissions au moment du sync push
   → Une opération enregistrée offline peut être rejetée si les permissions
     ont été révoquées entre-temps

ANTI-FRAUDE
───────────
1. Plafond offline par agent : max X FCFA d'opérations cumulées sans sync
2. Plafond par opération : configurable par type
3. Device fingerprint associé à chaque opération offline
4. Horodatage client vs serveur : delta > 5min = flag audit
5. Nombre max d'opérations offline : configurable (ex: 50)
```

---

## 6. Implémentation concrète

### 6.1 Middleware idempotency persistant (Backend — P0)

Remplace le middleware en mémoire existant (`server/middleware/idempotency.ts`).

```typescript
// server/middleware/idempotency-db.ts
import { db } from "../db";
import { idempotencyKeys } from "@shared/schema"; // table à ajouter au schéma
import { eq, and, gt } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";
import crypto from "crypto";

const logger = createLogger("Idempotency");

export function idempotencyMiddleware(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey =
      req.body?.idempotencyKey ||
      req.headers["x-idempotency-key"] as string;

    if (!idempotencyKey) {
      return next();
    }

    const fullKey = `${resourceType}:${idempotencyKey}`;
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex");
    const userId = (req.session as any)?.user?.id;

    try {
      // 1. Chercher une clé existante non expirée
      const existing = await db
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, fullKey),
            gt(idempotencyKeys.expiresAt, new Date())
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const entry = existing[0];

        // Clé en cours de traitement → concurrent duplicate
        if (entry.status === "processing") {
          return res.status(409).json({
            error: "DUPLICATE_REQUEST",
            message: "Cette opération est déjà en cours de traitement",
          });
        }

        // Clé déjà complétée → rejouer la réponse
        if (entry.status === "completed" && entry.responseBody) {
          logger.info({ key: fullKey }, "Replaying cached response");
          return res
            .status(entry.responseCode || 200)
            .json(entry.responseBody);
        }

        // Clé en échec → permettre un retry
        // Supprimer l'ancienne entrée et continuer
        await db
          .delete(idempotencyKeys)
          .where(eq(idempotencyKeys.key, fullKey));
      }

      // 2. Insérer la nouvelle clé
      await db.insert(idempotencyKeys).values({
        key: fullKey,
        resource: resourceType,
        status: "processing",
        requestHash,
        userId,
        agenceId: (req.session as any)?.user?.agenceId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      });

      // 3. Intercepter res.json pour cacher la réponse
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        // Cacher les réponses réussies
        if (res.statusCode >= 200 && res.statusCode < 300) {
          db.update(idempotencyKeys)
            .set({
              status: "completed",
              responseCode: res.statusCode,
              responseBody: body,
              completedAt: new Date(),
            })
            .where(eq(idempotencyKeys.key, fullKey))
            .catch((err) =>
              logger.error({ key: fullKey, err }, "Failed to cache response")
            );
        } else {
          // Échec → marquer comme failed
          db.update(idempotencyKeys)
            .set({ status: "failed" })
            .where(eq(idempotencyKeys.key, fullKey))
            .catch((err) =>
              logger.error({ key: fullKey, err }, "Failed to mark as failed")
            );
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error({ key: fullKey, error }, "Idempotency check failed");
      // En cas d'erreur d'infra → laisser passer (fail-open pour ne pas bloquer)
      next();
    }
  };
}
```

### 6.2 Endpoint /api/sync/push (Backend)

```typescript
// server/routes/sync.ts
import { Router } from "express";
import { db } from "../db";
import { idempotencyKeys, offlineOperationLog } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { sessionGuard } from "../middleware/session-guard";

const logger = createLogger("Sync");
const router = Router();

interface SyncPushOperation {
  clientUuid: string;
  idempotencyKey: string;
  type: string;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  payload: Record<string, unknown>;
  createdAtClient: string;
  entityVersion?: number;
}

router.post("/push", sessionGuard, async (req, res) => {
  const user = (req.session as any).user;
  const { operations } = req.body as { operations: SyncPushOperation[] };

  if (!operations?.length) {
    return res.status(400).json({ error: "No operations provided" });
  }

  if (operations.length > 50) {
    return res.status(400).json({ error: "Max 50 operations per batch" });
  }

  const results: Array<{
    clientUuid: string;
    status: "ok" | "duplicate" | "conflict" | "rejected" | "error";
    serverResponse?: any;
    error?: string;
    serverVersion?: number;
  }> = [];

  for (const op of operations) {
    try {
      // 1. Log l'opération reçue
      await db.insert(offlineOperationLog).values({
        idempotencyKey: op.idempotencyKey,
        clientUuid: op.clientUuid,
        operationType: op.type,
        payload: op.payload,
        createdAtClient: new Date(op.createdAtClient),
        userId: user.id,
        agenceId: user.agenceId,
        deviceFingerprint: req.headers["x-device-fingerprint"] as string,
      });

      // 2. Vérifier idempotency
      const existingKey = await db
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, `sync:${op.idempotencyKey}`),
            gt(idempotencyKeys.expiresAt, new Date())
          )
        )
        .limit(1);

      if (existingKey.length > 0 && existingKey[0].status === "completed") {
        results.push({
          clientUuid: op.clientUuid,
          status: "duplicate",
          serverResponse: existingKey[0].responseBody,
        });
        continue;
      }

      // 3. Router vers le handler approprié (simule un appel interne)
      // On utilise une approche "internal dispatch" plutôt que HTTP
      const response = await dispatchOperation(op, user, req);

      results.push({
        clientUuid: op.clientUuid,
        status: response.status,
        serverResponse: response.data,
        serverVersion: response.newVersion,
      });
    } catch (error: any) {
      logger.error(
        { clientUuid: op.clientUuid, error: error.message },
        "Sync push operation failed"
      );
      results.push({
        clientUuid: op.clientUuid,
        status: "error",
        error: error.message,
      });
    }
  }

  res.json({ results });
});

// Internal operation dispatcher (routes vers les services existants)
async function dispatchOperation(
  op: SyncPushOperation,
  user: any,
  req: any
): Promise<{ status: "ok" | "conflict" | "rejected"; data?: any; newVersion?: number }> {
  // Map l'opération sync vers les services existants
  // Cela évite de dupliquer la logique métier
  // Pattern : le sync endpoint est un "proxy interne"

  switch (op.type) {
    case "remboursement_credit": {
      // Appeler le service de remboursement existant
      // avec les mêmes validations
      // Pseudocode :
      // const result = await creditService.processRemboursement(op.payload, user);
      // return { status: "ok", data: result };
      return { status: "ok", data: { message: "Processed" } };
    }
    case "depot_epargne": {
      return { status: "ok", data: { message: "Processed" } };
    }
    case "cotisation_tontine": {
      return { status: "ok", data: { message: "Processed" } };
    }
    default:
      return { status: "rejected", data: { error: `Unknown operation type: ${op.type}` } };
  }
}

export default router;
```

### 6.3 Endpoint /api/sync/pull (Backend)

```typescript
// server/routes/sync.ts (suite)

router.get("/pull", sessionGuard, async (req, res) => {
  const user = (req.session as any).user;
  const cursor = req.query.cursor as string; // ISO timestamp
  const entities = ((req.query.entities as string) || "")
    .split(",")
    .filter(Boolean);
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  if (!entities.length) {
    return res.status(400).json({ error: "entities parameter required" });
  }

  const cursorDate = cursor ? new Date(cursor) : new Date(0);
  const changes: Array<{
    entity: string;
    id: string;
    action: "upsert" | "delete";
    data: any;
    version: number;
    updatedAt: string;
  }> = [];

  for (const entity of entities) {
    // Requête générique : SELECT * FROM {entity}
    // WHERE updated_at > cursor AND agence_id = user.agenceId
    // ORDER BY updated_at ASC LIMIT {limit}
    //
    // Implémentation concrète par entité dans un service dédié
    const entityChanges = await getEntityChanges(
      entity,
      cursorDate,
      user.agenceId,
      limit - changes.length
    );
    changes.push(...entityChanges);

    if (changes.length >= limit) break;
  }

  // Le nouveau curseur est le max(updated_at) des changements retournés
  const newCursor =
    changes.length > 0
      ? changes[changes.length - 1].updatedAt
      : cursor || new Date().toISOString();

  res.json({
    changes,
    cursor: newCursor,
    hasMore: changes.length >= limit,
  });
});

async function getEntityChanges(
  entity: string,
  since: Date,
  agenceId: string,
  limit: number
) {
  // Dispatcher par type d'entité
  // Chaque table a un champ `updated_at` et `version`
  // Exemple pour clients :
  //
  // SELECT id, data, version, updated_at, is_deleted
  // FROM clients
  // WHERE updated_at > $since AND agence_id = $agenceId
  // ORDER BY updated_at ASC
  // LIMIT $limit

  // Retourne le format standardisé
  return []; // Implémenté par entité
}
```

### 6.4 Sync Engine frontend (amélioré)

```typescript
// client/src/lib/syncEngine.ts — NOUVELLE couche au-dessus de syncService.ts

import { offlineDb, getPendingOperations, updateOperationStatus } from "./offline-db";
import { networkManager } from "./networkManager";

const SYNC_CONFIG = {
  PUSH_BATCH_SIZE: 10,
  PULL_PAGE_SIZE: 100,
  PULL_ENTITIES: ["clients", "comptes", "credits", "echeanciers", "tontines"],
  MIN_SYNC_INTERVAL_MS: 5_000, // Min 5s entre syncs
  OFFLINE_MAX_OPS: 50,         // Max 50 opérations offline
  OFFLINE_MAX_AMOUNT_FCFA: 5_000_000, // Plafond cumulé
};

class SyncEngine {
  private isSyncing = false;
  private lastSyncAt = 0;

  /**
   * Sync complète : push puis pull
   * Appelé quand le réseau revient, sur timer, ou manuellement
   */
  async fullSync(): Promise<{ pushed: number; pulled: number; conflicts: number }> {
    if (this.isSyncing) return { pushed: 0, pulled: 0, conflicts: 0 };
    if (Date.now() - this.lastSyncAt < SYNC_CONFIG.MIN_SYNC_INTERVAL_MS) {
      return { pushed: 0, pulled: 0, conflicts: 0 };
    }

    if (!networkManager.canMakeRequest()) {
      return { pushed: 0, pulled: 0, conflicts: 0 };
    }

    this.isSyncing = true;
    let pushed = 0, pulled = 0, conflicts = 0;

    try {
      // 1. PUSH d'abord (envoyer les opérations locales)
      pushed = await this.pushOperations();

      // 2. PULL ensuite (récupérer les changements serveur)
      const pullResult = await this.pullChanges();
      pulled = pullResult.pulled;
      conflicts = pullResult.conflicts;

      this.lastSyncAt = Date.now();
    } catch (error) {
      console.error("[SyncEngine] Sync failed:", error);
    } finally {
      this.isSyncing = false;
    }

    return { pushed, pulled, conflicts };
  }

  /**
   * Push les opérations offline vers le serveur
   */
  private async pushOperations(): Promise<number> {
    const pending = await getPendingOperations(SYNC_CONFIG.PUSH_BATCH_SIZE);
    if (pending.length === 0) return 0;

    // Marquer comme "syncing"
    for (const op of pending) {
      await updateOperationStatus(op.uuid, "syncing");
    }

    try {
      const response = await fetch("/api/sync/push", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: pending.map((op) => ({
            clientUuid: op.uuid,
            idempotencyKey: op.idempotencyKey,
            type: op.type,
            endpoint: op.endpoint,
            method: op.method,
            payload: JSON.parse(op.payload),
            createdAtClient: new Date(op.createdAt).toISOString(),
            entityVersion: (op as any).entityVersion,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Push failed: ${response.status}`);
      }

      const { results } = await response.json();
      let synced = 0;

      for (const result of results) {
        const op = pending.find((p) => p.uuid === result.clientUuid);
        if (!op) continue;

        switch (result.status) {
          case "ok":
          case "duplicate":
            await updateOperationStatus(op.uuid, "completed");
            synced++;
            break;
          case "conflict":
            await updateOperationStatus(op.uuid, "conflict");
            // Stocker les détails du conflit
            await offlineDb.conflicts.add({
              uuid: crypto.randomUUID(),
              operationUuid: op.uuid,
              entityType: op.type,
              entityId: result.clientUuid,
              localData: op.payload,
              serverData: JSON.stringify(result.serverResponse),
              serverVersion: result.serverVersion,
              status: "unresolved",
              detectedAt: Date.now(),
            });
            break;
          case "rejected":
            await updateOperationStatus(
              op.uuid,
              "failed",
              result.error || "Rejected by server"
            );
            break;
          case "error":
            // Remettre en pending pour retry
            await updateOperationStatus(op.uuid, "pending");
            break;
        }
      }

      return synced;
    } catch (error) {
      // Erreur réseau → remettre tout en pending
      for (const op of pending) {
        await updateOperationStatus(op.uuid, "pending");
      }
      throw error;
    }
  }

  /**
   * Pull les changements du serveur (delta sync)
   */
  private async pullChanges(): Promise<{ pulled: number; conflicts: number }> {
    let totalPulled = 0;
    let totalConflicts = 0;
    let hasMore = true;

    // Récupérer le curseur actuel
    const syncState = await offlineDb.syncState
      .where("id")
      .equals("global")
      .first();
    let cursor = syncState?.cursor || "";

    while (hasMore) {
      const params = new URLSearchParams({
        cursor,
        entities: SYNC_CONFIG.PULL_ENTITIES.join(","),
        limit: String(SYNC_CONFIG.PULL_PAGE_SIZE),
      });

      const response = await fetch(`/api/sync/pull?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status}`);
      }

      const data = await response.json();

      for (const change of data.changes) {
        const result = await this.applyChange(change);
        if (result === "conflict") totalConflicts++;
        totalPulled++;
      }

      cursor = data.cursor;
      hasMore = data.hasMore;
    }

    // Sauvegarder le nouveau curseur
    await offlineDb.syncState.put({
      id: "global",
      cursor,
      lastPullAt: Date.now(),
      lastPushAt: syncState?.lastPushAt || 0,
      entityCount: totalPulled,
    });

    return { pulled: totalPulled, conflicts: totalConflicts };
  }

  /**
   * Applique un changement serveur dans IndexedDB
   */
  private async applyChange(change: {
    entity: string;
    id: string;
    action: "upsert" | "delete";
    data: any;
    version: number;
  }): Promise<"applied" | "conflict" | "skipped"> {
    const table = this.getEntityTable(change.entity);
    if (!table) return "skipped";

    const local = await table.where("serverId").equals(change.id).first();

    if (change.action === "delete") {
      if (local) await table.delete(local.id);
      return "applied";
    }

    // Upsert
    if (!local) {
      // Nouvelle entité
      await table.add({
        uuid: crypto.randomUUID(),
        serverId: change.id,
        data: JSON.stringify(change.data),
        serverVersion: change.version,
        localVersion: change.version,
        lastSyncedAt: Date.now(),
        isDirty: false,
      });
      return "applied";
    }

    // Entité existante
    if (local.isDirty) {
      // Modifiée localement → CONFLIT
      return "conflict";
    }

    // Pas modifiée localement → mettre à jour
    if (change.version > (local.serverVersion || 0)) {
      await table.update(local.id!, {
        data: JSON.stringify(change.data),
        serverVersion: change.version,
        localVersion: change.version,
        lastSyncedAt: Date.now(),
      });
      return "applied";
    }

    return "skipped"; // Version identique ou inférieure
  }

  private getEntityTable(entity: string) {
    const tables: Record<string, any> = {
      clients: offlineDb.clients,
      comptes: offlineDb.epargneAccounts,
      credits: offlineDb.credits,
      // Ajouter les autres tables...
    };
    return tables[entity] || null;
  }

  /**
   * Validation locale avant d'enregistrer une opération offline
   */
  async validateOfflineOperation(op: {
    type: string;
    payload: any;
  }): Promise<{ valid: boolean; checks: string[]; errors: string[] }> {
    const checks: string[] = [];
    const errors: string[] = [];

    // Vérifier le plafond d'opérations offline
    const pending = await getPendingOperations(999);
    if (pending.length >= SYNC_CONFIG.OFFLINE_MAX_OPS) {
      errors.push("Nombre maximum d'opérations offline atteint");
    }
    checks.push("plafond_operations");

    // Vérifier le plafond montant cumulé
    const totalAmount = pending.reduce((sum, p) => {
      const payload = JSON.parse(p.payload);
      return sum + (Number(payload.montant) || 0);
    }, 0);
    if (totalAmount + (Number(op.payload.montant) || 0) > SYNC_CONFIG.OFFLINE_MAX_AMOUNT_FCFA) {
      errors.push("Plafond cumulé offline dépassé");
    }
    checks.push("plafond_montant");

    // Validation spécifique par type
    if (op.type === "remboursement_credit") {
      // Vérifier que le crédit existe en cache local
      // Vérifier que le montant <= solde restant (snapshot)
      checks.push("credit_existe", "montant_valide");
    }

    return {
      valid: errors.length === 0,
      checks,
      errors,
    };
  }
}

export const syncEngine = new SyncEngine();
```

### 6.5 Exemple complet : Remboursement crédit offline → sync

```typescript
// Flux complet depuis l'UI jusqu'à la synchronisation

// === ÉTAPE 1 : L'agent terrain clique "Enregistrer remboursement" (OFFLINE) ===

async function handleRemboursementOffline(creditId: string, montant: number) {
  const { networkStatus } = useNetwork(); // hook existant

  // Générer l'identifiant unique et la clé d'idempotence
  const operationUuid = generateULID();
  const idempotencyKey = `remb_${operationUuid}`;

  // Préparer le payload
  const payload = {
    montant,
    modePaiement: "ESPECES",
    reference: `REMB-OFF-${operationUuid.slice(-8)}`,
    dateOperation: new Date().toISOString(),
    creditId,
    idempotencyKey,
  };

  if (networkStatus === "online") {
    // Mode online : appel direct classique
    return await api.post(`/credits/${creditId}/remboursement`, payload);
  }

  // Mode offline : validation locale + outbox
  const validation = await syncEngine.validateOfflineOperation({
    type: "remboursement_credit",
    payload,
  });

  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // Récupérer la version actuelle du crédit depuis IndexedDB
  const localCredit = await offlineDb.credits
    .where("serverId")
    .equals(creditId)
    .first();

  // Enregistrer dans l'outbox IndexedDB
  await offlineDb.operations.add({
    uuid: operationUuid,
    type: "payment",
    priority: "critical",
    endpoint: `/api/credits/${creditId}/remboursement`,
    method: "POST",
    payload: JSON.stringify(payload),
    payloadHash: await hashPayload(payload),
    status: "pending",
    retryCount: 0,
    maxRetries: 5,
    createdAt: Date.now(),
    idempotencyKey,
    userId: authService.getCurrentUser()?.id,
    agenceId: authService.getAgence(),
    entityVersion: localCredit?.serverVersion || 0,
    localValidation: {
      passed: true,
      checks: validation.checks,
    },
  });

  // Mettre à jour le solde local (optimiste)
  if (localCredit) {
    const creditData = JSON.parse(localCredit.data);
    creditData.soldeRestant = String(
      Number(creditData.soldeRestant) - montant
    );
    await offlineDb.credits.update(localCredit.id!, {
      data: JSON.stringify(creditData),
      isDirty: true,
    });
  }

  // Retourner un reçu provisoire
  return {
    id: operationUuid,
    status: "EN_ATTENTE_SYNC",
    reference: payload.reference,
    montant,
    dateOperation: payload.dateOperation,
    provisoire: true,
    message: "Remboursement enregistré. Sera synchronisé dès retour réseau.",
  };
}

// === ÉTAPE 2 : Le réseau revient → Sync automatique ===

// Le SyncEngine est écouté par NetworkContext :
// networkManager.onStatusChange((newStatus) => {
//   if (newStatus === 'online') {
//     syncEngine.fullSync();
//   }
// });

// Le push envoie l'opération via POST /api/sync/push

// === ÉTAPE 3 : Le serveur traite l'opération ===

// Le serveur :
// 1. Vérifie l'idempotency key → pas de doublon
// 2. Vérifie entity_version → pas de conflit
// 3. Exécute le remboursement dans une transaction
// 4. Enregistre l'événement outbox
// 5. Retourne { status: "ok" }

// === ÉTAPE 4 : L'UI se met à jour ===

// Le SyncEngine reçoit le résultat :
// 1. Marque l'opération comme "completed" dans IndexedDB
// 2. Toast : "Remboursement #REF synchronisé ✓"
// 3. Le pull ramène le crédit mis à jour (version +1)
// 4. IndexedDB est mis à jour avec la version serveur
// 5. React Query invalide le cache → UI refresh
```

---

## 7. Plan de tests & validation

### 7.1 Tests unitaires

```
Fichier : tests/unit/sync-engine.test.ts

OUTBOX QUEUE
├── "should add operation to outbox with correct fields"
├── "should reject when offline max operations exceeded"
├── "should reject when offline cumulative amount exceeded"
├── "should generate unique idempotency keys"
├── "should hash payload for dedup"
└── "should order by priority (critical > high > medium > low)"

RETRY LOGIC
├── "should retry failed operations up to maxRetries"
├── "should apply exponential backoff between retries"
├── "should move to DLQ after maxRetries exceeded"
├── "should NOT retry on 4xx (except 409 concurrent)"
└── "should reset retryCount on success"

CONFLICT DETECTION
├── "should detect version mismatch on pull"
├── "should flag dirty entities as conflicts"
├── "should auto-resolve non-financial fields (LWW)"
├── "should require manual resolution for financial data"
└── "should store both local and server versions"

IDEMPOTENCE (backend)
├── "should cache and replay completed response"
├── "should reject concurrent duplicate (409)"
├── "should allow retry after failure"
├── "should expire keys after TTL"
└── "should persist across server restarts"
```

### 7.2 Tests d'intégration

```
Fichier : tests/integration/offline-sync.test.ts

OFFLINE → SYNC
├── "should queue remboursement offline then sync when online"
├── "should handle 30 minutes of offline operations correctly"
├── "should not create duplicate transactions on sync"
├── "should preserve operation order by createdAt"
└── "should handle partial sync failure (some ok, some rejected)"

PULL SYNC
├── "should pull delta changes since last cursor"
├── "should handle pagination (hasMore)"
├── "should update local entities on pull"
├── "should detect conflicts on dirty entities"
└── "should advance cursor only after successful processing"

RECONNECTION
├── "should auto-sync on network recovery"
├── "should handle rapid online/offline toggles"
├── "should resume sync after app crash/restart"
└── "should re-auth if session expired during offline"
```

### 7.3 Tests E2E

```
Fichier : tests/e2e/offline-sync.spec.ts (Playwright)

SCÉNARIO 1 — Remboursement offline
├── Login
├── Naviguer vers crédit actif
├── Couper le réseau (page.route('**/*', route => route.abort()))
├── Enregistrer un remboursement
├── Vérifier : badge "en attente de sync" visible
├── Vérifier : reçu provisoire affiché
├── Rétablir le réseau
├── Vérifier : toast "synchronisé ✓"
├── Vérifier : reçu définitif affiché
└── Vérifier : pas de doublon en base

SCÉNARIO 2 — Perte réseau pendant opération
├── Login
├── Simuler latence 5s (page.route slow)
├── Lancer un remboursement
├── Couper le réseau PENDANT la requête
├── Vérifier : pas de crash, pas de login
├── Vérifier : opération dans l'outbox
├── Rétablir le réseau
├── Vérifier : sync automatique, pas de doublon

SCÉNARIO 3 — Conflit de version
├── Login agent A + agent B (2 tabs)
├── Agent A : modifier fiche client
├── Agent B : modifier même fiche client (différents champs)
├── Vérifier : pas de perte de données
├── Si conflit → panel de résolution affiché
```

### 7.4 Chaos testing

```
OUTILS
├── Playwright : page.route() pour intercepter/bloquer/ralentir
├── tc (Linux) / Network Link Conditioner (macOS) pour throttle réel
├── toxiproxy pour simuler latence/perte côté backend
└── Script custom : toggle réseau aléatoirement pendant 10min

SCÉNARIOS CHAOS
├── Perte réseau 50% des paquets pendant 5min
├── Latence 3-10s aléatoire sur chaque requête
├── API timeout sur /sync/push (mais push reçu côté serveur)
├── Redémarrage backend pendant un sync en cours
├── IndexedDB plein (quota exceeded)
├── Service Worker crash / update pendant offline
└── Clock skew : avancer l'horloge client de 10min
```

### 7.5 KPIs de validation

```
MÉTRIQUE                    SEUIL ACCEPTABLE         OUTIL DE MESURE
────────────────────────────────────────────────────────────────────
Duplication transactions    = 0 (zéro tolérance)     COUNT(dup) en SQL
Taux réussite sync          > 99.5%                  offline_operation_log
Temps moyen resync          < 10s (50 ops)           Métrique client
Conflits auto-résolus       > 90%                    Compteur conflits
Conflits manuels            < 10%                    UI panel conflits
Opérations perdues          = 0                      outbox vs server count
Cohérence soldes            100%                     balance-consistency.test.ts
Temps détection offline     < 2s                     networkManager transition
Temps détection online      < 5s                     health check probe
```

---

## 8. Guide d'intégration progressive

### Phase 0 — Consolidation (1-2 semaines)

**Objectif** : Supprimer les doublons, stabiliser la base.

```
ACTIONS :
1. Consolider les systèmes de connectivité :
   ├── Absorber connectivityService.ts dans networkManager.ts
   ├── Supprimer ServerHealthContext.tsx (utiliser NetworkContext partout)
   └── Un seul pipeline : networkManager → NetworkContext → composants

2. Consolider les files offline :
   ├── Supprimer useOfflineQueue.ts (localStorage)
   ├── Tout passe par offline-db.ts (IndexedDB/Dexie)
   └── syncService.ts est le seul gestionnaire de queue

3. Migrer idempotency middleware :
   ├── Créer table idempotency_keys en DB (dans ensureCustomFunctions)
   ├── Remplacer le Map mémoire par le middleware DB
   └── Tester : restart serveur + replay requête → pas de doublon

4. Feature flag :
   └── OFFLINE_QUEUE_ENABLED = false (par défaut, ne rien changer pour l'utilisateur)
```

### Phase 1 — Module Agent Terrain (2-3 semaines)

**Objectif** : Permettre aux agents terrain de travailler offline.

```
ACTIONS :
1. Reclasser 3 opérations de "block" à "queue" dans criticalOperations.ts :
   ├── depot_epargne
   ├── remboursement_credit
   └── cotisation_tontine

2. Implémenter SyncEngine.pushOperations() complet

3. Implémenter SyncEngine.pullChanges() pour :
   ├── clients (portefeuille agent)
   ├── comptes (soldes snapshot)
   └── credits + échéanciers

4. Ajouter versioning (colonne `version`) aux tables :
   ├── clients
   ├── comptes
   └── credits

5. UI Agent Terrain :
   ├── Badge opérations en attente
   ├── Page /sync avec liste des opérations
   ├── Reçus provisoires avec mention "en attente"
   └── Toast de confirmation après sync

6. Feature flag : OFFLINE_QUEUE_ENABLED = true (agents terrain uniquement)
```

### Phase 2 — Module Caisse (2-3 semaines)

**Objectif** : Caissiers résilients aux coupures courtes.

```
ACTIONS :
1. Encaissements en mode queue (hors session ouverte/fermée)
2. Cache local de la session active
3. Plafond offline par session : configurable
4. Réconciliation automatique au sync
5. Feature flag : OFFLINE_CAISSE_ENABLED = true
```

### Phase 3 — Sync Pull complet + Conflits (2-3 semaines)

**Objectif** : Données toujours à jour, conflits gérés proprement.

```
ACTIONS :
1. Endpoints /api/sync/pull + /api/sync/ack
2. Delta sync pour toutes les entités
3. Panel de résolution de conflits (existant : ConflictResolutionPanel.tsx)
4. Règles de merge automatique par entité
5. Audit dashboard : opérations offline, conflits, délais sync
```

### Phase 4 — Hardening + Monitoring (1-2 semaines)

```
ACTIONS :
1. Dead Letter Queue pour opérations définitivement échouées
2. Alerting : si une opération est pending > 1h → alerte admin
3. Dashboard monitoring :
   ├── Nombre d'opérations offline en cours (par agent, agence)
   ├── Temps moyen de sync
   ├── Taux de conflits
   └── Opérations en DLQ
4. Chaos tests automatisés en CI
5. Chiffrement IndexedDB pour données sensibles
```

### Stratégie Feature Flags

```typescript
// shared/config/feature-flags.ts

export const FEATURE_FLAGS = {
  // Phase 0
  UNIFIED_NETWORK_MONITOR: true,       // Consolidation réseau
  DB_IDEMPOTENCY: true,                // Idempotency persistante

  // Phase 1
  OFFLINE_QUEUE_AGENT_TERRAIN: false,   // Queue offline agent terrain
  ENTITY_VERSIONING: false,             // Colonne version sur entités

  // Phase 2
  OFFLINE_QUEUE_CAISSE: false,          // Queue offline caisse
  OFFLINE_CAISSE_PLAFOND_FCFA: 500_000, // Plafond par session

  // Phase 3
  SYNC_PULL_ENABLED: false,            // Delta sync serveur → client
  CONFLICT_RESOLUTION_UI: false,       // Panel de résolution

  // Phase 4
  DEAD_LETTER_QUEUE: false,            // DLQ pour ops échouées
  OFFLINE_MONITORING: false,           // Dashboard monitoring
};
```

### Monitoring en production

```
MÉTRIQUES À COLLECTER :

Frontend (envoyées via POST /api/telemetry ou WebSocket) :
├── offline_duration_seconds        Durée de chaque épisode offline
├── outbox_queue_depth              Nombre d'opérations en attente
├── sync_push_duration_ms           Temps de push
├── sync_pull_duration_ms           Temps de pull
├── sync_conflicts_total            Nombre de conflits détectés
├── sync_failures_total             Nombre d'échecs sync
└── indexeddb_usage_bytes           Taille de l'IndexedDB

Backend :
├── sync_push_requests_total        Nombre de push reçus
├── sync_push_operations_total      Nombre d'opérations dans les push
├── idempotency_replay_total        Nombre de réponses rejouées
├── idempotency_conflict_total      Nombre de doublons détectés
├── offline_operation_log_total     Opérations offline traitées
└── version_conflict_total          Conflits de version détectés
```
