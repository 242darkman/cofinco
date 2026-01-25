# AUDIT DE COHÉRENCE FINANCIÈRE - COFINCO

**Date**: 2026-01-25
**Version**: 1.0
**Auteur**: Audit automatisé Claude Code

---

## EXECUTIVE SUMMARY

Cet audit identifie **17 divergences critiques** dans la gestion des soldes financiers de COFINCO, avec un risque d'incohérence entre les données affichées à différents endroits de l'application.

### Niveau de risque global: **MOYEN-ÉLEVÉ**

| Catégorie | Divergences | Sévérité |
|-----------|-------------|----------|
| Calculs de soldes | 5 | 🔴 Critique |
| API doublons | 4 | 🟡 Moyen |
| WebSocket/Invalidation | 4 | 🟡 Moyen |
| Frontend caching | 4 | 🟡 Moyen |

---

## 1. CARTOGRAPHIE - SOURCE DE VÉRITÉ

### 1.1 Entités Financières et Champs de Solde

| Entité | Table | Champ Solde | Méthode | Source Officielle |
|--------|-------|-------------|---------|-------------------|
| **Compte Client** | `comptes` | `soldeCourant` | Persisté | ✅ Atomique via `updateCompteSolde()` |
| **Caisse** | `caisses` | `solde` | Persisté | ⚠️ Désync possible avec sessions |
| **Session Caisse** | `sessions_caisse` | `montantFermetureTheorique` | Persisté | ✅ Atomique via `updateSessionSolde()` |
| **Session Caisse** | `sessions_caisse` | `montantFermetureDeclare` | Déclaré | ⚠️ Saisi manuellement |
| **Coffre** | `coffres_forts` | `solde` | Persisté | ✅ Atomique via `updateCoffreSolde()` |
| **Crédit** | `credits` | `soldeRestant` | Persisté | ✅ Atomique via `updateCreditSolde()` |
| **Tontine** | `tontines` | `solde` | Persisté | ✅ Atomique via `updateTontineSolde()` |
| **Tontine Cycle** | `tontine_cycles` | `potCollected`, `potDistributed` | Dénormalisé | ⚠️ Cache, peut diverger |
| **Caisse Agent** | `caisses_agent` | `soldeValide` | Persisté | ✅ Uniquement opérations APPROVED |

### 1.2 Ledger (Source de Vérité Transactionnelle)

**Table pivot**: `mouvements_financiers`
- Chaque opération financière crée un mouvement
- Champs: `montant`, `sens` (DEBIT/CREDIT), `sourceModule`, `statut`
- Relations: `compteId`, `creditId`, `tontineId`, `sessionCaisseId`, `agenceId`

**Règle d'or**: Les soldes persistés (comptes.soldeCourant, etc.) DOIVENT correspondre à `SUM(mouvements)`.

---

## 2. DIVERGENCES IDENTIFIÉES

### 🔴 CRITIQUE #1: Encaisse Dashboard - Logique Hybride

**Fichier**: [dashboard-stats.ts](server/services/stats/dashboard-stats.ts)
**Lignes**: 72-86

```sql
SELECT CASE
  -- Session active: utiliser montant_fermeture_theorique
  WHEN s.closed_at IS NULL THEN s.montant_fermeture_theorique
  -- Session fermée: utiliser montant_fermeture_declare
  ELSE s.montant_fermeture_declare
END as solde_reel
```

**Problème**:
- Sessions actives utilisent le solde **théorique** (calculé)
- Sessions fermées utilisent le solde **déclaré** (saisi manuellement)
- Si écart non résolu, la valeur globale ENCAISSE est FAUSSE

**Impact**: Le dashboard principal peut afficher un solde de caisse incorrect.

---

### 🔴 CRITIQUE #2: Solde Session vs Solde Caisse Désynchronisés

**Fichiers**:
- [ledger.ts:417](server/services/ledger.ts) - `updateSessionSolde()`
- [ledger.ts:487](server/services/ledger.ts) - `updateCaisseSolde()`

**Problème**:
- `sessions_caisse.montantFermetureTheorique` est mis à jour à chaque opération
- `caisses.solde` est mis à jour SÉPARÉMENT (lors transferts coffre/caisse)
- Pas de contrainte garantissant l'égalité

