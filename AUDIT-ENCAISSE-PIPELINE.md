# AUDIT COMPLET — PIPELINE ENCAISSE COFINCO

**Date**: 30 Janvier 2026
**Auteur**: Claude (Staff Engineer Audit)
**Version**: 1.0

---

## SOMMAIRE EXECUTIF

### Constat Principal
L'**Encaisse Disponible** affichée dans le Dashboard provient actuellement d'une **agrégation de caches opérationnels** (`coffresForts.solde` + `sessionsCaisse.montantFermetureTheorique`), et **NON** du Grand Livre (GL) comptable.

### Verdict Global
| Aspect | Statut | Commentaire |
|--------|--------|-------------|
| GL Posting | ✅ SYNC | Implémenté dans commit 9749c30 |
| Encaisse = GL | ❌ GAP | Encaisse calculée depuis caches, pas GL |
| Réconciliation | ⚠️ PARTIEL | Existe mais pas exposé comme endpoint v2 |
| WebSocket | ✅ OK | BALANCE_UPDATED avec invalidation |
| Idempotency | ✅ OK | glPostingLinks + idempotencyKey |
| Multi-tenant | ✅ OK | agenceId partout |

---

## A) MATRICE ENCAISSE — COUVERTURE COMPLETE

### A.1 Sources de Données Actuelles

| Source | Table | Champ | Type | Utilisé Pour |
|--------|-------|-------|------|--------------|
| Coffre-Fort | `coffres_forts` | `solde` | Cache | Encaisse Dashboard |
| Session Caisse | `sessions_caisse` | `montant_fermeture_theorique` | Cache | Encaisse Dashboard |
| Compte Client | `comptes` | `solde_courant` | Cache | Solde affiché |
| Crédit | `credits` | `solde_restant` | Cache | Encours crédit |
| Tontine | `tontines` | `solde` | Cache | Solde tontine |
| Caisse Agent | `caisses_agent` | `solde_valide` | Cache | Terrain |
| **Grand Livre** | `ecritures` + `lignes_ecritures` | `montant` | **MASTER** | Comptabilité |

### A.2 Matrice des Opérations Financières

| # | Opération | Module | Service/Fichier | Mouvement Créé | Posting GL | Idempotency | WS Event | Impact Encaisse | Verdict |
|---|-----------|--------|-----------------|----------------|------------|-------------|----------|-----------------|---------|
| 1 | Dépôt Épargne | EPARGNE | `storage/finance.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (via session) | ✅ OK |
| 2 | Retrait Épargne | EPARGNE | `storage/finance.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (via session) | ✅ OK |
| 3 | Approv Coffre→Caisse | TRANSFERT | `coffre/transfer-executor.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (coffre+session) | ✅ OK |
| 4 | Versement Caisse→Coffre | TRANSFERT | `coffre/transfer-executor.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (coffre+session) | ✅ OK |
| 5 | Transfert Inter-Coffres | INTER_COFFRE | `transfert-inter-coffres/transfer-executor.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (2 coffres) | ✅ OK |
| 6 | Ouverture Session | CAISSE | `caisse/session-opening-service.ts` | ✅ | ✅ SYNC | ✅ | ✅ CAISSE_UPDATE | ✅ (session) | ✅ OK |
| 7 | Fermeture Session | CAISSE | `caisse/session-closing-service.ts` | ✅ | ✅ SYNC | ✅ | ✅ CAISSE_UPDATE | ✅ (session) | ✅ OK |
| 8 | Remboursement Crédit | CREDIT | `storage/finance.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (via session) | ✅ OK |
| 9 | Décaissement Crédit | CREDIT | `services/credit-allocation-service.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (via session) | ✅ OK |
| 10 | Paiement Frais Crédit | CREDIT | `storage/finance.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (via session) | ✅ OK |
| 11 | Contribution Tontine | TONTINE | `storage/tontines.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (via session) | ✅ OK |
| 12 | Distribution Tontine | TONTINE | `storage/tontines.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (via session) | ✅ OK |
| 13 | Paiement Mobile Money | MOBILE_MONEY | `mobile-money/payment-service.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ⚠️ Provider | ⚠️ |
| 14 | Paie Salaire | RH_PAYROLL | `hr-accounting-service.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (via session) | ✅ OK |
| 15 | Approvisionnement Externe | COFFRE | `coffre/transfer-executor.ts` | ✅ | ✅ SYNC | ✅ | ✅ BALANCE_UPDATED | ✅ (coffre) | ✅ OK |
| 16 | Écart Session (+/-) | CAISSE | `caisse/session-closing-service.ts` | ✅ | ✅ SYNC | ✅ | ✅ CAISSE_UPDATE | ⚠️ Comptable | ⚠️ |
| 17 | Collecte Terrain | TERRAIN | `services/caisse-agent/` | ✅ | ⚠️ PARTIEL | ✅ | ✅ BALANCE_UPDATED | ✅ | ⚠️ |

