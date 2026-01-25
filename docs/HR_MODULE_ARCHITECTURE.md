# Module RH - Architecture Production-Ready

## 1. ARCHITECTURE CIBLE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MODULE RH - VUE D'ENSEMBLE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Frontend   │  │   Backend   │  │  Database   │  │  WebSocket  │       │
│  │   (React)   │◄─►│  (Express)  │◄─►│ (Postgres)  │◄─►│   Server    │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                             │
│  Composants:        Routes:          Tables:          Events:              │
│  - RessourcesHumaines - /api/hr/*     - employes       - hr:update         │
│  - EmployesList       - /api/employes - demandes_conges - hr:conge:*       │
│  - CongesManager      Middleware:     - formations     - hr:paie:*        │
│  - PaieManager        - CASL ability  - sanctions      - hr:presence:*    │
│  - PresenceTracker    - Auth guard    - bulletins_paie                    │
│  - FormationsManager  - Audit trail   - presences                         │
│  - SanctionsManager                   - horaires_travail                   │
│  - RecrutementManager                 - candidatures                       │
│  - AvantagesManager                   - avantages                          │
│  - OrganigrammeView                   - avantages_employes                 │
│                                       - leave_balances (NEW)               │
│                                       - hr_audit_log (NEW)                 │
│                                       - payroll_config (NEW)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. NOUVELLES TABLES DATABASE

### 2.1 leave_balances (Soldes Congés)
```sql
CREATE TABLE leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  leave_type VARCHAR(50) NOT NULL DEFAULT 'Congé Annuel',
  -- Quotas
  initial_allocation INTEGER NOT NULL DEFAULT 30, -- Jours alloués par an
  acquired INTEGER NOT NULL DEFAULT 0,            -- Jours acquis (prorata)
  used INTEGER NOT NULL DEFAULT 0,                -- Jours utilisés
  pending INTEGER NOT NULL DEFAULT 0,             -- Jours en attente approbation
  balance INTEGER GENERATED ALWAYS AS (acquired - used - pending) STORED,
  -- Règles
  carry_over INTEGER DEFAULT 0,                   -- Report année précédente
  expiry_date DATE,                               -- Date expiration du report
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(employe_id, year, leave_type)
);

CREATE INDEX idx_leave_balances_employe ON leave_balances(employe_id);
CREATE INDEX idx_leave_balances_year ON leave_balances(year);
```

### 2.2 hr_audit_log (Audit Trail RH)
```sql
CREATE TABLE hr_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Target
  entity_type VARCHAR(50) NOT NULL,  -- 'employe', 'conge', 'bulletin', 'sanction', etc.
  entity_id VARCHAR(100) NOT NULL,   -- ID de l'entité concernée
  -- Action
  action VARCHAR(50) NOT NULL,       -- 'created', 'updated', 'approved', 'rejected', 'deleted'
  -- Actor
  actor_user_id UUID REFERENCES users(id),
  actor_name VARCHAR(255),
  actor_role VARCHAR(100),
  -- Changes
  old_values JSONB,
  new_values JSONB,
  diff JSONB,                        -- Computed diff for easy display
  -- Context
  ip_address INET,
  user_agent TEXT,
  reason TEXT,                       -- Motif optionnel
  -- Severity
  severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'critical'
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  agence_id UUID REFERENCES agences(id)
);

CREATE INDEX idx_hr_audit_entity ON hr_audit_log(entity_type, entity_id);
CREATE INDEX idx_hr_audit_actor ON hr_audit_log(actor_user_id);
CREATE INDEX idx_hr_audit_date ON hr_audit_log(created_at DESC);
CREATE INDEX idx_hr_audit_severity ON hr_audit_log(severity) WHERE severity IN ('warning', 'critical');
```

### 2.3 payroll_config (Configuration Paie)
```sql
CREATE TABLE payroll_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scope
  agence_id UUID REFERENCES agences(id), -- NULL = global
  -- Taux cotisations
  cnss_employee_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0500,  -- 5%
  cnss_employer_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0900,  -- 9%
  -- Impôts
  ipr_brackets JSONB NOT NULL DEFAULT '[
    {"min": 0, "max": 524000, "rate": 0},
    {"min": 524001, "max": 1428000, "rate": 0.15},
    {"min": 1428001, "max": 2700000, "rate": 0.30},
    {"min": 2700001, "max": null, "rate": 0.40}
  ]'::jsonb,
  -- Primes fixes configurables
  transport_allowance INTEGER DEFAULT 50000,
  housing_allowance INTEGER DEFAULT 0,
  -- Règles
  overtime_rate NUMERIC(3,2) DEFAULT 1.50,      -- 150%
  night_shift_rate NUMERIC(3,2) DEFAULT 1.25,   -- 125%
  holiday_rate NUMERIC(3,2) DEFAULT 2.00,       -- 200%
  -- Validity
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_payroll_config_active ON payroll_config(is_active, effective_from);
```

### 2.4 Indexes manquants sur tables existantes
```sql
-- demandes_conges
CREATE INDEX idx_demandes_conges_employe ON demandes_conges(employe_id);
CREATE INDEX idx_demandes_conges_statut ON demandes_conges(statut);
CREATE INDEX idx_demandes_conges_dates ON demandes_conges(date_debut, date_fin);

-- bulletins_paie
CREATE INDEX idx_bulletins_paie_employe ON bulletins_paie(employe_id);
CREATE INDEX idx_bulletins_paie_mois ON bulletins_paie(mois);
CREATE INDEX idx_bulletins_paie_statut ON bulletins_paie(statut);

-- presences
CREATE INDEX idx_presences_employe ON presences(employe_id);
CREATE INDEX idx_presences_date ON presences(date);
CREATE INDEX idx_presences_employe_date ON presences(employe_id, date);

-- formations
CREATE INDEX idx_formations_statut ON formations(statut);
CREATE INDEX idx_formations_dates ON formations(date_debut, date_fin);

-- sanctions
CREATE INDEX idx_sanctions_employe ON sanctions(employe_id);
CREATE INDEX idx_sanctions_date ON sanctions(date);

-- candidatures
CREATE INDEX idx_candidatures_statut ON candidatures(statut);

-- avantages_employes
CREATE INDEX idx_avantages_employes_employe ON avantages_employes(employe_id);
```

## 3. LEGACY À SUPPRIMER

### 3.1 Colonne caissePin
La colonne `caissePin` dans la table `employes` doit être migrée vers le module sécurité:

```sql
-- Migration: Déplacer caissePin vers caisse_security_codes
INSERT INTO caisse_security_codes (employe_id, pin_hash, created_at)
SELECT id, caisse_pin, created_at
FROM employes
WHERE caisse_pin IS NOT NULL;

-- Supprimer la colonne de employes
ALTER TABLE employes DROP COLUMN caisse_pin;
```

### 3.2 Fichiers à modifier
| Fichier | Action | Description |
|---------|--------|-------------|
| `shared/schema/employes.ts` | EDIT | Supprimer `caissePin` |
| `server/routes/hr.ts` | EDIT | Ajouter CASL, audit, overlaps |
| `server/storage/hr.ts` | EDIT | Fix N+1, moteur paie configurable |
| `client/src/components/hr/EmployeeForm.tsx` | EDIT | Supprimer champ PIN caisse |

## 4. PERMISSIONS RBAC CASL

### 4.1 Catalogue des permissions HR
```typescript
// shared/ability/hr-permissions.ts
export const HR_PERMISSIONS = {
  // Module level
  'hr.view': 'Accès au module RH',

  // Employés
  'hr.employes.view': 'Voir les employés',
  'hr.employes.create': 'Créer un employé',
  'hr.employes.edit': 'Modifier un employé',
  'hr.employes.delete': 'Supprimer/archiver un employé',

  // Congés
  'hr.conges.view': 'Voir les demandes de congés',
  'hr.conges.create': 'Créer une demande de congé',
  'hr.conges.approve': 'Approuver une demande de congé',
  'hr.conges.reject': 'Rejeter une demande de congé',
  'hr.conges.manage': 'Gérer les soldes de congés',

  // Présence
  'hr.presence.view': 'Voir les présences',
  'hr.presence.checkin': 'Pointer (arrivée/départ)',
  'hr.presence.manage': 'Gérer les présences (correction)',

  // Formations
  'hr.formations.view': 'Voir les formations',
  'hr.formations.create': 'Créer une formation',
  'hr.formations.edit': 'Modifier une formation',
  'hr.formations.delete': 'Supprimer une formation',
  'hr.formations.manage': 'Gérer les participants',

  // Paie
  'hr.paie.view': 'Voir les bulletins de paie',
  'hr.paie.view_own': 'Voir ses propres bulletins',
  'hr.paie.generate': 'Générer la paie mensuelle',
  'hr.paie.validate': 'Valider les bulletins',
  'hr.paie.pay': 'Marquer comme payé',
  'hr.paie.export': 'Exporter les bulletins PDF',
  'hr.paie.config': 'Configurer les paramètres paie',

  // Sanctions
  'hr.sanctions.view': 'Voir les sanctions',
  'hr.sanctions.create': 'Créer une sanction',
  'hr.sanctions.approve': 'Approuver une sanction',
  'hr.sanctions.revoke': 'Révoquer une sanction',

  // Avantages
  'hr.avantages.view': 'Voir les avantages',
  'hr.avantages.assign': 'Assigner un avantage',
  'hr.avantages.manage': 'Gérer le catalogue',

  // Recrutement
  'hr.recrutement.view': 'Voir les candidatures',
  'hr.recrutement.create': 'Créer une candidature',
  'hr.recrutement.edit': 'Modifier une candidature',
  'hr.recrutement.advance': 'Avancer le statut',
  'hr.recrutement.reject': 'Rejeter une candidature',

  // Organigramme
  'hr.organigramme.view': 'Voir l\'organigramme',
  'hr.organigramme.edit': 'Modifier la hiérarchie',

  // Audit
  'hr.audit.view': 'Voir l\'historique des actions RH',
} as const;
```

### 4.2 Mapping Rôles -> Permissions
```typescript
export const HR_ROLE_PERMISSIONS = {
  'admin': ['hr.*'], // Tout

  'chef_agence': [
    'hr.view',
    'hr.employes.view', 'hr.employes.create', 'hr.employes.edit',
    'hr.conges.view', 'hr.conges.approve', 'hr.conges.reject',
    'hr.presence.view', 'hr.presence.manage',
    'hr.formations.view', 'hr.formations.create', 'hr.formations.manage',
    'hr.paie.view', 'hr.paie.generate', 'hr.paie.validate',
    'hr.sanctions.view', 'hr.sanctions.create',
    'hr.avantages.view', 'hr.avantages.assign',
    'hr.recrutement.view', 'hr.recrutement.edit', 'hr.recrutement.advance',
    'hr.organigramme.view',
    'hr.audit.view',
  ],

  'rh': [
    'hr.view',
    'hr.employes.*',
    'hr.conges.*',
    'hr.presence.*',
    'hr.formations.*',
    'hr.paie.*',
    'hr.sanctions.*',
    'hr.avantages.*',
    'hr.recrutement.*',
    'hr.organigramme.*',
    'hr.audit.view',
  ],

  'manager': [
    'hr.view',
    'hr.employes.view',
    'hr.conges.view', 'hr.conges.approve', 'hr.conges.reject', // Subordonnés uniquement
    'hr.presence.view',
    'hr.formations.view',
    'hr.sanctions.view', 'hr.sanctions.create', // Subordonnés uniquement
    'hr.organigramme.view',
  ],

  'employe': [
    'hr.view',
    'hr.conges.view', 'hr.conges.create', // Propres demandes uniquement
    'hr.presence.view', 'hr.presence.checkin',
    'hr.formations.view',
    'hr.paie.view_own',
    'hr.organigramme.view',
  ],
};
```

## 5. CONTRATS API

### 5.1 Format de réponse standardisé
```typescript
// Succès
{
  success: true,
  data: T | T[],
  meta?: {
    total: number,
    page: number,
    limit: number,
    hasMore: boolean
  }
}

// Erreur
{
  success: false,
  code: string,        // 'VALIDATION_ERROR', 'NOT_FOUND', 'FORBIDDEN', etc.
  message: string,
  details?: any
}
```

### 5.2 Endpoints Congés (mise à jour)
```
GET    /api/hr/conges
  Query: statut?, employeId?, dateDebut?, dateFin?, page?, limit?
  Response: { success: true, data: DemandeConge[], meta: Pagination }

POST   /api/hr/conges
  Body: { employeId, type, dateDebut, dateFin, motif? }
  Validations:
    - dateFin >= dateDebut
    - Pas de chevauchement avec congés existants
    - Solde suffisant (leave_balances)
  Response: { success: true, data: DemandeConge }

PATCH  /api/hr/conges/:id/approve
  Body: { commentaire? }
  Permissions: hr.conges.approve
  Response: { success: true, data: DemandeConge }
  Side Effects:
    - Décrémenter leave_balances.pending
    - Incrémenter leave_balances.used
    - Audit log
    - WebSocket: hr:conge:approved

PATCH  /api/hr/conges/:id/reject
  Body: { commentaire }
  Permissions: hr.conges.reject
  Response: { success: true, data: DemandeConge }
  Side Effects:
    - Décrémenter leave_balances.pending
    - Audit log
    - WebSocket: hr:conge:rejected

GET    /api/hr/conges/balance/:employeId
  Response: { success: true, data: LeaveBalance[] }
```

### 5.3 Endpoints Paie (mise à jour)
```
POST   /api/hr/paie/generate
  Body: { mois: 'YYYY-MM' }
  Permissions: hr.paie.generate
  Validations:
    - Mois non déjà généré (409 si existe)
  Process:
    1. Charger payroll_config actif
    2. Pour chaque employé actif:
       a. Calculer brut (salaire + primes + avantages)
       b. Calculer retenues (CNSS, IPR selon brackets)
       c. Calculer net
    3. Créer bulletins en DRAFT
  Response: { success: true, data: { generated: number, bulletins: BulletinPaie[] } }

PATCH  /api/hr/paie/validate
  Body: { bulletinIds: number[] }
  Permissions: hr.paie.validate
  Response: { success: true, data: { validated: number } }
  Side Effects:
    - Statut -> VALIDATED
    - Audit log

PATCH  /api/hr/paie/pay
  Body: { bulletinIds: number[], datePaiement: Date }
  Permissions: hr.paie.pay
  Response: { success: true, data: { paid: number } }
  Side Effects:
    - Statut -> PAID
    - Audit log
    - WebSocket: hr:paie:paid

GET    /api/hr/paie/config
  Permissions: hr.paie.config
  Response: { success: true, data: PayrollConfig }

PUT    /api/hr/paie/config
  Body: PayrollConfig
  Permissions: hr.paie.config
  Response: { success: true, data: PayrollConfig }
```

## 6. EVENTS WEBSOCKET

### 6.1 Format standardisé
```typescript
interface HrUpdateEvent {
  type: 'HR_UPDATE';
  payload: {
    entity: 'employe' | 'conge' | 'presence' | 'paie' | 'bulletin' |
            'formation' | 'sanction' | 'avantage' | 'candidature' | 'organigramme';
    action: 'created' | 'updated' | 'approved' | 'rejected' | 'paid' |
            'deleted' | 'assigned' | 'generated';
    id: string | number;
    agenceId?: string;
    employeId?: string;
    timestamp: string; // ISO
    actor?: {
      id: string;
      name: string;
    };
  };
}
```

### 6.2 Liste des events
| Event | Trigger | Payload Extra |
|-------|---------|---------------|
| `hr:conge:created` | POST /conges | `{ daysRequested }` |
| `hr:conge:approved` | PATCH /conges/:id/approve | `{ approvedBy }` |
| `hr:conge:rejected` | PATCH /conges/:id/reject | `{ rejectedBy, reason }` |
| `hr:presence:checkin` | POST /presence/checkin | `{ time }` |
| `hr:presence:checkout` | POST /presence/checkout | `{ time, hoursWorked }` |
| `hr:paie:generated` | POST /paie/generate | `{ month, count }` |
| `hr:paie:validated` | PATCH /paie/validate | `{ count }` |
| `hr:paie:paid` | PATCH /paie/pay | `{ count, total }` |
| `hr:formation:created` | POST /formations | - |
| `hr:formation:participant_added` | POST /formations/:id/participants | `{ employeId }` |
| `hr:sanction:created` | POST /sanctions | `{ severity }` |
| `hr:avantage:assigned` | POST /avantages/assign | `{ avantageId }` |
| `hr:candidature:status_changed` | PATCH /candidatures/:id | `{ oldStatus, newStatus }` |

### 6.3 Diffusion
```typescript
// Dans hr.ts
function broadcastHrUpdate(
  entity: string,
  action: string,
  id: string | number,
  extra: any = {},
  agenceId?: string
) {
  const wsInstance = getWsInstance();
  if (!wsInstance) return;

  const payload = {
    entity,
    action,
    id,
    agenceId,
    timestamp: new Date().toISOString(),
    ...extra
  };

  if (agenceId) {
    // Broadcast to agency only
    wsInstance.broadcastToAgency(agenceId, { type: 'HR_UPDATE', payload });
  } else {
    // Broadcast to all HR viewers
    wsInstance.broadcast({ type: 'HR_UPDATE', payload });
  }
}
```

## 7. WORKFLOW CONGÉS DÉTAILLÉ

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW DEMANDE DE CONGÉ                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐                                                  │
│   │ Employé  │                                                  │
│   │ soumet   │                                                  │
│   │ demande  │                                                  │
│   └────┬─────┘                                                  │
│        │                                                        │
│        ▼                                                        │
│   ┌──────────────────────────────────┐                         │
│   │ Validations:                      │                         │
│   │ 1. dateFin >= dateDebut          │                         │
│   │ 2. Pas chevauchement existant    │                         │
│   │ 3. Solde suffisant               │                         │
│   └────┬────────────────┬────────────┘                         │
│        │ OK             │ KO                                    │
│        ▼                ▼                                       │
│   ┌─────────┐     ┌─────────┐                                  │
│   │ DRAFT   │     │ ERREUR  │                                  │
│   │ créé    │     │ 400     │                                  │
│   └────┬────┘     └─────────┘                                  │
│        │                                                        │
│        │ (Direction auto-approve)                               │
│        ├─────────────────────────┐                             │
│        ▼                         ▼                              │
│   ┌─────────┐              ┌──────────┐                        │
│   │ PENDING │──────────────│ APPROVED │ (si Direction)         │
│   │         │              │          │                         │
│   └────┬────┘              └─────┬────┘                        │
│        │                         │                              │
│        │ Manager/RH review       │                              │
│        │                         │                              │
│   ┌────┴────┐                    │                              │
│   │         │                    │                              │
│   ▼         ▼                    │                              │
│ ┌────────┐ ┌─────────┐          │                              │
│ │APPROVED│ │REJECTED │          │                              │
│ └───┬────┘ └────┬────┘          │                              │
│     │           │                │                              │
│     │           │                │                              │
│     ▼           ▼                ▼                              │
│ ┌───────────────────────────────────┐                          │
│ │ Side Effects:                      │                          │
│ │ - Update leave_balances           │                          │
│ │ - Audit log entry                 │                          │
│ │ - WebSocket notification          │                          │
│ │ - Email notification (future)     │                          │
│ └───────────────────────────────────┘                          │
│                                                                  │
│ Optionnel:                                                       │
│   ┌──────────┐                                                  │
│   │CANCELLED │ (employé annule avant décision)                  │
│   └──────────┘                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 8. MOTEUR DE PAIE

### 8.1 Algorithme de calcul
```typescript
interface PayrollCalculation {
  // Input
  employe: Employe;
  config: PayrollConfig;
  avantages: AvantageEmploye[];
  presences: Presence[]; // du mois

  // Output
  calculate(): BulletinPaie;
}

function calculatePayroll(input: PayrollCalculation): BulletinPaieData {
  const { employe, config, avantages, presences } = input;

  // 1. Salaire de base selon mode
  let salaireBase = 0;
  switch (employe.modeCalculPaie) {
    case 'MONTHLY':
      salaireBase = employe.salaireBase;
      break;
    case 'HOURLY':
      const heuresTravaillees = presences.reduce((sum, p) => sum + (p.heuresTravaillees || 0), 0) / 60;
      salaireBase = employe.tauxHoraire * heuresTravaillees;
      break;
    case 'DAILY':
      const joursTravailles = presences.filter(p => p.statut === 'Présent').length;
      salaireBase = employe.tauxJournalier * joursTravailles;
      break;
  }

  // 2. Primes
  const primeTransport = config.transport_allowance;
  const primeAnciennete = calculateSeniorityBonus(employe.dateEmbauche, salaireBase);
  const autresPrimes = avantages
    .filter(a => a.statut === 'ACTIVE')
    .reduce((sum, a) => sum + a.montant, 0);

  // 3. Heures supplémentaires
  const heuresSupp = presences.reduce((sum, p) => sum + (p.heuresSupplementaires || 0), 0) / 60;
  const primeHeuresSupp = Math.round(heuresSupp * (employe.tauxHoraire || salaireBase / 173) * config.overtime_rate);

  // 4. Salaire brut
  const salaireBrut = salaireBase + primeTransport + primeAnciennete + autresPrimes + primeHeuresSupp;

  // 5. Cotisations CNSS
  const cnssEmploye = Math.round(salaireBrut * config.cnss_employee_rate);
  const cnssPatronale = Math.round(salaireBrut * config.cnss_employer_rate);

  // 6. IPR (impôt progressif)
  const baseImposable = salaireBrut - cnssEmploye;
  const ipr = calculateIPR(baseImposable, config.ipr_brackets);

  // 7. Retenues totales
  const totalRetenues = cnssEmploye + ipr;

  // 8. Net à payer
  const salaireNet = salaireBrut - totalRetenues;

  return {
    salaireBase: salaireBase.toString(),
    primeAnciennete: primeAnciennete.toString(),
    primeTransport: primeTransport.toString(),
    autresPrimes: autresPrimes.toString(),
    salaireBrut: salaireBrut.toString(),
    cnssEmploye: cnssEmploye.toString(),
    cnssPatronale: cnssPatronale.toString(),
    ipr: ipr.toString(),
    totalRetenues: totalRetenues.toString(),
    salaireNet: salaireNet.toString(),
  };
}

function calculateIPR(baseImposable: number, brackets: IprBracket[]): number {
  let impot = 0;
  let remaining = baseImposable;

  for (const bracket of brackets) {
    if (remaining <= 0) break;

    const taxable = bracket.max
      ? Math.min(remaining, bracket.max - bracket.min)
      : remaining;

    impot += Math.round(taxable * bracket.rate);
    remaining -= taxable;
  }

  return impot;
}
```

## 9. PLAN DE REFACTORING FRONTEND

### 9.1 Composants à modifier
| Composant | Modifications |
|-----------|---------------|
| `RessourcesHumaines.tsx` | Ajouter gestion temps réel, indicateur sync |
| `CongesManager.tsx` | Afficher soldes, validation overlaps |
| `PaieManager.tsx` | Workflow complet DRAFT->VALIDATED->PAID |
| `PresenceTracker.tsx` | Améliorer subscriptions WebSocket |
| `EmployeeForm.tsx` | Supprimer champ PIN caisse |
| `hooks/useHrRealtime.ts` | NOUVEAU: hook temps réel HR |

### 9.2 Nouveau hook useHrRealtime
```typescript
// client/src/hooks/hr/useHrRealtime.ts
export function useHrRealtime(options: {
  entities?: HrEntity[];
  onUpdate?: (event: HrUpdateEvent) => void;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (event: CustomEvent<HrUpdateEvent['payload']>) => {
      const { entity, action } = event.detail;

      // Invalider les queries concernées
      queryClient.invalidateQueries({
        queryKey: ['/api/hr', entity]
      });

      // Callback custom
      options.onUpdate?.(event.detail);
    };

    window.addEventListener('hr-update', handler as EventListener);
    return () => window.removeEventListener('hr-update', handler as EventListener);
  }, [queryClient, options.onUpdate]);
}
```

## 10. TESTS MINIMAUX

### 10.1 Tests Congés
```typescript
// tests/hr/conges.test.ts
describe('Leave Request Workflow', () => {
  it('should reject overlapping leave requests', async () => {
    // Setup: Create existing approved leave
    await createLeave({ dateDebut: '2024-01-15', dateFin: '2024-01-20', statut: 'APPROVED' });

    // Test: Try to create overlapping request
    const response = await request(app)
      .post('/api/hr/conges')
      .send({ dateDebut: '2024-01-18', dateFin: '2024-01-25' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('OVERLAP_ERROR');
  });

  it('should reject when insufficient balance', async () => {
    // Setup: Employee with 5 days balance
    await setLeaveBalance({ employeId, acquired: 5, used: 0 });

    // Test: Request 10 days
    const response = await request(app)
      .post('/api/hr/conges')
      .send({ dateDebut: '2024-01-01', dateFin: '2024-01-10' }); // 10 days

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INSUFFICIENT_BALANCE');
  });
});
```

### 10.2 Tests Paie
```typescript
// tests/hr/paie.test.ts
describe('Payroll Calculation', () => {
  it('should calculate net salary correctly for monthly employee', async () => {
    const result = calculatePayroll({
      employe: { salaireBase: 1000000, modeCalculPaie: 'MONTHLY' },
      config: { cnss_employee_rate: 0.05, ipr_brackets: [...] },
      avantages: [{ montant: 50000 }],
      presences: [],
    });

    expect(result.salaireBrut).toBe('1100000'); // 1M + 50k transport + 50k avantage
    expect(result.cnssEmploye).toBe('55000');   // 5% of 1.1M
    // ... etc
  });

  it('should calculate hourly employee based on worked hours', async () => {
    const result = calculatePayroll({
      employe: { tauxHoraire: 5000, modeCalculPaie: 'HOURLY' },
      presences: [
        { heuresTravaillees: 480 }, // 8h
        { heuresTravaillees: 480 },
        // ... 20 days
      ],
    });

    // 160h * 5000 = 800,000
    expect(result.salaireBase).toBe('800000');
  });
});
```

## 11. CHECKLIST QA PRODUCTION

### Pre-deployment
- [ ] Migrations exécutées sans erreur
- [ ] Indexes créés sur toutes les tables HR
- [ ] payroll_config initialisé avec valeurs par défaut
- [ ] Données legacy migrées (caissePin -> caisse_security_codes)

### Functional Tests
- [ ] Création demande de congé
- [ ] Validation overlap fonctionne
- [ ] Validation solde fonctionne
- [ ] Approbation/rejet congé met à jour leave_balances
- [ ] Génération paie calcule correctement
- [ ] Validation paie change statut
- [ ] Paiement paie change statut + date
- [ ] Pointage présence (checkin/checkout/breaks)
- [ ] WebSocket events reçus sur toutes les actions

### RBAC Tests
- [ ] Employé ne peut voir que ses propres congés
- [ ] Employé ne peut voir que ses propres bulletins
- [ ] Manager peut approuver les congés de ses subordonnés
- [ ] RH a accès complet au module
- [ ] Admin a accès complet

### Real-time Tests
- [ ] Event congé reçu après création
- [ ] Event paie reçu après génération
- [ ] UI se met à jour sans refresh
- [ ] Cross-tab sync fonctionne
- [ ] Reconnexion WebSocket fonctionne

### Performance Tests
- [ ] Liste employés < 500ms pour 1000 employés
- [ ] Génération paie < 30s pour 500 employés
- [ ] Pas de N+1 queries (vérifier logs)

### Security Tests
- [ ] Routes protégées par auth
- [ ] Routes protégées par CASL
- [ ] Audit log enregistre les actions sensibles
- [ ] Pas d'injection SQL possible
- [ ] Pas de XSS dans les champs texte

## 12. COMMANDES DE DÉPLOIEMENT

### Appliquer les migrations
```bash
# Appliquer la migration HR production-ready
npx drizzle-kit push

# Ou manuellement
psql -d cofinco -f migrations/0035_hr_production_ready.sql
```

### Lancer les tests
```bash
# Tests HR uniquement
npx vitest run server/tests/hr/

# Tous les tests
npx vitest run
```

### Vérifier le build
```bash
npm run build
npm run typecheck
```

## 13. FICHIERS MODIFIÉS/CRÉÉS

### Nouveaux fichiers
| Fichier | Description |
|---------|-------------|
| `migrations/0035_hr_production_ready.sql` | Migration tables HR + indexes |
| `server/services/hr-service.ts` | Service HR (congés, paie, audit) |
| `server/tests/hr/leave.test.ts` | Tests congés |
| `server/tests/hr/payroll.test.ts` | Tests paie |
| `docs/HR_MODULE_ARCHITECTURE.md` | Documentation architecture |

### Fichiers modifiés
| Fichier | Modifications |
|---------|---------------|
| `shared/schema/hr.ts` | Nouvelles tables + types |
| `shared/ability/subjects.ts` | Sujets CASL HR |
| `server/routes/hr.ts` | Endpoints améliorés + audit + temps réel |
| `client/src/hooks/hr/useHrRealtime.ts` | Hook temps réel |
| `client/src/components/hr/CongesManager.tsx` | Intégration soldes + temps réel |

## 14. RÉSUMÉ DES AMÉLIORATIONS

### Backend
- ✅ Table `leave_balances` pour gestion soldes congés
- ✅ Table `hr_audit_log` pour traçabilité actions RH
- ✅ Table `payroll_config` pour paramètres paie configurables
- ✅ Validation chevauchement congés côté serveur
- ✅ Validation solde congés avant création demande
- ✅ Moteur de paie avec calcul IPR configurable
- ✅ Fix N+1 query sur formations (JOIN + GROUP BY)
- ✅ Pagination standardisée sur endpoints listes
- ✅ Format de réponse unifié (success/error)
- ✅ Broadcast WebSocket temps réel sur toutes les mutations
- ✅ Audit trail automatique sur actions sensibles

### Frontend
- ✅ Hook `useHrRealtime` pour synchronisation temps réel
- ✅ Indicateur de statut sync (connecté/synchronisation)
- ✅ Affichage solde congés dans CongesManager
- ✅ Validation client-side avant soumission
- ✅ Notifications toast sur événements temps réel
- ✅ Cross-tab synchronization via BroadcastChannel

### Sécurité
- ✅ Vérification hiérarchie manager pour approbations
- ✅ CASL permissions granulaires par entité HR
- ✅ Audit log avec actor, old/new values, severity

### Performance
- ✅ Indexes sur toutes les colonnes FK et filtres fréquents
- ✅ Élimination des N+1 queries
- ✅ Pagination côté serveur