**Impact**: `caisses.solde` peut diverger des sessions actives.

---

### 🔴 CRITIQUE #3: Tontine potCollected Dénormalisé

**Fichier**: [tontines.ts](shared/schema/tontines.ts)
**Tables**: `tontine_cycles.potCollected`, `tontine_cycles.potDistributed`

**Problème**:
- Ces champs sont des caches dénormalisés
- Mis à jour via trigger SQL ou application
- Peuvent diverger de `SUM(contributions_tontine.montant)`

**Impact**: Stats tontine incorrectes, distributions basées sur données erronées.

---

### 🔴 CRITIQUE #4: GL Posting Asynchrone

**Fichier**: [ledger.ts](server/services/ledger.ts)

**Pattern**:
```typescript
1. ✅ Business transaction COMMIT
2. ✅ Solde persisté mis à jour
3. ⚠️ GL posting fire-and-forget (async)
```

**Problème**:
- L'écriture comptable peut échouer après la transaction métier
- `accountingPostingService.getBalance()` diverge des soldes métier
- Idempotency via `gl_posting_links` mais retry manuel

**Impact**: Balance comptable peut être en retard ou manquer des écritures.

---

### 🔴 CRITIQUE #5: Épargne PENDING_ACTIVATION Exclue

**Fichier**: [dashboard-stats.ts:109-115](server/services/stats/dashboard-stats.ts)

```typescript
.where(and(
  eq(comptes.typeCompte, TypeCompte.SAVINGS),
  eq(comptes.statut, StatutCompte.ACTIVE) // ← Exclut PENDING
))
```

**Problème**:
- Un compte PENDING_ACTIVATION peut avoir un `soldeCourant > 0` (pré-dépôt)
- Ces fonds sont exclus du total épargne dashboard
- Mais visibles dans d'autres rapports (comptes individuels)

**Impact**: Divergence entre total épargne global et somme des comptes.

---

### 🟡 MOYEN #6: Doublons API Comptabilité v1/v2

**Fichiers**: [accounting.ts](server/routes/accounting.ts)

| Route v1 | Route v2 | Différence |
|----------|----------|------------|
| `GET /api/comptabilite/balance` | `GET /api/comptabilite/v2/balance` | Running balance |
| `GET /api/comptabilite/grand-livre/:id` | `GET /api/comptabilite/v2/grand-livre/:id` | Format différent |

**Impact**: Confusion frontend, migration incomplète.

---

### 🟡 MOYEN #7: WebSocket Events Sans Payload de Solde

**Fichier**: [finance.ts:2418](server/routes/finance.ts)

```typescript
// Seul endroit avec newSolde dans payload
wsInstance.broadcast({
  type: "COMPTE_UPDATE",
  payload: { compteId, newSolde: Number(transaction.soldeApres) }
});
```

**Autres events**: CAISSE_UPDATE, CREDIT_UPDATE, TONTINE_UPDATE ne contiennent PAS le nouveau solde.

**Impact**: Frontend doit re-fetch pour avoir le solde, latence et race conditions.

---

### 🟡 MOYEN #8: Invalidation React Query Inconsistante

**Fichier**: [WebSocketContext.tsx](client/src/contexts/WebSocketContext.tsx)

| Event | Invalidation | Debounce |
|-------|--------------|----------|
| `CHAT_MESSAGE` | Immédiate | ❌ |
| `CAISSE_UPDATE` | 1s debounce | ✅ |
| `CREDIT_UPDATE` | 1s debounce | ✅ |
| `COMPTE_UPDATE` | 1s debounce | ✅ |
| `DASHBOARD_UPDATE` | 1s debounce | ✅ |

**Problème**: Pas de pattern unifié, certains modules n'invalident pas du tout.

---

### 🟡 MOYEN #9: Dashboard Polling 30s Sans WS

**Fichier**: [useDashboardStats.ts](client/src/hooks/dashboard/useDashboardStats.ts)

```typescript
refetchInterval: 30000, // 30 secondes
```

**Problème**:
- Le solde principal (tresorerieDispo) peut être stale pendant 30s
- Pas de réaction WebSocket pour BALANCE_UPDATED

**Impact**: UX dégradée, données obsolètes visibles.

---