### A.3 GAPS IDENTIFIES

#### GAP CRITIQUE #1: Encaisse ≠ GL
```
ACTUEL:
  Encaisse = SUM(coffres_forts.solde) + SUM(sessions_caisse.montant_fermeture_theorique)

ATTENDU (SINGLE SOURCE OF TRUTH):
  Encaisse = SUM(GL.comptes_liquidite)
           = 571xxx (Caisse) + 531xxx (Coffre) + 573xxx (Mobile Money)
```

**Impact**: Si un mouvement est créé mais le posting GL échoue (glPostingStatus='FAILED'), l'encaisse affichée diverge du GL.

#### GAP #2: Pas d'endpoint v2 canonique
- Plusieurs routes retournent des soldes calculés différemment
- `/api/balances/cash-position` existe mais n'est pas basé sur GL
- Pas de décomposition standardisée (coffre/caisse/MM/banque)

#### GAP #3: Réconciliation manuelle uniquement
- `balanceService.reconcileCoffre()` existe mais pas exposé en v2
- Pas de job automatique de détection des écarts
- Pas d'alerte temps réel si divergence

#### GAP #4: Mobile Money non intégré dans Encaisse
- Les soldes MM ne sont pas agrégés dans l'encaisse principale
- Provider balance trackée séparément

---

## B) DESIGN — SINGLE SOURCE OF TRUTH

### B.1 Comptes GL Liquidité (Plan OHADA)

| Code | Libellé | Type | Inclus Encaisse |
|------|---------|------|-----------------|
| 521xxx | Caisse Guichet | Liquide | ✅ |
| 531xxx | Coffre-Fort | Liquide | ✅ |
| 573xxx | Mobile Money | Quasi-Liquide | ✅ |
| 512xxx | Banque | Liquide | ✅ |
| 581xxx | Virements Internes | Transitoire | ❌ (en transit) |

### B.2 Formule Encaisse Canonique

```typescript
interface EncaisseCanonique {
  // Montant total disponible (calculé depuis GL)
  totalDisponible: number;

  // Décomposition par source
  breakdown: {
    caisseGuichet: number;      // SUM(GL 521xxx)
    coffreCentral: number;      // SUM(GL 531xxx)
    mobileMoney: number;        // SUM(GL 573xxx)
    banque: number;             // SUM(GL 512xxx)
    fondsEnTransit: number;     // SUM(GL 581xxx) - informatif
    reservesBloques: number;    // Fonds bloqués (si applicable)
  };

  // Métadonnées
  meta: {
    computedAt: string;         // ISO timestamp
    source: 'GL';               // Toujours 'GL'
    agenceId: string;
    lastEcritureId?: string;    // Dernière écriture prise en compte
    lastPostingAt?: string;     // Date du dernier posting
  };

  // Réconciliation
  reconciliation?: {
    operationalTotal: number;   // Depuis caches opérationnels
    glTotal: number;            // Depuis GL
    ecart: number;              // Différence
    status: 'OK' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  };
}
```

### B.3 API Contract v2

```typescript
// GET /api/treasury/v2/encaisse?agenceId={uuid}
// Response: EncaisseCanonique

// Headers recommandés:
// - ETag: "{hash}" (pour cache conditionnel)
// - X-Computed-At: "{ISO timestamp}"
// - X-Source: "GL"

// Exemple réponse:
{
  "totalDisponible": 264001875,
  "breakdown": {
    "caisseGuichet": 3750,
    "coffreCentral": 263998125,
    "mobileMoney": 0,
    "banque": 0,
    "fondsEnTransit": 0,
    "reservesBloques": 0
  },
  "meta": {
    "computedAt": "2026-01-30T12:02:00.000Z",
    "source": "GL",
    "agenceId": "xxx-yyy-zzz",
    "lastEcritureId": "abc-123",
    "lastPostingAt": "2026-01-30T12:01:45.000Z"
  },
  "reconciliation": {
    "operationalTotal": 264001875,
    "glTotal": 264001875,
    "ecart": 0,
    "status": "OK"
  }
}
```

