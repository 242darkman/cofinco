# Audit Production-Readiness: Virements Programmes

**Date:** 2026-01-25
**Auditeur:** Claude Code
**Version:** 1.0
**Statut:** CRITIQUE - Corrections requises avant production

---

## Executive Summary

L'audit de la feature "Virements Programmes" a identifie **5 failles critiques** qui empechent le deploiement en production. Le risque principal est le **double debit** en cas de multi-instances ou crash. L'implementation actuelle est fonctionnelle pour un prototype mais necessite des corrections majeures pour atteindre la fiabilite bancaire.

### Verdict Global

| Critere | Statut | Risque |
|---------|--------|--------|
| Idempotence | ECHEC | CRITIQUE |
| Atomicite transaction | PARTIEL | CRITIQUE |
| Multi-instances | ECHEC | CRITIQUE |
| Securite RBAC | PARTIEL | MOYEN |
| Observabilite | PARTIEL | MOYEN |
| UX Temps reel | PARTIEL | FAIBLE |

---

## 1. Inventaire du Code Existant

### 1.1 Schema DB (Drizzle/PostgreSQL)

**Fichier:** `shared/schema/finance.ts:603-664`

```typescript
// Table principale
virementsProgrammes = {
  id: uuid PK,
  compteSourceId: uuid FK -> comptes,
  compteDestId: uuid FK -> comptes,
  montant: numeric,
  frequence: enum(ONCE, DAILY, WEEKLY, MONTHLY),
  prochaineExecution: timestamp,
  actif: boolean,
  dernierExecution: timestamp,
  statutDernier: enum(SUCCESS, FAILED),
  erreurDerniere: text,
  createdBy: uuid FK -> users,
  createdAt, updatedAt: timestamp
}

// Table audit
virementsProgrammesAuditLogs = {
  id: uuid PK,
  virementId: uuid FK -> virementsProgrammes,
  statut: enum(SUCCESS, FAILED),
  message: text,
  executedAt: timestamp,
  executionTimeMs: integer,
  metadata: jsonb,
  mouvementId: uuid FK -> mouvementsFinanciers
}
```

**Index existants:**
- `idx_virements_prog_execution` ON (actif, prochaineExecution) - BON
- `idx_virements_prog_source` ON (compteSourceId, createdAt)
- `idx_virements_prog_dest` ON (compteDestId, createdAt)

### 1.2 Service Backend

**Fichier:** `server/services/compte-transfers.ts`

| Fonction | Description | Statut |
|----------|-------------|--------|
| `executeCompteTransfer()` | Execute un virement immediat | PARTIEL |
| `createVirementProgramme()` | Cree un virement programme | OK |
| `getVirementsProgrammesDue()` | Liste les virements a executer | OK |
| `runVirementsProgrammes()` | Batch execution | CRITIQUE |
| `computeNextExecution()` | Calcule prochaine date | PARTIEL |

### 1.3 Cron Job

**Fichier:** `server/cron/scheduled-account-transfers.ts`

- Schedule: `30 2 * * *` (02h30 quotidien)
- Framework: `node-cron`
- Logging: Console basique

### 1.4 API Routes

**Fichier:** `server/routes/comptes.ts:497-909`

| Endpoint | Methode | Statut |
|----------|---------|--------|
| `/api/comptes/transferts` | POST | OK |
| `/api/comptes/transferts-programmes/stats` | GET | OK |
| `/api/comptes/transferts-programmes` | GET | OK |
| `/api/comptes/transferts-programmes/:id` | PATCH | OK |
| `/api/comptes/transferts-programmes/:id` | DELETE | MANQUANT |
| `/api/comptes/transferts-programmes/:id/run-now` | POST | MANQUANT |
| `/api/comptes/transferts-programmes/:id/history` | GET | MANQUANT |
| `/api/comptes/transferts-programmes/health` | GET | MANQUANT |

### 1.5 Frontend

**Fichier:** `client/src/components/admin/AdminVirementsProgrammes.tsx`

- Dashboard avec KPIs
- Filtres par statut
- Recherche paginee
- Details drawer
- Polling 30s (pas de WebSocket)

---

## 2. Failles Critiques Identifiees

### CRITIQUE-1: Absence de verrou distribue (Double execution)

**Localisation:** `compte-transfers.ts:224-323`

**Probleme:** La fonction `runVirementsProgrammes()` n'utilise pas `SELECT FOR UPDATE SKIP LOCKED`. En multi-instances (2+ pods), tous les workers vont traiter les memes virements simultanement.

**Code actuel (DANGEREUX):**
```typescript
export async function runVirementsProgrammes() {
  // FLAW: Simple SELECT sans verrou
  const schedules = await getVirementsProgrammesDue(referenceDate);

  for (const schedule of schedules) {
    // FLAW: Pas de verrou - race condition
    await executeCompteTransfer({...});
  }
}
```

**Reproduction:**
1. Deployer 2 instances du backend
2. Avoir 10 virements programmes dus a 02h30
3. Resultats: 20 mouvements crees (double debit)