### 🟡 MOYEN #10: Stats Comptes - 3 Endpoints Différents

| Endpoint | Retour | Usage |
|----------|--------|-------|
| `GET /api/comptes/stats` | Totaux par type | Dashboard admin |
| `GET /api/comptes/:id/stats` | Évolution temporelle | Détail compte |
| `GET /api/clients/:id/portfolio` | Comptes + crédits + tontines | Vue client |

**Impact**: Confusion, maintenance multiple.

---

### 🟡 MOYEN #11: Caisse Agent Calcul Différent

**Fichier**: [caisse-agent-service.ts](server/services/caisse-agent/caisse-agent-service.ts)

- `caissesAgent.soldeValide` = Uniquement opérations APPROVED
- Différent de `SUM(operations_terrain)` qui inclut PENDING

**Impact**: Incohérence visible agent vs supervision.

---

## 3. MATRICE DE COHÉRENCE

### 3.1 Où chaque solde est affiché

| Solde | Dashboard | Module dédié | Comptabilité | Client Portfolio |
|-------|-----------|--------------|--------------|------------------|
| **Encaisse (Caisse)** | ✅ tresorerieDispo | ✅ CaisseDashboard | ✅ Balance classe 5 | ❌ |
| **Épargne** | ✅ global.montantEpargneTotal | ✅ Comptes list | ✅ Balance classe 4 | ✅ |
| **Crédits en cours** | ✅ global.montantCreditsTotal | ✅ Credits list | ✅ Balance classe 2 | ✅ |
| **Tontine solde** | ❌ | ✅ TontineDashboard | ❌ | ✅ |
| **Coffre** | ✅ (inclus dans encaisse) | ✅ CoffreSupervision | ❌ | ❌ |

### 3.2 Méthode de calcul par emplacement

| Emplacement | Méthode | Query Key | Refresh |
|-------------|---------|-----------|---------|
| Dashboard principal | `getGlobalStats()` | `['dashboard-stats']` | 30s poll |
| Module Caisse | `sessionService.getActive()` | `['session-caisse', 'active']` | WebSocket |
| Module Comptes | `storage.getComptes()` | `['comptes-epargne']` | WebSocket COMPTE_UPDATE |
| Module Credits | `storage.getCredits()` | `['credits']` | WebSocket CREDIT_UPDATE |
| Comptabilité | `accountingPostingService.getBalance()` | État local | Manuel |

---

## 4. PLAN DE CORRECTION

### Phase 1: Quick Wins (1-2 jours)

#### PR-1: Normaliser WebSocket Events avec Soldes

**Objectif**: Tous les events financiers contiennent le nouveau solde.

```typescript
// Nouveau format standardisé
type BalanceUpdateEvent = {
  type: 'BALANCE_UPDATED';
  payload: {
    entityType: 'compte' | 'caisse' | 'credit' | 'tontine' | 'coffre';
    entityId: string;
    newBalance: number;
    previousBalance?: number;
    delta: number;
    mouvementRef: string;
    timestamp: string;
  };
};
```

**Fichiers à modifier**:
- `server/services/ledger.ts` - Ajouter payload solde
- `server/ws-server.ts` - Nouveau type BALANCE_UPDATED
- `client/src/contexts/WebSocketContext.tsx` - Handler

---

#### PR-2: Supprimer Doublons API v1

**Objectif**: Une seule version des endpoints comptabilité.

```diff
// server/routes/accounting.ts
- router.get('/balance', ...)     // DELETE
+ router.get('/balance', v2Handler)  // RENAME v2 → v1

- router.get('/grand-livre/:id', ...)  // DELETE
+ router.get('/grand-livre/:id', v2Handler)  // RENAME
```

---

### Phase 2: Consolidation (3-5 jours)

#### PR-3: Créer BalanceService Centralisé

**Nouveau fichier**: `server/services/balance-service.ts`