### B.4 Schéma de Flux

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUX ENCAISSE — SINGLE SOURCE OF TRUTH               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐              │
│  │   CAISSE     │      │   COFFRE     │      │ MOBILE MONEY │              │
│  │   Guichet    │      │   Central    │      │  (MTN/Airtel)│              │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘              │
│         │                     │                     │                       │
│         ▼                     ▼                     ▼                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    executeWithLedger()                                │  │
│  │  1. CREATE mouvement_financier (glPostingStatus='PENDING')           │  │
│  │  2. UPDATE cache opérationnel (session.solde, coffre.solde, etc.)    │  │
│  │  3. [SYNC] postGlForMouvement() → CREATE ecriture + lignes           │  │
│  │  4. UPDATE mouvement (glPostingStatus='POSTED')                      │  │
│  │  5. CREATE outbox_event (pour WebSocket)                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      GRAND LIVRE (GL)                                 │  │
│  │                                                                       │  │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
│  │   │  521xxx     │  │  531xxx     │  │  573xxx     │  │  512xxx     │ │  │
│  │   │  Caisse     │  │  Coffre     │  │  MoMo       │  │  Banque     │ │  │
│  │   │  3,750      │  │ 263,998,125 │  │  0          │  │  0          │ │  │
│  │   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │  │
│  │                                                                       │  │
│  │   ENCAISSE GL = 3,750 + 263,998,125 + 0 + 0 = 264,001,875 FCFA       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │               GET /api/treasury/v2/encaisse                           │  │
│  │                                                                       │  │
│  │   SELECT SUM(CASE WHEN sens='DEBIT' THEN montant ELSE -montant END)  │  │
│  │   FROM lignes_ecritures le                                           │  │
│  │   JOIN comptes_gl cg ON le.compte_id = cg.id                         │  │
│  │   WHERE cg.numero LIKE '52%' OR cg.numero LIKE '53%'                 │  │
│  │     OR cg.numero LIKE '573%' OR cg.numero LIKE '512%'                │  │
│  │     AND cg.agence_id = ?                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        FRONTEND                                       │  │
│  │                                                                       │  │
│  │   useEncaisse(agenceId) → /api/treasury/v2/encaisse                  │  │
│  │   - React Query (staleTime: 15s)                                     │  │
│  │   - Invalidé par WebSocket TREASURY_UPDATED                          │  │
│  │   - Affiche breakdown + badge "Source: Grand Livre"                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## C) PLAN DE PRs — ORDRE ET RISQUES

### C.1 Priorisation

| Priorité | PR | Description | Risque | Effort | Dépendances |
|----------|-----|-------------|--------|--------|-------------|
| **P0** | PR-1 | Endpoint canonique `/api/treasury/v2/encaisse` | Faible | 2j | Aucune |
| **P0** | PR-2 | Hook `useEncaisse()` + invalidation WS | Faible | 1j | PR-1 |
| **P1** | PR-3 | Réconciliation automatique GL vs Opérationnel | Moyen | 2j | PR-1 |
| **P1** | PR-4 | Dashboard refactor (source GL) | Moyen | 1j | PR-2 |
| **P2** | PR-5 | Alerting/Monitoring écarts | Faible | 1j | PR-3 |
| **P2** | PR-6 | Dépréciation routes legacy (410 Gone) | Élevé | 1j | PR-4 |
| **P3** | PR-7 | Tests invariants + lint rules | Faible | 1j | PR-6 |

### C.2 Détail des PRs

---

#### PR-1: Endpoint Canonique Encaisse (P0)
**Fichiers**:
- `server/routes/treasury.ts` (nouveau)
- `server/services/treasury/encaisse-service.ts` (nouveau)
- `shared/schema/treasury.ts` (types)

**Implémentation**:
```typescript
// GET /api/treasury/v2/encaisse
app.get("/api/treasury/v2/encaisse", requireAuth, async (req, res) => {
  const agenceId = req.query.agenceId as string;
  const result = await encaisseService.getEncaisseFromGL(agenceId);

  res.setHeader('X-Source', 'GL');
  res.setHeader('X-Computed-At', result.meta.computedAt);
  res.json(result);
});
```

**Risques**:
- Performance si beaucoup d'écritures GL → Ajouter index sur `lignes_ecritures.compte_id` + `comptes_gl.numero`
- Cohérence multi-agence → Filtrer strictement par agenceId