**Impact:** Perte financiere directe, incoherence comptable

---

### CRITIQUE-2: Cle d'idempotence non-deterministe

**Localisation:** `compte-transfers.ts:231`

**Probleme:** La cle d'idempotence inclut `crypto.randomUUID()` ce qui la rend unique a chaque tentative:

```typescript
const idempotencyKey = `VP-${schedule.id}-${date}-${crypto.randomUUID().slice(0, 8)}`;
//                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                            FLAW: UUID different a chaque retry!
```

**Consequence:** En cas de retry (crash apres transfer, avant update status), une nouvelle cle est generee = nouveau mouvement = double debit.

**Solution attendue:** Cle deterministe basee sur (schedule.id + date_bucket)

---

### CRITIQUE-3: Audit log hors transaction

**Localisation:** `compte-transfers.ts:246-275`

**Probleme:** L'update du virement programme et l'insertion de l'audit log sont HORS de la transaction du transfert:

```typescript
// DANS transaction:
const { mouvementId } = await executeCompteTransfer({...});

// HORS transaction - Crash ici = etat inconsistant!
await db.update(virementsProgrammes).set({...});
await db.insert(virementsProgrammesAuditLogs).values({...});
```

**Scenario de crash:**
1. Transfer execute (argent debite/credite)
2. Crash avant update `prochaineExecution`
3. Prochain run: re-execute le meme virement

---

### CRITIQUE-4: Pas de table `scheduled_transfer_runs`

**Probleme:** Pas de table separee pour tracer chaque tentative d'execution. Impossible de:
- Detecter les doublons avec `UNIQUE(schedule_id, run_bucket)`
- Tracer les retries
- Auditer les echecs multiples

**Schema manquant:**
```sql
scheduled_transfer_runs (
  id UUID PK,
  scheduled_transfer_id UUID FK,
  execution_key TEXT UNIQUE,  -- VP-{id}-{YYYY-MM-DD}
  status ENUM(PENDING, RUNNING, SUCCESS, FAILED),
  started_at, completed_at,
  mouvement_id UUID FK,
  error_message TEXT,
  attempt_number INT
)
```

---

### CRITIQUE-5: Pas de gestion timezone

**Localisation:** `compte-transfers.ts:38-56`

**Probleme:** `computeNextExecution()` utilise les dates JS locales du serveur, pas la timezone de l'agence:

```typescript
const computeNextExecution = (base: Date, frequence: string): Date | null => {
  const next = new Date(base);  // FLAW: Timezone serveur, pas agence
  switch (frequence) {
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(next.getDate(), 28));  // OK: evite jour 29-31
      return next;
  }
};
```

**Impact:** Un virement "mensuel le 15" peut s'executer le 14 ou 16 selon DST.

---

## 3. Failles Moyennes

### MOYEN-1: RBAC incomplet

**Probleme:** Pas de champ `agenceId` direct sur `virementsProgrammes`. Le filtrage se fait via les comptes lies, ce qui est lent et fragile.

**Solution:** Ajouter `agenceId UUID FK` avec index pour filtrage rapide.

---

### MOYEN-2: Pas d'endpoint DELETE

**Probleme:** Impossible d'annuler un virement programme depuis l'API.

---

### MOYEN-3: Pas de WebSocket temps reel

**Probleme:** Frontend utilise polling 30s au lieu de WebSocket pour les mises a jour.

---

## 4. Architecture Cible

### 4.1 Schema DB Renforce

```sql
-- Table principale (modifiee)
ALTER TABLE virements_programmes ADD COLUMN
  agence_id UUID REFERENCES agences(id),
  timezone TEXT DEFAULT 'Africa/Brazzaville',
  jour_execution INT,  -- 1-28 pour monthly
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  deleted_at TIMESTAMP;  -- soft delete

-- Nouvelle table: executions
CREATE TABLE scheduled_transfer_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_transfer_id UUID NOT NULL REFERENCES virements_programmes(id),
  execution_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  mouvement_id UUID REFERENCES mouvements_financiers(id),
  error_message TEXT,
  attempt_number INT DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT uq_execution_key UNIQUE(execution_key)
);

CREATE INDEX idx_runs_schedule_status ON scheduled_transfer_runs(scheduled_transfer_id, status);
CREATE INDEX idx_runs_execution_key ON scheduled_transfer_runs(execution_key);
```

### 4.2 Worker Robuste