```typescript
class BalanceService {
  // Source unique pour tous les soldes
  async getCompteBalance(compteId: string): Promise<Balance> {
    // Lecture directe comptes.soldeCourant
  }

  async getCaisseBalance(caisseId: string): Promise<Balance> {
    // Logique unifiée session active/fermée
  }

  async getCreditBalance(creditId: string): Promise<Balance> {
    // Lecture directe credits.soldeRestant
  }

  async getTontineBalance(tontineId: string): Promise<Balance> {
    // Lecture directe tontines.solde
  }

  async getGlobalCashPosition(agenceId?: string): Promise<CashPosition> {
    // Coffres + Caisses avec logique cohérente
  }

  // Réconciliation
  async reconcileCompte(compteId: string): Promise<ReconciliationResult> {
    // Compare soldeCourant vs SUM(mouvements)
  }
}
```

---

#### PR-4: Unifier Calcul Encaisse Dashboard

**Objectif**: Éliminer la logique hybride théorique/déclaré.

```typescript
// AVANT (dashboard-stats.ts)
CASE
  WHEN s.closed_at IS NULL THEN s.montant_fermeture_theorique
  ELSE s.montant_fermeture_declare
END

// APRÈS
// Utiliser UNIQUEMENT montant_fermeture_theorique car c'est la source de vérité
// Si session fermée, théorique = déclaré (sauf écart documenté)
COALESCE(s.montant_fermeture_theorique, s.montant_ouverture, 0)
```

---

#### PR-5: Frontend - Hooks Unifiés

**Nouveau fichier**: `client/src/hooks/balances/useBalance.ts`

```typescript
// Un seul hook par type de solde
export function useCompteBalance(compteId: string) {
  const queryClient = useQueryClient();
  const { onlineUsers } = useWebSocket();

  // Écoute BALANCE_UPDATED
  useEffect(() => {
    const handler = (event: CustomEvent<BalanceUpdateEvent>) => {
      if (event.detail.entityType === 'compte' && event.detail.entityId === compteId) {
        // Update optimiste
        queryClient.setQueryData(['compte-balance', compteId], event.detail.newBalance);
      }
    };
    window.addEventListener('balance-updated', handler);
    return () => window.removeEventListener('balance-updated', handler);
  }, [compteId]);

  return useQuery({
    queryKey: ['compte-balance', compteId],
    queryFn: () => balanceApi.getCompteBalance(compteId),
    staleTime: 5 * 60 * 1000, // 5 min - WebSocket gère le refresh
  });
}
```

---

### Phase 3: Robustesse (1 semaine)

#### PR-6: Tests de Cohérence Automatisés

**Nouveau fichier**: `server/__tests__/balance-consistency.test.ts`

```typescript
describe('Balance Consistency', () => {
  it('compte.soldeCourant matches SUM(mouvements)', async () => {
    const comptes = await db.select().from(comptes);

    for (const compte of comptes) {
      const calculated = await db.select({
        sum: sql`SUM(CASE WHEN sens = 'CREDIT' THEN montant ELSE -montant END)`
      }).from(mouvementsFinanciers)
      .where(eq(mouvementsFinanciers.compteId, compte.id));

      expect(Number(compte.soldeCourant)).toBe(Number(calculated[0].sum));
    }
  });

  it('session.montantFermetureTheorique matches operations', async () => {
    // ...similar test
  });

  it('tontine.solde matches contributions - distributions', async () => {
    // ...similar test
  });
});
```

---

#### PR-7: Job de Réconciliation Quotidien

**Nouveau fichier**: `server/cron/balance-reconciliation.ts`

```typescript
// Exécuté chaque nuit à 2h
async function dailyReconciliation() {
  const discrepancies = [];

  // 1. Vérifier tous les comptes
  const compteResults = await balanceService.reconcileAllComptes();
  discrepancies.push(...compteResults.filter(r => r.hasDiscrepancy));

  // 2. Vérifier toutes les caisses
  const caisseResults = await balanceService.reconcileAllCaisses();
  discrepancies.push(...caisseResults.filter(r => r.hasDiscrepancy));

  // 3. Alerter si divergences
  if (discrepancies.length > 0) {
    await notificationService.sendToAdmins({
      type: 'RECONCILIATION_ALERT',
      payload: {
        count: discrepancies.length,
        details: discrepancies,
      }
    });
  }

  // 4. Logger pour audit
  await auditLog.create({
    action: 'DAILY_RECONCILIATION',
    result: discrepancies.length === 0 ? 'SUCCESS' : 'DISCREPANCIES_FOUND',
    details: discrepancies,
  });
}
```

---

## 5. RÉSUMÉ DES FICHIERS À MODIFIER