**Critères de validation**:
- [ ] Retourne totalDisponible identique à l'ancien endpoint (à 1 FCFA près)
- [ ] Breakdown par type (caisse/coffre/MM/banque)
- [ ] Meta avec computedAt et lastEcritureId
- [ ] < 100ms pour 100k écritures

---

#### PR-2: Hook useEncaisse (P0)
**Fichiers**:
- `client/src/hooks/finance/useEncaisse.ts` (nouveau)
- `client/src/contexts/WebSocketContext.tsx` (modification)
- `client/src/lib/query-keys.ts` (ajout clés)

**Implémentation**:
```typescript
export function useEncaisse(agenceId?: string) {
  const queryClient = useQueryClient();

  // Invalidation sur TREASURY_UPDATED
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (!agenceId || e.detail.agenceId === agenceId) {
        queryClient.invalidateQueries({ queryKey: treasuryKeys.encaisse(agenceId) });
      }
    };
    window.addEventListener('treasury-updated', handler);
    return () => window.removeEventListener('treasury-updated', handler);
  }, [agenceId, queryClient]);

  return useQuery({
    queryKey: treasuryKeys.encaisse(agenceId),
    queryFn: () => treasuryApi.getEncaisse(agenceId),
    staleTime: 15_000, // 15 secondes
    refetchOnWindowFocus: false, // WS a priorité
  });
}
```

**Risques**:
- Migration progressive nécessaire (garder ancien hook temporairement)

---

#### PR-3: Réconciliation Automatique (P1)
**Fichiers**:
- `server/services/treasury/reconciliation-service.ts` (nouveau)
- `server/routes/treasury.ts` (ajout endpoint)
- `server/cron/treasury-reconciliation.ts` (nouveau)

**Endpoints**:
```typescript
// POST /api/treasury/v2/reconcile — Manuel (admin)
// GET /api/treasury/v2/reconciliation-status — Dernier rapport
```

**Job CRON**: Toutes les heures, compare:
- `SUM(coffres_forts.solde + sessions_caisse.montant_fermeture_theorique)`
- `SUM(GL.comptes_liquidite)`

Si écart > 500 FCFA → Log warning + WebSocket `RECONCILIATION_ALERT`

---

#### PR-4: Dashboard Refactor (P1)
**Fichiers**:
- `client/src/components/dashboard/Dashboard.tsx`
- `client/src/services/stats/dashboard-stats.ts` (modification)

**Changements**:
```tsx
// AVANT
const totalTreasury = stats?.global?.tresorerieDispo || 0;

// APRÈS
const { data: encaisse } = useEncaisse(selectedAgence);
const totalTreasury = encaisse?.totalDisponible || 0;
```

**UI ajoutée**:
- Badge "Source: Grand Livre" à côté du montant
- Tooltip avec breakdown (Caisse/Coffre/MM/Banque)
- Indicateur "Mis à jour à..."

---

#### PR-5: Alerting Écarts (P2)
**Fichiers**:
- `server/services/financial-monitoring-service.ts` (extension)
- `client/src/components/admin/TreasuryReconciliationPanel.tsx` (nouveau)

**Métriques Prometheus**:
```
cofinco_treasury_reconciliation_ecart_fcfa{agence_id="xxx"} 0
cofinco_treasury_gl_posting_failed_total{module="EPARGNE"} 0
```

---

#### PR-6: Dépréciation Routes Legacy (P2)
**Fichiers**:
- `server/routes/dashboard.ts` (410 Gone sur ancien endpoint)
- `server/routes/balances.ts` (deprecation headers)

**Stratégie**:
```typescript
// AVANT: route fonctionnelle
app.get("/api/dashboard/stats", ...);

// APRÈS: 410 Gone avec message
app.get("/api/dashboard/stats", (req, res) => {
  res.status(410).json({
    error: "ENDPOINT_DEPRECATED",
    message: "Utilisez /api/treasury/v2/encaisse pour l'encaisse",
    migration: "https://docs.cofinco.io/migration/v2"
  });
});
```

**Risque élevé**: Casser le frontend si pas migré → Garder 1 sprint de parallèle

---

#### PR-7: Tests Invariants (P3)
**Fichiers**:
- `tests/integration/encaisse-gl-invariant.test.ts` (nouveau)
- `tests/unit/encaisse-calculation.test.ts` (nouveau)
- `.eslintrc.js` (règle custom)

