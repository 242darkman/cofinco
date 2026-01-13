# Plan d'Implémentation : CaisseAgent avec Workflow d'Approbation

## Vue d'ensemble

Ce document décrit l'implémentation d'un système de **CaisseAgent** (compte interne flottant) avec un workflow d'approbation pour les opérations terrain. L'objectif est de garantir qu'aucune transaction ne modifie les soldes tant qu'elle n'est pas approuvée par un superviseur.

---

## A) Schéma DB / Types

### A.1 Nouvelles Tables

#### Table `caisses_agent`

```typescript
// shared/schema/operations.ts

export const statutCaisseAgentEnum = pgEnum("statut_caisse_agent_enum", [
  "Active",
  "Suspendue",
  "Clôturée",
]);

export const caissesAgent = pgTable(
  "caisses_agent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTerrain.id, { onDelete: "restrict" })
      .unique(), // UN SEUL compte par agent

    // Solde validé (seules les opérations APPROVED impactent ce solde)
    soldeValide: numeric("solde_valide").notNull().default("0"),

    // Devise (XOF par défaut, cohérent avec le système)
    devise: text("devise").notNull().default("XOF"),

    statut: statutCaisseAgentEnum("statut").notNull().default("Active"),

    // Métadonnées
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"), // Soft delete
  },
  (t) => ({
    uqAgentActif: sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_caisses_agent_agent_actif
      ON caisses_agent (agent_id) WHERE deleted_at IS NULL`,
    idxStatut: index("idx_caisses_agent_statut").on(t.statut),
    chkSoldeNonNeg: sql`CONSTRAINT chk_caisses_agent_solde_nonneg CHECK (${t.soldeValide} >= 0)`,
  }),
);
```

#### Table `operations_terrain`

```typescript
// shared/schema/operations.ts

export const typeOperationTerrainEnum = pgEnum("type_operation_terrain_enum", [
  "COLLECT_CASH",      // Agent collecte cash d'un client
  "SETTLEMENT_CASH",   // Agent remet cash à l'agence/coffre
]);

export const statutOperationTerrainEnum = pgEnum("statut_operation_terrain_enum", [
  "SUBMITTED",   // Soumise, en attente de validation
  "APPROVED",    // Approuvée, écritures postées
  "REJECTED",    // Rejetée, aucune écriture
  "CANCELLED",   // Annulée par l'agent/admin
]);

export const operationsTerrain = pgTable(
  "operations_terrain",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Identifiant unique pour idempotence
    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key"),

    // Type d'opération
    type: typeOperationTerrainEnum("type").notNull(),

    // Agent concerné
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTerrain.id, { onDelete: "restrict" }),
    caisseAgentId: uuid("caisse_agent_id")
      .notNull()
      .references(() => caissesAgent.id, { onDelete: "restrict" }),

    // Client (obligatoire pour COLLECT_CASH, null pour SETTLEMENT_CASH)
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "restrict" }),

    // Destination (pour SETTLEMENT_CASH)
    destinationCaisseId: uuid("destination_caisse_id").references(() => caisses.id, { onDelete: "restrict" }),

    // Montant et devise
    montant: numeric("montant").notNull(),
    devise: text("devise").notNull().default("XOF"),

    // Statut workflow
    statut: statutOperationTerrainEnum("statut").notNull().default("SUBMITTED"),

    // Soumission
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),

    // Approbation/Rejet
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at"),
    rejectionReason: text("rejection_reason"),

    // Annulation
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at"),
    cancellationReason: text("cancellation_reason"),

    // Références aux écritures postées (idempotence)
    postedAt: timestamp("posted_at"),
    postedMouvementCaisseAgentId: uuid("posted_mouvement_caisse_agent_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    postedMouvementClientId: uuid("posted_mouvement_client_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    postedMouvementDestinationId: uuid("posted_mouvement_destination_id")
      .references(() => mouvementsFinanciers.id, { onDelete: "set null" }),
    postedPaiementTerrainId: uuid("posted_paiement_terrain_id")
      .references(() => paiementsTerrain.id, { onDelete: "set null" }),

    // Métadonnées (reçu, justificatifs, etc.)
    metadata: json("metadata").$type<{
      numeroRecu?: string;
      typePaiementClient?: string;  // "Remboursement Crédit", "Dépôt Épargne", etc.
      creditId?: string;
      compteId?: string;
      tontineId?: string;
      justificatifs?: string[];     // URLs des pièces jointes
      observations?: string;
      latitude?: number;
      longitude?: number;
    }>(),

    // Timestamps standard
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Unicité
    uqReference: uniqueIndex("uq_operations_terrain_reference").on(t.reference),
    uqIdempotency: uniqueIndex("uq_operations_terrain_idempotency").on(t.idempotencyKey),

    // Index de recherche
    idxAgentStatut: index("idx_operations_terrain_agent_statut").on(t.agentId, t.statut),
    idxStatutDate: index("idx_operations_terrain_statut_date").on(t.statut, t.submittedAt),
    idxTypeDate: index("idx_operations_terrain_type_date").on(t.type, t.submittedAt),
    idxClientDate: index("idx_operations_terrain_client_date").on(t.clientId, t.submittedAt),
    idxCaisseAgent: index("idx_operations_terrain_caisse_agent").on(t.caisseAgentId),

    // Contraintes métier
    chkMontantPos: sql`CONSTRAINT chk_operations_terrain_montant_pos CHECK (${t.montant} > 0)`,
    chkClientCollect: sql`CONSTRAINT chk_operations_terrain_client_collect
      CHECK (${t.type} != 'COLLECT_CASH' OR ${t.clientId} IS NOT NULL)`,
    chkDestinationSettlement: sql`CONSTRAINT chk_operations_terrain_destination_settlement
      CHECK (${t.type} != 'SETTLEMENT_CASH' OR ${t.destinationCaisseId} IS NOT NULL)`,
  }),
);
```

#### Table d'audit `operations_terrain_audit_logs`

```typescript
export const operationsTerrainAuditLogs = pgTable(
  "operations_terrain_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operationsTerrain.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // SUBMITTED, APPROVED, REJECTED, CANCELLED
    statutAvant: text("statut_avant"),
    statutApres: text("statut_apres").notNull(),
    details: json("details").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id),
    userRole: text("user_role"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (t) => ({
    idxOperationDate: index("idx_operations_terrain_audit_operation_date")
      .on(t.operationId, t.timestamp),
  }),
);
```

### A.2 Extension de `mouvementsFinanciers`

Ajouter un nouveau sourceModule pour les opérations terrain avec workflow :

```typescript
// Dans shared/schema/finance.ts, modifier sourceModuleEnum :
export const sourceModuleEnum = pgEnum("source_module_enum", [
  "CAISSE",
  "EPARGNE",
  "CREDIT",
  "TONTINE",
  "TERRAIN",
  "TRANSFERT",
  "SYSTEME",
  "CAISSE_AGENT", // NOUVEAU
]);
```

### A.3 Types TypeScript

```typescript
// shared/types/operations-terrain.ts