### Backend

| Fichier | Action | Priorité |
|---------|--------|----------|
| `server/services/balance-service.ts` | CRÉER | 🔴 Haute |
| `server/services/ledger.ts` | MODIFIER (events) | 🔴 Haute |
| `server/ws-server.ts` | MODIFIER (BALANCE_UPDATED) | 🔴 Haute |
| `server/services/stats/dashboard-stats.ts` | MODIFIER (encaisse) | 🔴 Haute |
| `server/routes/accounting.ts` | MODIFIER (supprimer v1) | 🟡 Moyenne |
| `server/cron/balance-reconciliation.ts` | CRÉER | 🟡 Moyenne |
| `server/__tests__/balance-consistency.test.ts` | CRÉER | 🟡 Moyenne |

### Frontend

| Fichier | Action | Priorité |
|---------|--------|----------|
| `client/src/hooks/balances/useBalance.ts` | CRÉER | 🔴 Haute |
| `client/src/contexts/WebSocketContext.tsx` | MODIFIER | 🔴 Haute |
| `client/src/hooks/dashboard/useDashboardStats.ts` | MODIFIER | 🟡 Moyenne |
| `client/src/components/dashboard/Dashboard.tsx` | MODIFIER | 🟡 Moyenne |

---

## 6. TESTS DE VALIDATION

### Scénarios E2E Critiques

1. **Dépôt Épargne**
   - Action: Dépôt 100,000 FCFA sur compte épargne
   - Vérifier: soldeCourant, session caisse, dashboard global, comptabilité

2. **Remboursement Crédit**
   - Action: Paiement échéance 50,000 FCFA
   - Vérifier: soldeRestant crédit, session caisse, allocation intérêts/principal

3. **Cotisation Tontine**
   - Action: Cotisation 25,000 FCFA
   - Vérifier: tontine.solde, cycle.potCollected, membre.totalCotisations

4. **Transfert Coffre→Caisse**
   - Action: Approvisionnement 500,000 FCFA
   - Vérifier: coffre.solde, session.montantFermetureTheorique, caisse.solde

5. **Collecte Agent Terrain**
   - Action: Collecte 10,000 FCFA puis remise
   - Vérifier: caisseAgent.soldeValide AVANT remise = 0 (pending), APRÈS = inclus

---

## 7. MÉTRIQUES DE SUCCÈS

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Divergences détectées | 0 | Job réconciliation quotidien |
| Latence affichage solde | < 500ms | Temps entre opération et UI update |
| Tests cohérence | 100% pass | CI/CD |
| Doublons API | 0 | Audit routes |

---

## ANNEXE A: Types TypeScript Proposés

```typescript
// shared/types/balances.ts

export interface Balance {
  entityId: string;
  entityType: BalanceEntityType;
  current: number;
  available: number; // Pour comptes bloqués
  pending: number;   // Opérations en attente
  asOf: Date;
}

export type BalanceEntityType =
  | 'compte'
  | 'caisse'
  | 'session_caisse'
  | 'credit'
  | 'tontine'
  | 'coffre'
  | 'caisse_agent';

export interface BalanceUpdateEvent {
  type: 'BALANCE_UPDATED';
  payload: {
    entityType: BalanceEntityType;
    entityId: string;
    agenceId: string;
    newBalance: number;
    previousBalance: number;
    delta: number;
    mouvementRef: string;
    sourceModule: string;
    timestamp: string;
  };
}

export interface CashPosition {
  totalCoffres: number;
  totalCaisses: number;
  totalCaissesAgent: number;
  grandTotal: number;
  breakdown: {
    byAgence: Record<string, number>;
    byCaisse: Record<string, number>;
  };
  asOf: Date;
}

export interface ReconciliationResult {
  entityType: BalanceEntityType;
  entityId: string;
  persistedBalance: number;
  calculatedBalance: number;
  discrepancy: number;
  hasDiscrepancy: boolean;
  lastMovement?: {
    id: string;
    reference: string;
    date: Date;
  };
}
```

---

**Fin du document d'audit**

Pour démarrer l'implémentation, exécuter:
```bash
# Créer la branche de travail
git checkout -b feat/financial-consistency-audit

# Commencer par PR-1 (WebSocket events)
```