**Tests**:
```typescript
describe('Encaisse Invariants', () => {
  it('Encaisse from GL equals operational caches after sync', async () => {
    // Créer une opération
    await depositToAccount(compteId, 50000);

    // Vérifier GL
    const glEncaisse = await encaisseService.getEncaisseFromGL(agenceId);
    const opEncaisse = await balanceService.getGlobalCashPosition(agenceId);

    expect(glEncaisse.totalDisponible).toBe(opEncaisse.total);
  });

  it('Concurrent debits: only one succeeds', async () => {
    const results = await Promise.allSettled([
      withdrawFromAccount(compteId, 100000),
      withdrawFromAccount(compteId, 100000),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBe(1); // Un seul passe
  });
});
```

**Règle ESLint**:
```javascript
// Interdit reduce() sur transactions pour calculer encaisse
"no-encaisse-reduce": "error"
```

---

## D) TIMELINE RECOMMANDEE

```
Semaine 1:
  Jour 1-2: PR-1 (Endpoint v2)
  Jour 3:   PR-2 (Hook useEncaisse)
  Jour 4-5: PR-3 (Réconciliation)

Semaine 2:
  Jour 1:   PR-4 (Dashboard refactor)
  Jour 2:   PR-5 (Alerting)
  Jour 3:   Tests + Review
  Jour 4:   PR-6 (Dépréciation - feature flag)
  Jour 5:   PR-7 (Tests invariants)

Semaine 3:
  Jour 1-2: Staging tests
  Jour 3:   Production rollout (progressive)
  Jour 4-5: Monitoring + ajustements
```

---

## E) CHECKLIST DE VALIDATION

### E.1 Backend
- [ ] Endpoint `/api/treasury/v2/encaisse` retourne données depuis GL
- [ ] Breakdown par type (caisse/coffre/MM/banque)
- [ ] Réconciliation expose écarts
- [ ] Idempotency sur toutes mutations
- [ ] Logs structurés avec correlationId
- [ ] Métriques Prometheus exposées

### E.2 Frontend
- [ ] `useEncaisse()` remplace calculs locaux
- [ ] Dashboard affiche "Source: GL"
- [ ] Invalidation WebSocket fonctionne
- [ ] Skeleton + offline fallback
- [ ] Pas de reduce() sur transactions

### E.3 Tests
- [ ] Test invariant: Encaisse GL = Opérationnel après sync
- [ ] Test concurrence: 2 débits simultanés
- [ ] Test réconciliation: détection écart
- [ ] Test WS: invalidation sur TREASURY_UPDATED

### E.4 Observabilité
- [ ] Dashboard Grafana avec écarts
- [ ] Alerte si écart > 50k FCFA
- [ ] Log warning si GL posting failed

---

## ANNEXES

### Annexe A: Comptes GL Utilisés
```sql
-- Comptes de liquidité (à sommer pour Encaisse)
521100 - Caisse Centrale
521200 - Caisse Guichet
531100 - Coffre-Fort Central
531200 - Coffre-Fort Agence
573100 - Mobile Money MTN
573200 - Mobile Money Airtel
512100 - Banque Principale

-- Comptes transitoires (informatif uniquement)
581100 - Virements Internes Envoyés
581200 - Virements Internes Reçus
```

### Annexe B: Events WebSocket
```typescript
// Nouveau event pour Encaisse
type: 'TREASURY_UPDATED'
payload: {
  agenceId: string;
  correlationId: string;
  delta?: number;
  newEncaisseSnapshot?: EncaisseCanonique;
  reason: 'POSTING_CONFIRMED' | 'REVERSAL' | 'TRANSFER_VALIDATED' | 'RECONCILIATION';
}
```

### Annexe C: Références Fichiers
| Fichier | Lignes | Description |
|---------|--------|-------------|
| `server/services/balance-service.ts` | 818 | Service centralisé balances |
| `server/services/ledger.ts` | 850+ | Ledger + GL posting |
| `server/services/accounting-posting-service.ts` | 1335 | Posting GL SYSCOHADA |
| `server/services/stats/dashboard-stats.ts` | 181 | Stats actuelles (à migrer) |
| `client/src/hooks/balances/useBalance.ts` | 280 | Hooks actuels |
| `client/src/components/dashboard/Dashboard.tsx` | - | Affichage Encaisse |

---

**FIN DU DOCUMENT D'AUDIT**