```typescript
async function processScheduledTransfers() {
  const now = new Date();
  const dateBucket = now.toISOString().slice(0, 10);

  // Atomic claim with SKIP LOCKED
  const claimed = await db.execute(sql`
    UPDATE virements_programmes
    SET processing_lock = ${workerId}, processing_started_at = NOW()
    WHERE id IN (
      SELECT id FROM virements_programmes
      WHERE actif = true
        AND prochaine_execution <= ${now}
        AND processing_lock IS NULL
        AND deleted_at IS NULL
      ORDER BY prochaine_execution
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  for (const schedule of claimed.rows) {
    const executionKey = `VP-${schedule.id}-${dateBucket}`;

    await db.transaction(async (tx) => {
      // 1. Creer run avec UNIQUE constraint (idempotence)
      const [run] = await tx.insert(scheduledTransferRuns)
        .values({ scheduledTransferId: schedule.id, executionKey, status: 'RUNNING' })
        .onConflictDoNothing()
        .returning();

      if (!run) {
        // Deja execute aujourd'hui - skip
        return;
      }

      try {
        // 2. Executer le transfert
        const { mouvementId } = await executeCompteTransferTx(tx, {...});

        // 3. Marquer succes + calculer prochaine date
        const nextDate = computeNextExecution(now, schedule.frequence, schedule.timezone);

        await tx.update(scheduledTransferRuns)
          .set({ status: 'SUCCESS', mouvementId, completedAt: new Date() })
          .where(eq(scheduledTransferRuns.id, run.id));

        await tx.update(virementsProgrammes)
          .set({
            dernierExecution: now,
            prochaineExecution: nextDate,
            actif: nextDate ? true : false,
            statutDernier: 'SUCCESS',
            erreurDerniere: null,
            retryCount: 0,
            processingLock: null
          })
          .where(eq(virementsProgrammes.id, schedule.id));

      } catch (error) {
        // 4. Marquer echec
        await tx.update(scheduledTransferRuns)
          .set({ status: 'FAILED', errorMessage: error.message, completedAt: new Date() })
          .where(eq(scheduledTransferRuns.id, run.id));

        const newRetryCount = schedule.retryCount + 1;
        await tx.update(virementsProgrammes)
          .set({
            statutDernier: 'FAILED',
            erreurDerniere: error.message,
            retryCount: newRetryCount,
            actif: newRetryCount < schedule.maxRetries,
            processingLock: null
          })
          .where(eq(virementsProgrammes.id, schedule.id));
      }
    });
  }
}
```

---

## 5. Plan d'Implementation par PR

### PR1: Schema DB + Migrations
- Ajouter colonnes sur `virements_programmes`
- Creer table `scheduled_transfer_runs`
- Index optimaux
- Migration Drizzle

### PR2: Worker Robuste
- `SELECT FOR UPDATE SKIP LOCKED`
- Transaction atomique complete
- Idempotence via `execution_key`
- Retry avec backoff

### PR3: API Complete
- DELETE (soft delete)
- POST /:id/run-now
- GET /:id/history
- GET /health

### PR4: WebSocket + Frontend
- Events `SCHEDULED_TRANSFER_UPDATED`
- Invalidation React Query centralisee
- UI temps reel

### PR5: Tests
- Unit: `computeNextExecution()`
- Integration: Double-execution prevention
- E2E: Cycle complet

---

## 6. Criteres de Definition of Done

| # | Critere | Mesure | Cible |
|---|---------|--------|-------|
| 1 | Pas de double debit | Test 2 workers simultanes | 0 doublon |
| 2 | Idempotence | Retry apres crash | 1 seul mouvement |
| 3 | Atomicite | Kill -9 mid-transaction | Rollback complet |
| 4 | Timezone | Virement 15h Africa/Brazzaville | Execute 15h local |
| 5 | RBAC | User agence A | Pas d'acces agence B |
| 6 | Soft delete | DELETE API | Masque sans perte |
| 7 | Audit trail | 100 executions | 100 logs audit |
| 8 | Temps reel | Execution | UI < 500ms |

---

## 7. Scenarios de Test Obligatoires

### S1: Virement unique (ONCE)
```gherkin
Given un virement ONCE de 50,000 FCFA
When le cron s'execute
Then 1 mouvement cree
And actif = false
And prochaineExecution = null
```

### S2: Mensuel jour 31
```gherkin
Given un virement mensuel jour 31
When mois de fevrier (28 jours)
Then execution le 28 fevrier
```

### S3: Pause avant echeance
```gherkin
Given un virement actif pour demain
When l'admin pause le virement
Then pas d'execution demain
When l'admin resume
Then prochaineExecution recalculee
```

### S4: Crash mid-transaction
```gherkin
Given un virement en cours d'execution
When crash apres debit, avant commit
Then rollback complet
And retry au prochain run
And 1 seul mouvement final
```

### S5: Multi-instances
```gherkin
Given 2 workers actifs
And 10 virements dus
When cron 02h30
Then exactement 10 mouvements (pas 20)
```

### S6: Solde insuffisant
```gherkin
Given compte source avec 10,000 FCFA
And virement de 50,000 FCFA
When execution
Then status = FAILED
And erreur = "Solde insuffisant"
And aucun mouvement cree
```

---

## 8. Prochaines Etapes

1. **Validation du plan** - Revue avec l'equipe
2. **PR1** - Schema DB (priorite CRITIQUE)
3. **PR2** - Worker robuste (priorite CRITIQUE)
4. **PR3** - API complete
5. **PR4** - WebSocket
6. **PR5** - Tests
7. **Deploiement staging** - Tests de charge
8. **Production** - Monitoring 7j

---

**Fin du rapport d'audit**