export interface CaisseAgent {
  id: string;
  agentId: string;
  soldeValide: string;
  devise: string;
  statut: "Active" | "Suspendue" | "Clôturée";
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CaisseAgentSummary {
  soldeValide: string;      // Montant validé disponible
  pendingIn: string;        // COLLECT_CASH en attente (entrées)
  pendingOut: string;       // SETTLEMENT_CASH en attente (sorties)
  disponible: string;       // soldeValide - pendingOut (ce qu'on peut remettre)
}

export interface OperationTerrain {
  id: string;
  reference: string;
  idempotencyKey?: string;
  type: "COLLECT_CASH" | "SETTLEMENT_CASH";
  agentId: string;
  caisseAgentId: string;
  clientId?: string;
  destinationCaisseId?: string;
  montant: string;
  devise: string;
  statut: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  submittedBy: string;
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  cancelledBy?: string;
  cancelledAt?: Date;
  cancellationReason?: string;
  postedAt?: Date;
  postedMouvementCaisseAgentId?: string;
  postedMouvementClientId?: string;
  postedMouvementDestinationId?: string;
  postedPaiementTerrainId?: string;
  metadata?: OperationTerrainMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationTerrainMetadata {
  numeroRecu?: string;
  typePaiementClient?: string;
  creditId?: string;
  compteId?: string;
  tontineId?: string;
  justificatifs?: string[];
  observations?: string;
  latitude?: number;
  longitude?: number;
}

export interface CreateCollectCashInput {
  agentId: string;
  clientId: string;
  montant: number;
  typePaiementClient: string; // "Remboursement Crédit" | "Dépôt Épargne" | etc.
  creditId?: string;
  compteId?: string;
  tontineId?: string;
  numeroRecu?: string;
  observations?: string;
  latitude?: number;
  longitude?: number;
  idempotencyKey?: string;
}

export interface CreateSettlementCashInput {
  agentId: string;
  destinationCaisseId: string;
  montant: number;
  observations?: string;
  idempotencyKey?: string;
}

export interface ApproveOperationInput {
  operationId: string;
  approvedBy: string;
}

export interface RejectOperationInput {
  operationId: string;
  rejectedBy: string;
  rejectionReason: string;
}
```

---

## B) Règles Comptables / Écritures à l'Approbation

### B.1 Collecte Cash Client (`COLLECT_CASH`)

**Scénario :** L'agent collecte 50,000 XOF d'un client pour rembourser un crédit.

#### À la soumission (SUBMITTED)
- Aucune écriture comptable
- Création de l'opération avec statut SUBMITTED
- Le solde de la CaisseAgent reste inchangé

#### À l'approbation (APPROVED)

**Écritures créées :**

| # | Compte | Sens | Montant | Source Module |
|---|--------|------|---------|---------------|
| 1 | CaisseAgent | Crédit | 50,000 | CAISSE_AGENT |
| 2 | Crédit Client (dette) | Crédit | 50,000 | CREDIT |

**Détail des opérations :**

```
1. Mouvement CaisseAgent (entrée de cash)
   - compteId: NULL (compte interne, pas un compte client)
   - caisseAgentId: [référence caisse agent]
   - sens: "Crédit" (augmente le solde)
   - montant: 50000
   - sourceModule: "CAISSE_AGENT"
   - sourceTable: "operations_terrain"
   - sourceId: [operation.id]

2. Mouvement/Paiement Client
   - Création d'un paiementsTerrain avec statut "Posté"
   - Création d'un mouvement sur le crédit du client
   - creditId: [credit.id]
   - sens: "Crédit" (réduit la dette)

3. Mise à jour CaisseAgent
   - soldeValide += 50000

4. Mise à jour Operation
   - statut: "APPROVED"
   - approvedBy, approvedAt
   - postedMouvementCaisseAgentId: [mouvement1.id]
   - postedMouvementClientId: [mouvement2.id]
   - postedPaiementTerrainId: [paiement.id]
   - postedAt: NOW()
```

### B.2 Remise Cash (`SETTLEMENT_CASH`)

**Scénario :** L'agent remet 100,000 XOF à la caisse principale de l'agence.

#### À la soumission (SUBMITTED)
- Aucune écriture comptable
- Création de l'opération avec statut SUBMITTED
- Vérification que `soldeValide >= montant` (sinon rejet immédiat)

#### À l'approbation (APPROVED)

**Écritures créées :**

| # | Compte | Sens | Montant | Source Module |
|---|--------|------|---------|---------------|
| 1 | CaisseAgent | Débit | 100,000 | CAISSE_AGENT |
| 2 | CaisseAgence | Crédit | 100,000 | CAISSE |

**Détail des opérations :**

```
1. Vérification solde
   - IF caisseAgent.soldeValide < montant THEN REJECT "Solde insuffisant"

2. Mouvement CaisseAgent (sortie de cash)
   - sens: "Débit" (diminue le solde)
   - montant: 100000
   - sourceModule: "CAISSE_AGENT"
   - sourceTable: "operations_terrain"
   - sourceId: [operation.id]

3. Mouvement CaisseAgence (entrée de cash)
   - caisseId: [caisse.id]
   - sens: "Crédit" (augmente le solde)
   - montant: 100000
   - sourceModule: "CAISSE"
   - sourceTable: "operations_terrain"
   - sourceId: [operation.id]

4. Mise à jour soldes
   - caisseAgent.soldeValide -= 100000
   - caisseAgence.solde += 100000

5. Mise à jour Operation
   - statut: "APPROVED"
   - postedMouvementCaisseAgentId: [mouvement1.id]
   - postedMouvementDestinationId: [mouvement2.id]
   - postedAt: NOW()
```

### B.3 Diagramme de Flux Comptable

```
┌─────────────────────────────────────────────────────────────────────┐
│                        COLLECT_CASH FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [Client] ──cash──> [Agent] ──submit──> [Operation: SUBMITTED]       │
│                                                                       │
│  [Superviseur] ──approve──> [Operation: APPROVED]                    │
│                                   │                                   │
│                    ┌──────────────┴──────────────┐                   │
│                    │                              │                   │
│                    ▼                              ▼                   │
│         [CaisseAgent.solde ↑]          [Credit/Compte Client]        │
│         mouvement: Crédit               mouvement: Crédit            │
│                                         (dette ↓ ou solde ↑)         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       SETTLEMENT_CASH FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [Agent] ──submit──> [Operation: SUBMITTED]                          │
│                                                                       │
│  [Superviseur] ──approve──> [Operation: APPROVED]                    │
│                                   │                                   │
│                    ┌──────────────┴──────────────┐                   │
│                    │                              │                   │
│                    ▼                              ▼                   │
│         [CaisseAgent.solde ↓]          [CaisseAgence.solde ↑]        │
│         mouvement: Débit               mouvement: Crédit             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## C) API / Services

### C.1 Structure des Services

```
server/
├── services/
│   └── caisse-agent/
│       ├── index.ts                 # Export principal
│       ├── caisse-agent-service.ts  # Gestion des caisses agent
│       ├── operation-service.ts     # Création d'opérations
│       ├── approval-service.ts      # Approbation/Rejet
│       └── ledger-integration.ts    # Intégration avec le ledger
├── routes/
│   └── caisse-agent.ts              # Endpoints REST
```

### C.2 Service: CaisseAgentService

```typescript
// server/services/caisse-agent/caisse-agent-service.ts

export class CaisseAgentService {
  /**
   * Crée une caisse agent pour un agent existant
   */
  async createCaisseAgent(params: {
    agentId: string;
    createdBy: string;
  }): Promise<{ success: boolean; caisseAgent?: CaisseAgent; error?: string }> {
    // 1. Vérifier que l'agent existe
    // 2. Vérifier qu'il n'a pas déjà une caisse active
    // 3. Créer la caisse avec solde initial 0
    // 4. Log audit
  }

  /**
   * Récupère le résumé de la caisse d'un agent
   */
  async getCaisseAgentSummary(agentId: string): Promise<CaisseAgentSummary> {
    // 1. Récupérer la caisse agent
    // 2. Calculer pendingIn (somme COLLECT_CASH en SUBMITTED)
    // 3. Calculer pendingOut (somme SETTLEMENT_CASH en SUBMITTED)
    // 4. Calculer disponible = soldeValide - pendingOut
    return {
      soldeValide: caisseAgent.soldeValide,
      pendingIn: sumPendingCollect,
      pendingOut: sumPendingSettlement,
      disponible: Math.max(0, soldeValide - pendingOut)
    };
  }

  /**
   * Suspend une caisse agent (bloque les nouvelles opérations)
   */
  async suspendCaisseAgent(params: {
    agentId: string;
    reason: string;
    suspendedBy: string;
  }): Promise<{ success: boolean }>;

  /**
   * Réactive une caisse agent
   */
  async reactivateCaisseAgent(params: {
    agentId: string;
    reactivatedBy: string;
  }): Promise<{ success: boolean }>;
}
```

### C.3 Service: OperationService

```typescript
// server/services/caisse-agent/operation-service.ts

export class OperationService {
  /**
   * Crée une opération de collecte cash
   */
  async createCollectCash(params: CreateCollectCashInput & { submittedBy: string }): Promise<{
    success: boolean;
    operation?: OperationTerrain;
    error?: string;
    errorCode?: string;
  }> {
    return await db.transaction(async (tx) => {
      // 1. Vérifier idempotency
      if (params.idempotencyKey) {
        const existing = await tx.query.operationsTerrain.findFirst({
          where: eq(operationsTerrain.idempotencyKey, params.idempotencyKey)
        });
        if (existing) return { success: true, operation: existing };
      }

      // 2. Récupérer/vérifier la caisse agent
      const caisseAgent = await this.getOrCreateCaisseAgent(tx, params.agentId);
      if (caisseAgent.statut !== "Active") {
        return { success: false, error: "Caisse agent inactive", errorCode: "CAISSE_INACTIVE" };
      }

      // 3. Vérifier le client
      const client = await tx.query.clients.findFirst({
        where: eq(clients.id, params.clientId)
      });
      if (!client) {
        return { success: false, error: "Client non trouvé", errorCode: "CLIENT_NOT_FOUND" };
      }

      // 4. Générer la référence
      const reference = generateOperationReference("COLLECT");

      // 5. Créer l'opération
      const [operation] = await tx.insert(operationsTerrain).values({
        reference,
        idempotencyKey: params.idempotencyKey,
        type: "COLLECT_CASH",
        agentId: params.agentId,
        caisseAgentId: caisseAgent.id,
        clientId: params.clientId,
        montant: params.montant.toString(),
        statut: "SUBMITTED",
        submittedBy: params.submittedBy,
        submittedAt: new Date(),
        metadata: {
          typePaiementClient: params.typePaiementClient,
          creditId: params.creditId,
          compteId: params.compteId,
          tontineId: params.tontineId,
          numeroRecu: params.numeroRecu,
          observations: params.observations,
          latitude: params.latitude,
          longitude: params.longitude,
        },
      }).returning();

      // 6. Log audit
      await this.logAudit(tx, operation.id, "SUBMITTED", null, "SUBMITTED", params.submittedBy, {});

      return { success: true, operation };
    });
  }

  /**
   * Crée une opération de remise cash
   */
  async createSettlementCash(params: CreateSettlementCashInput & { submittedBy: string }): Promise<{
    success: boolean;
    operation?: OperationTerrain;
    error?: string;
    errorCode?: string;
  }> {
    return await db.transaction(async (tx) => {
      // 1. Vérifier idempotency
      // 2. Récupérer la caisse agent
      const caisseAgent = await this.getCaisseAgent(tx, params.agentId);

      // 3. Vérifier le solde disponible
      const summary = await this.getCaisseAgentSummary(tx, params.agentId);
      if (parseFloat(summary.disponible) < params.montant) {
        return {
          success: false,
          error: `Solde disponible insuffisant: ${summary.disponible} < ${params.montant}`,
          errorCode: "INSUFFICIENT_BALANCE"
        };
      }

      // 4. Vérifier la caisse destination
      const caisseDestination = await tx.query.caisses.findFirst({
        where: eq(caisses.id, params.destinationCaisseId)
      });
      if (!caisseDestination) {
        return { success: false, error: "Caisse destination non trouvée", errorCode: "CAISSE_NOT_FOUND" };
      }

      // 5. Créer l'opération
      const reference = generateOperationReference("SETTLE");
      const [operation] = await tx.insert(operationsTerrain).values({
        reference,
        idempotencyKey: params.idempotencyKey,
        type: "SETTLEMENT_CASH",
        agentId: params.agentId,
        caisseAgentId: caisseAgent.id,
        destinationCaisseId: params.destinationCaisseId,
        montant: params.montant.toString(),
        statut: "SUBMITTED",
        submittedBy: params.submittedBy,
        submittedAt: new Date(),
        metadata: {
          observations: params.observations,
        },
      }).returning();

      // 6. Log audit
      await this.logAudit(tx, operation.id, "SUBMITTED", null, "SUBMITTED", params.submittedBy, {});

      return { success: true, operation };
    });
  }

  /**
   * Liste les opérations avec filtres
   */
  async getOperations(filters: {
    agentId?: string;
    statut?: string;
    type?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ operations: OperationTerrain[]; total: number }>;

  /**
   * Annule une opération (seulement si SUBMITTED)
   */
  async cancelOperation(params: {
    operationId: string;
    cancelledBy: string;
    reason: string;
  }): Promise<{ success: boolean; operation?: OperationTerrain; error?: string }>;
}
```

### C.4 Service: ApprovalService

```typescript
// server/services/caisse-agent/approval-service.ts

export class ApprovalService {
  /**
   * Approuve une opération et poste les écritures
   * TRANSACTIONNEL et IDEMPOTENT
   */
  async approveOperation(params: ApproveOperationInput): Promise<{
    success: boolean;
    operation?: OperationTerrain;
    mouvements?: MouvementFinancier[];
    error?: string;
    errorCode?: string;
  }> {
    return await db.transaction(async (tx) => {
      // 1. Verrouiller l'opération (SELECT FOR UPDATE)
      const [operation] = await tx
        .select()
        .from(operationsTerrain)
        .where(eq(operationsTerrain.id, params.operationId))
        .for("update");

      if (!operation) {
        return { success: false, error: "Opération non trouvée", errorCode: "NOT_FOUND" };
      }

      // 2. Vérifier idempotence (déjà approuvée?)
      if (operation.statut === "APPROVED") {
        // Retourner succès sans re-poster
        return { success: true, operation, mouvements: [] };
      }

      // 3. Vérifier statut valide
      if (operation.statut !== "SUBMITTED") {
        return {
          success: false,
          error: `Impossible d'approuver: statut actuel ${operation.statut}`,
          errorCode: "INVALID_STATUS"
        };
      }

      // 4. Poster les écritures selon le type
      let mouvements: MouvementFinancier[];
      let paiementTerrain: PaiementTerrain | null = null;

      if (operation.type === "COLLECT_CASH") {
        const result = await this.postCollectCashEntries(tx, operation, params.approvedBy);
        if (!result.success) return result;
        mouvements = result.mouvements!;
        paiementTerrain = result.paiementTerrain ?? null;
      } else {
        const result = await this.postSettlementCashEntries(tx, operation, params.approvedBy);
        if (!result.success) return result;
        mouvements = result.mouvements!;
      }

      // 5. Mettre à jour l'opération
      const [updatedOperation] = await tx
        .update(operationsTerrain)
        .set({
          statut: "APPROVED",
          approvedBy: params.approvedBy,
          approvedAt: new Date(),
          postedAt: new Date(),
          postedMouvementCaisseAgentId: mouvements[0]?.id,
          postedMouvementClientId: mouvements[1]?.id,
          postedMouvementDestinationId: operation.type === "SETTLEMENT_CASH" ? mouvements[1]?.id : null,
          postedPaiementTerrainId: paiementTerrain?.id,
          updatedAt: new Date(),
        })
        .where(eq(operationsTerrain.id, operation.id))
        .returning();

      // 6. Log audit
      await this.logAudit(tx, operation.id, "APPROVED", "SUBMITTED", "APPROVED", params.approvedBy, {
        mouvementIds: mouvements.map(m => m.id),
      });

      // 7. Créer événements outbox pour notifications
      await this.createOutboxEvents(tx, updatedOperation, mouvements);

      return { success: true, operation: updatedOperation, mouvements };
    });
  }

  /**
   * Poste les écritures pour COLLECT_CASH
   */
  private async postCollectCashEntries(
    tx: Transaction,
    operation: OperationTerrain,
    approvedBy: string
  ): Promise<{
    success: boolean;
    mouvements?: MouvementFinancier[];
    paiementTerrain?: PaiementTerrain;
    error?: string;
    errorCode?: string;
  }> {
    const montant = parseFloat(operation.montant);
    const metadata = operation.metadata as OperationTerrainMetadata;

    // 1. Créer mouvement CaisseAgent (Crédit = entrée)
    const refCaisseAgent = generateReference("CAISSE_AGENT");
    const [mouvementCaisseAgent] = await tx.insert(mouvementsFinanciers).values({
      dateOperation: new Date(),
      montant: operation.montant,
      sens: "Crédit",
      statut: "Posté",
      methodePaiement: "Espèces",
      reference: refCaisseAgent,
      agentId: operation.agentId,
      clientId: operation.clientId,
      sourceModule: "CAISSE_AGENT",
      sourceTable: "operations_terrain",
      sourceId: operation.id,
      createdBy: approvedBy,
      metadata: { operationType: "COLLECT_CASH" },
    }).returning();

    // 2. Mettre à jour solde CaisseAgent
    await tx
      .update(caissesAgent)
      .set({
        soldeValide: sql`${caissesAgent.soldeValide} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(caissesAgent.id, operation.caisseAgentId));

    // 3. Créer mouvement/paiement client selon le type
    let mouvementClient: MouvementFinancier | null = null;
    let paiementTerrain: PaiementTerrain | null = null;

    if (metadata.creditId) {
      // Remboursement crédit
      const result = await this.postCreditPayment(tx, operation, approvedBy);
      mouvementClient = result.mouvement;
      paiementTerrain = result.paiement;
    } else if (metadata.compteId) {
      // Dépôt sur compte
      const result = await this.postAccountDeposit(tx, operation, approvedBy);
      mouvementClient = result.mouvement;
      paiementTerrain = result.paiement;
    } else if (metadata.tontineId) {
      // Versement tontine
      const result = await this.postTontinePayment(tx, operation, approvedBy);
      mouvementClient = result.mouvement;
      paiementTerrain = result.paiement;
    }

    const mouvements = [mouvementCaisseAgent];
    if (mouvementClient) mouvements.push(mouvementClient);

    return { success: true, mouvements, paiementTerrain: paiementTerrain ?? undefined };
  }

  /**
   * Poste les écritures pour SETTLEMENT_CASH
   */
  private async postSettlementCashEntries(
    tx: Transaction,
    operation: OperationTerrain,
    approvedBy: string
  ): Promise<{
    success: boolean;
    mouvements?: MouvementFinancier[];
    error?: string;
    errorCode?: string;
  }> {
    const montant = parseFloat(operation.montant);

    // 1. Vérifier solde suffisant (re-vérification dans transaction)
    const [caisseAgent] = await tx
      .select()
      .from(caissesAgent)
      .where(eq(caissesAgent.id, operation.caisseAgentId))
      .for("update");

    if (parseFloat(caisseAgent.soldeValide) < montant) {
      return {
        success: false,
        error: `Solde insuffisant: ${caisseAgent.soldeValide} < ${montant}`,
        errorCode: "INSUFFICIENT_BALANCE",
      };
    }

    // 2. Créer mouvement CaisseAgent (Débit = sortie)
    const refCaisseAgent = generateReference("CAISSE_AGENT");
    const [mouvementCaisseAgent] = await tx.insert(mouvementsFinanciers).values({
      dateOperation: new Date(),
      montant: operation.montant,
      sens: "Débit",
      statut: "Posté",
      methodePaiement: "Espèces",
      reference: refCaisseAgent,
      agentId: operation.agentId,
      sourceModule: "CAISSE_AGENT",
      sourceTable: "operations_terrain",
      sourceId: operation.id,
      createdBy: approvedBy,
      metadata: { operationType: "SETTLEMENT_CASH" },
    }).returning();

    // 3. Mettre à jour solde CaisseAgent
    await tx
      .update(caissesAgent)
      .set({
        soldeValide: sql`${caissesAgent.soldeValide} - ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(caissesAgent.id, operation.caisseAgentId));

    // 4. Créer mouvement CaisseAgence (Crédit = entrée)
    const refCaisse = generateReference("CAISSE");
    const [mouvementCaisse] = await tx.insert(mouvementsFinanciers).values({
      dateOperation: new Date(),
      montant: operation.montant,
      sens: "Crédit",
      statut: "Posté",
      methodePaiement: "Espèces",
      reference: refCaisse,
      agentId: operation.agentId,
      sourceModule: "CAISSE",
      sourceTable: "operations_terrain",
      sourceId: operation.id,
      createdBy: approvedBy,
      metadata: { operationType: "SETTLEMENT_CASH", fromCaisseAgent: operation.caisseAgentId },
    }).returning();

    // 5. Mettre à jour solde CaisseAgence
    await tx
      .update(caisses)
      .set({
        solde: sql`${caisses.solde} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(caisses.id, operation.destinationCaisseId!));

    return { success: true, mouvements: [mouvementCaisseAgent, mouvementCaisse] };
  }

  /**
   * Rejette une opération
   */
  async rejectOperation(params: RejectOperationInput): Promise<{
    success: boolean;
    operation?: OperationTerrain;
    error?: string;
  }> {
    return await db.transaction(async (tx) => {
      const [operation] = await tx
        .select()
        .from(operationsTerrain)
        .where(eq(operationsTerrain.id, params.operationId))
        .for("update");

      if (!operation) {
        return { success: false, error: "Opération non trouvée" };
      }

      if (operation.statut !== "SUBMITTED") {
        return { success: false, error: `Impossible de rejeter: statut ${operation.statut}` };
      }

      const [updatedOperation] = await tx
        .update(operationsTerrain)
        .set({
          statut: "REJECTED",
          rejectedBy: params.rejectedBy,
          rejectedAt: new Date(),
          rejectionReason: params.rejectionReason,
          updatedAt: new Date(),
        })
        .where(eq(operationsTerrain.id, operation.id))
        .returning();

      // Aucune écriture comptable créée
      await this.logAudit(tx, operation.id, "REJECTED", "SUBMITTED", "REJECTED", params.rejectedBy, {
        reason: params.rejectionReason,
      });

      return { success: true, operation: updatedOperation };
    });
  }
}
```

### C.5 Routes REST

```typescript
// server/routes/caisse-agent.ts

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CaisseAgentService, OperationService, ApprovalService } from "../services/caisse-agent";
import { requireAuth, requireRole } from "../middleware/auth";

const router = new Hono();

const caisseAgentService = new CaisseAgentService();
const operationService = new OperationService();
const approvalService = new ApprovalService();

// ============================================
// OPÉRATIONS TERRAIN
// ============================================

/**
 * POST /api/operations-terrain
 * Crée une nouvelle opération (collecte ou remise)
 * Rôles: agent_terrain
 */
router.post(
  "/operations-terrain",
  requireAuth,
  requireRole(["agent_terrain", "chef_agence", "admin"]),
  zValidator(
    "json",
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("COLLECT_CASH"),
        agentId: z.string().uuid(),
        clientId: z.string().uuid(),
        montant: z.number().positive(),
        typePaiementClient: z.string(),
        creditId: z.string().uuid().optional(),
        compteId: z.string().uuid().optional(),
        tontineId: z.string().uuid().optional(),
        numeroRecu: z.string().optional(),
        observations: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        idempotencyKey: z.string().optional(),
      }),
      z.object({
        type: z.literal("SETTLEMENT_CASH"),
        agentId: z.string().uuid(),
        destinationCaisseId: z.string().uuid(),
        montant: z.number().positive(),
        observations: z.string().optional(),
        idempotencyKey: z.string().optional(),
      }),
    ])
  ),
  async (c) => {
    const data = c.req.valid("json");
    const user = c.get("user");

    let result;
    if (data.type === "COLLECT_CASH") {
      result = await operationService.createCollectCash({
        ...data,
        submittedBy: user.id,
      });
    } else {
      result = await operationService.createSettlementCash({
        ...data,
        submittedBy: user.id,
      });
    }

    if (!result.success) {
      return c.json({ error: result.error, code: result.errorCode }, 400);
    }

    return c.json({ success: true, operation: result.operation }, 201);
  }
);

/**
 * POST /api/operations-terrain/:id/approve
 * Approuve une opération et poste les écritures
 * Rôles: superviseur, chef_agence, admin
 */
router.post(
  "/operations-terrain/:id/approve",
  requireAuth,
  requireRole(["superviseur", "chef_agence", "admin"]),
  async (c) => {
    const operationId = c.req.param("id");
    const user = c.get("user");

    const result = await approvalService.approveOperation({
      operationId,
      approvedBy: user.id,
    });

    if (!result.success) {
      const status = result.errorCode === "INSUFFICIENT_BALANCE" ? 422 : 400;
      return c.json({ error: result.error, code: result.errorCode }, status);
    }

    return c.json({
      success: true,
      operation: result.operation,
      mouvements: result.mouvements,
    });
  }
);

/**
 * POST /api/operations-terrain/:id/reject
 * Rejette une opération
 * Rôles: superviseur, chef_agence, admin
 */
router.post(
  "/operations-terrain/:id/reject",
  requireAuth,
  requireRole(["superviseur", "chef_agence", "admin"]),
  zValidator("json", z.object({
    reason: z.string().min(10, "La raison doit contenir au moins 10 caractères"),
  })),
  async (c) => {
    const operationId = c.req.param("id");
    const { reason } = c.req.valid("json");
    const user = c.get("user");

    const result = await approvalService.rejectOperation({
      operationId,
      rejectedBy: user.id,
      rejectionReason: reason,
    });

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ success: true, operation: result.operation });
  }
);

/**
 * POST /api/operations-terrain/:id/cancel
 * Annule une opération (seulement si SUBMITTED)
 * Rôles: agent_terrain (son opération), superviseur, admin
 */
router.post(
  "/operations-terrain/:id/cancel",
  requireAuth,
  zValidator("json", z.object({
    reason: z.string().min(5),
  })),
  async (c) => {
    const operationId = c.req.param("id");
    const { reason } = c.req.valid("json");
    const user = c.get("user");

    const result = await operationService.cancelOperation({
      operationId,
      cancelledBy: user.id,
      reason,
    });

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ success: true, operation: result.operation });
  }
);

/**
 * GET /api/operations-terrain
 * Liste les opérations avec filtres
 */
router.get(
  "/operations-terrain",
  requireAuth,
  zValidator(
    "query",
    z.object({
      agentId: z.string().uuid().optional(),
      statut: z.enum(["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
      type: z.enum(["COLLECT_CASH", "SETTLEMENT_CASH"]).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    })
  ),
  async (c) => {
    const filters = c.req.valid("query");
    const result = await operationService.getOperations({
      ...filters,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
    });

    return c.json(result);
  }
);

/**
 * GET /api/operations-terrain/:id
 * Détails d'une opération
 */
router.get(
  "/operations-terrain/:id",
  requireAuth,
  async (c) => {
    const operationId = c.req.param("id");
    const operation = await operationService.getOperationById(operationId);

    if (!operation) {
      return c.json({ error: "Opération non trouvée" }, 404);
    }

    return c.json({ operation });
  }
);

// ============================================
// CAISSE AGENT
// ============================================

/**
 * GET /api/agents/:id/caisse
 * Récupère le résumé de la caisse d'un agent
 */
router.get(
  "/agents/:id/caisse",
  requireAuth,
  async (c) => {
    const agentId = c.req.param("id");

    try {
      const summary = await caisseAgentService.getCaisseAgentSummary(agentId);
      return c.json(summary);
    } catch (error) {
      return c.json({ error: "Caisse non trouvée" }, 404);
    }
  }
);

/**
 * POST /api/agents/:id/caisse
 * Crée une caisse pour un agent (admin only)
 */
router.post(
  "/agents/:id/caisse",
  requireAuth,
  requireRole(["admin", "chef_agence"]),
  async (c) => {
    const agentId = c.req.param("id");
    const user = c.get("user");

    const result = await caisseAgentService.createCaisseAgent({
      agentId,
      createdBy: user.id,
    });

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ success: true, caisseAgent: result.caisseAgent }, 201);
  }
);

/**
 * GET /api/agents/:id/caisse/historique
 * Historique des opérations d'une caisse agent
 */
router.get(
  "/agents/:id/caisse/historique",
  requireAuth,
  zValidator(
    "query",
    z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    })
  ),
  async (c) => {
    const agentId = c.req.param("id");
    const { limit, offset } = c.req.valid("query");

    const result = await operationService.getOperations({
      agentId,
      limit,
      offset,
    });

    return c.json(result);
  }
);

export default router;
```

---

## D) UI (React)

### D.1 Structure des Composants

```
client/src/components/
├── agent/
│   ├── AgentCaisseInterface.tsx      # Vue principale caisse agent
│   ├── CreateCollectCashForm.tsx     # Formulaire collecte
│   ├── CreateSettlementForm.tsx      # Formulaire remise
│   └── AgentCaisseDashboard.tsx      # Dashboard avec soldes
├── supervision/
│   ├── OperationsApprovalList.tsx    # Liste opérations à approuver
│   ├── OperationApprovalDetail.tsx   # Détail + boutons approve/reject
│   └── OperationsHistory.tsx         # Historique complet
```

### D.2 Composant: AgentCaisseDashboard

```tsx
// client/src/components/agent/AgentCaisseDashboard.tsx

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowUpCircle, ArrowDownCircle, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CaisseAgentSummary {
  soldeValide: string;
  pendingIn: string;
  pendingOut: string;
  disponible: string;
}

export function AgentCaisseDashboard({ agentId }: { agentId: string }) {
  const { data: summary, isLoading } = useQuery<CaisseAgentSummary>({
    queryKey: ["caisse-agent", agentId],
    queryFn: () => fetch(`/api/agents/${agentId}/caisse`).then(r => r.json()),
    refetchInterval: 30000, // Refresh every 30s
  });

  if (isLoading) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Solde Validé</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(summary?.soldeValide || "0")}
          </div>
          <p className="text-xs text-muted-foreground">
            Cash en possession (validé)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Collectes en attente</CardTitle>
          <ArrowUpCircle className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            +{formatCurrency(summary?.pendingIn || "0")}
          </div>
          <Badge variant="outline" className="mt-1">
            <Clock className="h-3 w-3 mr-1" />
            En validation
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Remises en attente</CardTitle>
          <ArrowDownCircle className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">
            -{formatCurrency(summary?.pendingOut || "0")}
          </div>
          <Badge variant="outline" className="mt-1">
            <Clock className="h-3 w-3 mr-1" />
            En validation
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Disponible</CardTitle>
          <Wallet className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(summary?.disponible || "0")}
          </div>
          <p className="text-xs text-muted-foreground">
            Montant remisable
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

### D.3 Composant: CreateCollectCashForm

```tsx
// client/src/components/agent/CreateCollectCashForm.tsx

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ClientSelector } from "@/components/shared/ClientSelector";

const collectCashSchema = z.object({
  clientId: z.string().uuid("Sélectionnez un client"),
  montant: z.number().positive("Le montant doit être positif"),
  typePaiementClient: z.string().min(1, "Sélectionnez un type"),
  creditId: z.string().uuid().optional(),
  compteId: z.string().uuid().optional(),
  tontineId: z.string().uuid().optional(),
  numeroRecu: z.string().optional(),
  observations: z.string().optional(),
});

type CollectCashForm = z.infer<typeof collectCashSchema>;

const TYPE_PAIEMENTS = [
  { value: "Remboursement Crédit", label: "Remboursement Crédit", requiresCredit: true },
  { value: "Dépôt Épargne", label: "Dépôt Épargne", requiresCompte: true },
  { value: "Dépôt Courant", label: "Dépôt Courant", requiresCompte: true },
  { value: "Versement Tontine", label: "Versement Tontine", requiresTontine: true },
];

export function CreateCollectCashForm({ agentId, onSuccess }: { agentId: string; onSuccess?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  const form = useForm<CollectCashForm>({
    resolver: zodResolver(collectCashSchema),
    defaultValues: {
      montant: 0,
      typePaiementClient: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CollectCashForm) => {
      const response = await fetch("/api/operations-terrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "COLLECT_CASH",
          agentId,
          ...data,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de la création");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Collecte soumise",
        description: "L'opération est en attente de validation par un superviseur.",
      });
      queryClient.invalidateQueries({ queryKey: ["caisse-agent", agentId] });
      queryClient.invalidateQueries({ queryKey: ["operations-terrain"] });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CollectCashForm) => {
    mutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Client</FormLabel>
              <FormControl>
                <ClientSelector
                  value={field.value}
                  onChange={(clientId) => {
                    field.onChange(clientId);
                    setSelectedClient(clientId);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="typePaiementClient"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type de paiement</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TYPE_PAIEMENTS.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Sélecteur conditionnel crédit/compte/tontine selon le type */}
        {form.watch("typePaiementClient") === "Remboursement Crédit" && selectedClient && (
          <CreditSelector clientId={selectedClient} control={form.control} />
        )}

        <FormField
          control={form.control}
          name="montant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Montant (XOF)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="numeroRecu"
          render={({ field }) => (
            <FormItem>
              <FormLabel>N° Reçu (optionnel)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="REC-001" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="observations"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observations (optionnel)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Notes..." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Soumission..." : "Soumettre la collecte"}
        </Button>
      </form>
    </Form>
  );
}
```

### D.4 Composant: OperationsApprovalList (Superviseur)

```tsx
// client/src/components/supervision/OperationsApprovalList.tsx

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Eye } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState } from "react";

interface Operation {
  id: string;
  reference: string;
  type: "COLLECT_CASH" | "SETTLEMENT_CASH";
  agentId: string;
  agent?: { nom: string; prenom: string };
  clientId?: string;
  client?: { nom: string; prenom: string };
  montant: string;
  statut: string;
  submittedAt: string;
  metadata?: {
    typePaiementClient?: string;
    observations?: string;
  };
}

export function OperationsApprovalList() {
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ operations: Operation[]; total: number }>({
    queryKey: ["operations-terrain", "SUBMITTED"],
    queryFn: () =>
      fetch("/api/operations-terrain?statut=SUBMITTED").then((r) => r.json()),
    refetchInterval: 10000,
  });

  const approveMutation = useMutation({
    mutationFn: async (operationId: string) => {
      const response = await fetch(`/api/operations-terrain/${operationId}/approve`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Erreur approbation");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-terrain"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ operationId, reason }: { operationId: string; reason: string }) => {
      const response = await fetch(`/api/operations-terrain/${operationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error("Erreur rejet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-terrain"] });
      setSelectedOperation(null);
      setRejectReason("");
    },
  });

  if (isLoading) return <div>Chargement...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Opérations en attente de validation
          <Badge variant="secondary">{data?.total || 0}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Soumis le</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.operations.map((op) => (
              <TableRow key={op.id}>
                <TableCell className="font-mono text-sm">{op.reference}</TableCell>
                <TableCell>
                  <Badge variant={op.type === "COLLECT_CASH" ? "default" : "secondary"}>
                    {op.type === "COLLECT_CASH" ? "Collecte" : "Remise"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {op.agent?.prenom} {op.agent?.nom}
                </TableCell>
                <TableCell>
                  {op.client ? `${op.client.prenom} ${op.client.nom}` : "-"}
                </TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(op.montant)}
                </TableCell>
                <TableCell>{formatDate(op.submittedAt)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approveMutation.mutate(op.id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                      Approuver
                    </Button>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedOperation(op.id)}
                        >
                          <XCircle className="h-4 w-4 mr-1 text-red-500" />
                          Rejeter
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Rejeter l'opération</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <p>
                            Référence: <strong>{op.reference}</strong>
                          </p>
                          <p>
                            Montant: <strong>{formatCurrency(op.montant)}</strong>
                          </p>
                          <Textarea
                            placeholder="Raison du rejet (min 10 caractères)..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                          />
                          <Button
                            variant="destructive"
                            onClick={() =>
                              rejectMutation.mutate({
                                operationId: op.id,
                                reason: rejectReason,
                              })
                            }
                            disabled={rejectReason.length < 10 || rejectMutation.isPending}
                          >
                            Confirmer le rejet
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {(!data?.operations || data.operations.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            Aucune opération en attente de validation
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## E) Migration & Backfill

### E.1 Migration Drizzle

```typescript
// drizzle/migrations/XXXX_add_caisse_agent.ts

import { sql } from "drizzle-orm";
import { pgTable, uuid, text, numeric, timestamp, index, uniqueIndex, pgEnum, json } from "drizzle-orm/pg-core";

export async function up(db: any) {
  // 1. Créer les enums
  await db.execute(sql`
    CREATE TYPE statut_caisse_agent_enum AS ENUM ('Active', 'Suspendue', 'Clôturée');
    CREATE TYPE type_operation_terrain_enum AS ENUM ('COLLECT_CASH', 'SETTLEMENT_CASH');
    CREATE TYPE statut_operation_terrain_enum AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');
  `);

  // 2. Ajouter 'CAISSE_AGENT' au source_module_enum existant
  await db.execute(sql`
    ALTER TYPE source_module_enum ADD VALUE IF NOT EXISTS 'CAISSE_AGENT';
  `);

  // 3. Créer la table caisses_agent
  await db.execute(sql`
    CREATE TABLE caisses_agent (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agents_terrain(id) ON DELETE RESTRICT,
      solde_valide NUMERIC NOT NULL DEFAULT '0',
      devise TEXT NOT NULL DEFAULT 'XOF',
      statut statut_caisse_agent_enum NOT NULL DEFAULT 'Active',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP,

      CONSTRAINT chk_caisses_agent_solde_nonneg CHECK (solde_valide >= 0)
    );

    CREATE UNIQUE INDEX uq_caisses_agent_agent_actif ON caisses_agent (agent_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_caisses_agent_statut ON caisses_agent (statut);
  `);

  // 4. Créer la table operations_terrain
  await db.execute(sql`
    CREATE TABLE operations_terrain (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reference TEXT NOT NULL,
      idempotency_key TEXT,
      type type_operation_terrain_enum NOT NULL,
      agent_id UUID NOT NULL REFERENCES agents_terrain(id) ON DELETE RESTRICT,
      caisse_agent_id UUID NOT NULL REFERENCES caisses_agent(id) ON DELETE RESTRICT,
      client_id UUID REFERENCES clients(id) ON DELETE RESTRICT,
      destination_caisse_id UUID REFERENCES caisses(id) ON DELETE RESTRICT,
      montant NUMERIC NOT NULL,
      devise TEXT NOT NULL DEFAULT 'XOF',
      statut statut_operation_terrain_enum NOT NULL DEFAULT 'SUBMITTED',

      submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMP,
      rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
      rejected_at TIMESTAMP,
      rejection_reason TEXT,
      cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
      cancelled_at TIMESTAMP,
      cancellation_reason TEXT,

      posted_at TIMESTAMP,
      posted_mouvement_caisse_agent_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,
      posted_mouvement_client_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,
      posted_mouvement_destination_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,
      posted_paiement_terrain_id UUID REFERENCES paiements_terrain(id) ON DELETE SET NULL,

      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

      CONSTRAINT chk_operations_terrain_montant_pos CHECK (montant > 0),
      CONSTRAINT chk_operations_terrain_client_collect CHECK (type != 'COLLECT_CASH' OR client_id IS NOT NULL),
      CONSTRAINT chk_operations_terrain_destination_settlement CHECK (type != 'SETTLEMENT_CASH' OR destination_caisse_id IS NOT NULL)
    );

    CREATE UNIQUE INDEX uq_operations_terrain_reference ON operations_terrain (reference);
    CREATE UNIQUE INDEX uq_operations_terrain_idempotency ON operations_terrain (idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX idx_operations_terrain_agent_statut ON operations_terrain (agent_id, statut);
    CREATE INDEX idx_operations_terrain_statut_date ON operations_terrain (statut, submitted_at);
    CREATE INDEX idx_operations_terrain_type_date ON operations_terrain (type, submitted_at);
    CREATE INDEX idx_operations_terrain_client_date ON operations_terrain (client_id, submitted_at);
    CREATE INDEX idx_operations_terrain_caisse_agent ON operations_terrain (caisse_agent_id);
  `);

  // 5. Créer la table d'audit
  await db.execute(sql`
    CREATE TABLE operations_terrain_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operation_id UUID NOT NULL REFERENCES operations_terrain(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      statut_avant TEXT,
      statut_apres TEXT NOT NULL,
      details JSONB NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id),
      user_role TEXT,
      ip_address TEXT,
      user_agent TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_operations_terrain_audit_operation_date ON operations_terrain_audit_logs (operation_id, timestamp);
  `);

  // 6. Backfill: Créer une caisse pour chaque agent existant
  await db.execute(sql`
    INSERT INTO caisses_agent (agent_id, solde_valide, devise, statut, created_at, updated_at)
    SELECT
      id,
      '0',
      'XOF',
      'Active',
      NOW(),
      NOW()
    FROM agents_terrain
    WHERE deleted_at IS NULL
    AND id NOT IN (SELECT agent_id FROM caisses_agent WHERE deleted_at IS NULL);
  `);
}

export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS operations_terrain_audit_logs;
    DROP TABLE IF EXISTS operations_terrain;
    DROP TABLE IF EXISTS caisses_agent;
    DROP TYPE IF EXISTS statut_operation_terrain_enum;
    DROP TYPE IF EXISTS type_operation_terrain_enum;
    DROP TYPE IF EXISTS statut_caisse_agent_enum;
  `);
  // Note: Ne pas supprimer CAISSE_AGENT du source_module_enum (irréversible sans recréation)
}
```

### E.2 Script de Backfill Séparé

```typescript
// scripts/backfill-caisses-agent.ts

import { db } from "../server/db";
import { agentsTerrain, caissesAgent } from "../shared/schema";
import { eq, isNull, notInArray } from "drizzle-orm";

async function backfillCaissesAgent() {
  console.log("Démarrage du backfill des caisses agent...");

  // Récupérer les agents sans caisse
  const agentsSansCaisse = await db
    .select({ id: agentsTerrain.id })
    .from(agentsTerrain)
    .where(isNull(agentsTerrain.deletedAt))
    .leftJoin(caissesAgent, eq(agentsTerrain.id, caissesAgent.agentId));

  const agentsACreer = agentsSansCaisse.filter((a) => !a.caisse_agent_id);

  console.log(`${agentsACreer.length} agents sans caisse trouvés`);

  for (const agent of agentsACreer) {
    try {
      await db.insert(caissesAgent).values({
        agentId: agent.id,
        soldeValide: "0",
        devise: "XOF",
        statut: "Active",
      });
      console.log(`Caisse créée pour agent ${agent.id}`);
    } catch (error) {
      console.error(`Erreur pour agent ${agent.id}:`, error);
    }
  }

  console.log("Backfill terminé");
}

backfillCaissesAgent().catch(console.error);
```

### E.3 Stratégie de Déploiement

```
1. Déployer la migration (création tables vides)
   - Les tables sont créées mais pas utilisées
   - Aucun impact sur l'existant

2. Déployer le code backend (services + routes)
   - Les nouveaux endpoints sont disponibles
   - L'ancien workflow terrain continue de fonctionner

3. Exécuter le backfill
   - Création des caisses pour agents existants
   - Peut tourner en background

4. Déployer le frontend
   - Nouvelle UI pour agents et superviseurs
   - Bascule progressive possible

5. Communication aux utilisateurs
   - Nouveau workflow obligatoire
   - Formation sur l'approbation
```

---

## F) Tests

### F.1 Tests Unitaires: ApprovalService

```typescript
// server/services/caisse-agent/__tests__/approval-service.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApprovalService } from "../approval-service";
import { db } from "../../../db";
import { caissesAgent, operationsTerrain, mouvementsFinanciers } from "../../../../shared/schema";

describe("ApprovalService", () => {
  let service: ApprovalService;
  let testAgent: any;
  let testCaisse: any;
  let testClient: any;
  let testUser: any;
  let testSupervisor: any;

  beforeEach(async () => {
    service = new ApprovalService();
    // Setup test data...
  });

  afterEach(async () => {
    // Cleanup test data...
  });

  describe("approveOperation - COLLECT_CASH", () => {
    it("devrait créer 2 écritures lors de l'approbation d'une collecte", async () => {
      // Arrange
      const operation = await createTestOperation({
        type: "COLLECT_CASH",
        agentId: testAgent.id,
        clientId: testClient.id,
        montant: "50000",
        statut: "SUBMITTED",
      });

      // Act
      const result = await service.approveOperation({
        operationId: operation.id,
        approvedBy: testSupervisor.id,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.mouvements).toHaveLength(2);

      // Vérifier mouvement CaisseAgent
      const mouvementCaisse = result.mouvements![0];
      expect(mouvementCaisse.sens).toBe("Crédit");
      expect(mouvementCaisse.montant).toBe("50000");
      expect(mouvementCaisse.sourceModule).toBe("CAISSE_AGENT");

      // Vérifier que le solde a augmenté
      const updatedCaisse = await db.query.caissesAgent.findFirst({
        where: eq(caissesAgent.id, testCaisse.id),
      });
      expect(updatedCaisse!.soldeValide).toBe("50000");

      // Vérifier statut opération
      expect(result.operation!.statut).toBe("APPROVED");
      expect(result.operation!.postedAt).toBeDefined();
    });
  });

  describe("approveOperation - SETTLEMENT_CASH", () => {
    it("devrait refuser si solde insuffisant", async () => {
      // Arrange: Caisse avec solde 0
      const operation = await createTestOperation({
        type: "SETTLEMENT_CASH",
        agentId: testAgent.id,
        destinationCaisseId: testCaisseAgence.id,
        montant: "100000",
        statut: "SUBMITTED",
      });

      // Act
      const result = await service.approveOperation({
        operationId: operation.id,
        approvedBy: testSupervisor.id,
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INSUFFICIENT_BALANCE");
    });

    it("devrait créer 2 écritures et mettre à jour les 2 soldes", async () => {
      // Arrange: Caisse avec solde suffisant
      await db.update(caissesAgent)
        .set({ soldeValide: "100000" })
        .where(eq(caissesAgent.id, testCaisse.id));

      const operation = await createTestOperation({
        type: "SETTLEMENT_CASH",
        agentId: testAgent.id,
        destinationCaisseId: testCaisseAgence.id,
        montant: "50000",
        statut: "SUBMITTED",
      });

      // Act
      const result = await service.approveOperation({
        operationId: operation.id,
        approvedBy: testSupervisor.id,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.mouvements).toHaveLength(2);

      // Vérifier CaisseAgent a diminué
      const updatedCaisseAgent = await db.query.caissesAgent.findFirst({
        where: eq(caissesAgent.id, testCaisse.id),
      });
      expect(updatedCaisseAgent!.soldeValide).toBe("50000"); // 100000 - 50000

      // Vérifier CaisseAgence a augmenté
      const updatedCaisseAgence = await db.query.caisses.findFirst({
        where: eq(caisses.id, testCaisseAgence.id),
      });
      expect(parseFloat(updatedCaisseAgence!.solde)).toBeGreaterThan(0);
    });
  });

  describe("idempotence", () => {
    it("ne devrait pas créer d'écritures supplémentaires sur double approve", async () => {
      // Arrange
      const operation = await createTestOperation({
        type: "COLLECT_CASH",
        agentId: testAgent.id,
        clientId: testClient.id,
        montant: "50000",
        statut: "SUBMITTED",
      });

      // Act: Premier approve
      const result1 = await service.approveOperation({
        operationId: operation.id,
        approvedBy: testSupervisor.id,
      });
      expect(result1.success).toBe(true);

      // Compter les mouvements
      const countBefore = await db.select({ count: sql`count(*)` })
        .from(mouvementsFinanciers)
        .where(eq(mouvementsFinanciers.sourceId, operation.id));

      // Act: Deuxième approve (idempotent)
      const result2 = await service.approveOperation({
        operationId: operation.id,
        approvedBy: testSupervisor.id,
      });

      // Assert
      expect(result2.success).toBe(true);

      const countAfter = await db.select({ count: sql`count(*)` })
        .from(mouvementsFinanciers)
        .where(eq(mouvementsFinanciers.sourceId, operation.id));

      // Pas de nouvelles écritures
      expect(countAfter[0].count).toBe(countBefore[0].count);
    });
  });

  describe("rejectOperation", () => {
    it("ne devrait créer aucune écriture", async () => {
      // Arrange
      const operation = await createTestOperation({
        type: "COLLECT_CASH",
        agentId: testAgent.id,
        clientId: testClient.id,
        montant: "50000",
        statut: "SUBMITTED",
      });

      // Act
      const result = await service.rejectOperation({
        operationId: operation.id,
        rejectedBy: testSupervisor.id,
        rejectionReason: "Document manquant pour validation",
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.operation!.statut).toBe("REJECTED");

      // Vérifier aucun mouvement créé
      const mouvements = await db.query.mouvementsFinanciers.findMany({
        where: eq(mouvementsFinanciers.sourceId, operation.id),
      });
      expect(mouvements).toHaveLength(0);

      // Vérifier solde inchangé
      const caisse = await db.query.caissesAgent.findFirst({
        where: eq(caissesAgent.id, testCaisse.id),
      });
      expect(caisse!.soldeValide).toBe("0");
    });
  });
});
```

### F.2 Tests d'Intégration: API

```typescript
// server/routes/__tests__/caisse-agent.integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../../app";
import { createTestUser, createTestAgent, cleanupTestData } from "../../test/helpers";

describe("API Operations Terrain", () => {
  let agentUser: any;
  let supervisorUser: any;
  let testAgent: any;

  beforeAll(async () => {
    agentUser = await createTestUser({ role: "agent_terrain" });
    supervisorUser = await createTestUser({ role: "superviseur" });
    testAgent = await createTestAgent({ userId: agentUser.id });
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe("POST /api/operations-terrain", () => {
    it("devrait créer une collecte en statut SUBMITTED", async () => {
      const response = await app.request("/api/operations-terrain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentUser.token}`,
        },
        body: JSON.stringify({
          type: "COLLECT_CASH",
          agentId: testAgent.id,
          clientId: testClient.id,
          montant: 25000,
          typePaiementClient: "Remboursement Crédit",
          creditId: testCredit.id,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.operation.statut).toBe("SUBMITTED");
      expect(data.operation.reference).toMatch(/^OPT-COLLECT-/);
    });

    it("devrait rejeter une remise si solde insuffisant", async () => {
      const response = await app.request("/api/operations-terrain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentUser.token}`,
        },
        body: JSON.stringify({
          type: "SETTLEMENT_CASH",
          agentId: testAgent.id,
          destinationCaisseId: testCaisse.id,
          montant: 1000000, // Plus que le solde
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INSUFFICIENT_BALANCE");
    });
  });

  describe("POST /api/operations-terrain/:id/approve", () => {
    it("devrait rejeter si l'utilisateur n'est pas superviseur", async () => {
      const operation = await createTestOperation({ statut: "SUBMITTED" });

      const response = await app.request(`/api/operations-terrain/${operation.id}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentUser.token}`, // Agent, pas superviseur
        },
      });

      expect(response.status).toBe(403);
    });

    it("devrait approuver et poster les écritures", async () => {
      const operation = await createTestOperation({ statut: "SUBMITTED" });

      const response = await app.request(`/api/operations-terrain/${operation.id}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supervisorUser.token}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.operation.statut).toBe("APPROVED");
      expect(data.mouvements.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/agents/:id/caisse", () => {
    it("devrait retourner le résumé de la caisse", async () => {
      const response = await app.request(`/api/agents/${testAgent.id}/caisse`, {
        headers: {
          Authorization: `Bearer ${agentUser.token}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("soldeValide");
      expect(data).toHaveProperty("pendingIn");
      expect(data).toHaveProperty("pendingOut");
      expect(data).toHaveProperty("disponible");
    });
  });
});
```

---

## G) Décisions et Hypothèses

### G.1 Décisions Prises

| Décision | Justification |
|----------|---------------|
| **Devise unique XOF** | Cohérent avec le système existant, pas de multi-devises pour simplifier |
| **Solde non-négatif** | Contrainte CHECK pour éviter les découverts non autorisés |
| **Soft delete pour caissesAgent** | Permet de conserver l'historique et de réactiver si nécessaire |
| **Pas de DRAFT** | Simplifie le workflow: l'agent soumet directement (SUBMITTED) |
| **Idempotency double** | `idempotencyKey` (client) + `reference` (serveur) pour robustesse maximale |
| **Séparation des rôles** | Agent soumet, Superviseur approuve (pas le même utilisateur) |
| **CaisseAgent ≠ Compte Client** | Compte interne (custody), pas de portefeuille bourse |

### G.2 Hypothèses

| Hypothèse | Impact si faux |
|-----------|----------------|
| **Une caisse agence existe toujours** | Il faudrait créer une caisse par défaut pour les remises |
| **Les agents ont un employeId** | Sans employeId, on utilise les champs legacy (nom, prenom) |
| **Les superviseurs peuvent voir tous les agents** | Sinon, ajouter filtre par agence |
| **Montants en entiers (pas de centimes)** | Si centimes nécessaires, ajuster la validation |

### G.3 Points d'Extension Futurs

1. **Justificatifs/Pièces jointes**: Ajouter upload de photos (reçus, signatures)
2. **Workflow double validation**: Pour gros montants (seuil configurable)
3. **Alertes superviseur**: Notifications push pour opérations en attente
4. **Rapprochement automatique**: Vérifier cohérence caisse agent vs cash physique
5. **Plafonds par agent**: Limiter le montant max en caisse agent

---

## H) Résumé des Fichiers à Créer/Modifier

### Fichiers à Créer

```
shared/schema/operations.ts          # Ajouter tables caissesAgent, operationsTerrain, audit
shared/types/operations-terrain.ts   # Types TypeScript
server/services/caisse-agent/
  ├── index.ts
  ├── caisse-agent-service.ts
  ├── operation-service.ts
  ├── approval-service.ts
  └── ledger-integration.ts
server/routes/caisse-agent.ts
client/src/components/agent/
  ├── AgentCaisseDashboard.tsx
  ├── CreateCollectCashForm.tsx
  └── CreateSettlementForm.tsx
client/src/components/supervision/
  ├── OperationsApprovalList.tsx
  └── OperationApprovalDetail.tsx
drizzle/migrations/XXXX_add_caisse_agent.ts
scripts/backfill-caisses-agent.ts
server/services/caisse-agent/__tests__/
  ├── approval-service.test.ts
  └── operation-service.test.ts
```

### Fichiers à Modifier

```
shared/schema/finance.ts             # Ajouter CAISSE_AGENT à sourceModuleEnum
server/routes/index.ts               # Enregistrer les nouvelles routes
client/src/lib/api-client.ts         # Ajouter les appels API
client/src/lib/rbac-config.ts        # Ajouter les permissions
```

---

## I) Étapes d'Implémentation (Ordre Recommandé)

1. **Schema & Types** (2-3h)
   - Définir les tables Drizzle
   - Créer les types TypeScript
   - Modifier sourceModuleEnum

2. **Migration** (1h)
   - Créer le fichier migration
   - Tester en local
   - Script backfill

3. **Services Backend** (4-5h)
   - CaisseAgentService
   - OperationService
   - ApprovalService (le plus complexe)
   - Tests unitaires

4. **Routes API** (2h)
   - Endpoints CRUD
   - Validation Zod
   - Middleware permissions

5. **Tests Intégration** (2h)
   - Tests API
   - Tests workflows complets

6. **Frontend Agent** (3-4h)
   - Dashboard caisse
   - Formulaires collecte/remise
   - Historique

7. **Frontend Superviseur** (2-3h)
   - Liste approbations
   - Actions approve/reject
   - Détails opération

8. **Déploiement** (1h)
   - Migration production
   - Backfill
   - Smoke tests
