# COFINCO - Seed Readiness Report

**Date:** 2026-01-25
**Version:** 2.0 Production-Ready

---

## 1. EXECUTIVE SUMMARY

Ce rapport documente l'analyse complète du système de seed actuel et propose une refonte majeure pour garantir un déploiement production-ready dès le premier lancement.

### Problèmes critiques identifiés:
- **NON-IDEMPOTENT**: Le seed utilise DELETE + INSERT au lieu d'UPSERT
- **DELETE DANGEREUX**: Supprime users, employes, agences sans vérifier les données métier
- **NON TRANSACTIONNEL**: Si une partie échoue, la base reste corrompue
- **GAPS DE CONFIGURATION**: Tables critiques non seedées (caisses, payrollConfig, etc.)
- **PASSWORD EN CLAIR**: "password123" hardcodé dans le code
- **SYNC DESYNC**: maintenanceModules (27) vs modules RBAC (32)

---

## 2. GAP ANALYSIS

### 2.1 Tables Seedées vs Requises

| Catégorie | Table | Seedée | Critique | Notes |
|-----------|-------|--------|----------|-------|
| **AUTH/RBAC** | users | ✅ | ✅ | OK |
| | userRoles | ✅ | ✅ | OK |
| | modules | ✅ | ✅ | OK |
| | permissions | ✅ | ✅ | OK |
| | rolePermissions | ✅ | ✅ | OK |
| | userAgences | ✅ | ✅ | OK |
| **GEOGRAPHY** | zones | ✅ | ✅ | OK |
| | agences | ✅ | ✅ | OK |
| **SETTINGS** | systemSettings | ✅ | ✅ | OK |
| | securitySettings | ✅ | ✅ | OK |
| | uiCustomization | ✅ | ✅ | OK |
| | featureFlags | ✅ | ✅ | OK |
| | smsTemplates | ✅ | ⚠️ | OK |
| | smsProviderSettings | ✅ | ⚠️ | OK |
| | maintenanceModules | ✅ | ✅ | **DESYNC: 27 vs 32** |
| **PRODUCTS** | produitsCompte | ✅ | ✅ | OK |
| | creditPlans | ✅ | ✅ | OK |
| | dureesSuggerees | ✅ | ✅ | OK |
| | configReevaluation | ✅ | ⚠️ | OK |
| | interestRates | ❌ | ⚠️ | **MANQUANT** |
| **COFFRE** | coffresForts | ✅ | ✅ | OK |
| | comptesLiaison | ✅ | ✅ | OK |
| | configCoffreFort | ✅ | ✅ | OK |
| | configTransfertInterCoffres | ✅ | ✅ | OK |
| **CAISSE** | caisses | ❌ | ✅ | **CRITIQUE: MANQUANT** |
| **COMPTABILITÉ** | exercices | ✅ | ✅ | OK |
| | journaux | ✅ | ✅ | OK mais incomplet |
| | planComptable | ✅ | ✅ | **INCOMPLET: 22 vs 50+ requis** |
| | accountingRules | ❌ | ⚠️ | **MANQUANT** |
| **HR** | departments | ✅ | ✅ | OK |
| | jobPositions | ✅ | ✅ | OK |
| | employes | ✅ | ✅ | OK |
| | payrollConfig | ❌ | ✅ | **CRITIQUE: MANQUANT** |
| **BUSINESS** | typesMarches | ✅ | ✅ | OK |
| | tags | ✅ | ⚠️ | OK |
| **TONTINES** | tontinePlans | ❌ | ⚠️ | MANQUANT |
| | tontineRulesets | ❌ | ⚠️ | MANQUANT |

### 2.2 Comptes Plan Comptable Manquants (Microfinance)

Le seed actuel a 22 comptes OHADA basiques. Les comptes spécifiques microfinance manquent:

```
# Classe 4 - Tiers (Microfinance)
411100 - Clients - Crédits en cours
411200 - Clients - Crédits en souffrance
419000 - Clients - Avances et acomptes

# Classe 5 - Trésorerie (Coffre/Caisse)
531000 - Coffre-fort central
532000 - Coffre-fort agence
571000 - Caisse principale
572000 - Caisses annexes
581000 - Virements internes (déjà créé)
585000 - Virements internes Mobile Money

# Classe 6 - Charges
627100 - Commissions Mobile Money
627200 - Frais bancaires
661000 - Charges d'intérêts
669000 - Autres charges financières

# Classe 7 - Produits
706100 - Intérêts sur crédits
706200 - Intérêts sur découverts
708100 - Frais de dossier crédit
708200 - Frais de tenue de compte
708300 - Commissions de gestion
```

### 2.3 maintenanceModules vs modules RBAC

**Modules seedés dans maintenanceModules (27):**
Dashboard, Caisse, Crédits, Remboursements, Clients, Comptes, Tontines, Comptabilité, Agent Terrain, CaisseAgent, Transferts, Virements Programmes, Rapports, RH, Communications, Bourse, Loge, Paramètres, Administration, Audit, Messages, Coffre-Fort, Incidents, Visites, Prospection, Paiements Agent, PLATFORM

**Modules dans MODULES_DATA RBAC (32):**
+RBAC, +Maintenance, +Fidélité, +Régularisation, +Départements, +Employés, +Agences
-PLATFORM (non présent dans RBAC)

**Action requise:** Synchroniser les deux sources et ajouter les modules manquants.

---

## 3. LEGACY À SUPPRIMER

### 3.1 Fichiers obsolètes
Aucun fichier seed obsolète détecté. Les 3 fichiers sont complémentaires:
- `seed-prod.ts` - Production
- `seed-demo-simple.ts` - Demo
- `seed-rbac-logic.ts` - Logique RBAC partagée

### 3.2 Code à refactorer
- **seed-prod.ts:692** - Password hardcodé `password123` → utiliser `process.env.SEED_ADMIN_PASSWORD`
- **seed-prod.ts:199-269** - DELETE cascadé dangereux → utiliser preflight check + upsert

### 3.3 Colonnes potentiellement legacy
- `employes.caissePin` - Mentionné dans le contexte mais usage à vérifier (peut-être migration vers caisseSecurityCodes)

---

## 4. ARCHITECTURE NOUVEAU SEED

### 4.1 Structure modulaire

```
server/
├── seed-prod.ts              # Point d'entrée principal (refactorisé)
├── seed/
│   ├── index.ts              # Orchestrateur avec preflight check
│   ├── modules/
│   │   ├── geography.ts      # seedGeography()
│   │   ├── auth-rbac.ts      # seedAuthAndRBAC()
│   │   ├── settings.ts       # seedCoreSettings()
│   │   ├── products.ts       # seedProductsCatalog()
│   │   ├── accounting.ts     # seedAccountingBootstrap()
│   │   ├── vault.ts          # seedVaultAndTransfersConfig()
│   │   ├── hr.ts             # seedHRBootstrap()
│   │   ├── maintenance.ts    # seedMaintenanceModules()
│   │   └── automations.ts    # seedAutomationsDefaults()
│   ├── utils/
│   │   ├── upsert.ts         # Helpers upsert génériques
│   │   └── validation.ts     # validateProdBootstrap()
│   └── data/
│       ├── plan-comptable-ohada.ts
│       ├── zones-congo.ts
│       └── permissions.ts
```

### 4.2 Modes d'exécution

| Commande | Description |
|----------|-------------|
| `pnpm seed:prod` | Bootstrap complet (base vide) ou Config Sync (base peuplée) |
| `pnpm seed:prod --force-reset-config` | Force le reset des tables config (dangereux) |
| `pnpm seed:prod --dry-run` | Affiche les actions sans écrire |

### 4.3 Preflight Check

```typescript
async function detectContext(): Promise<'EMPTY' | 'SEEDED' | 'PRODUCTION'> {
  const clientCount = await db.select({ count: count() }).from(clients);
  const compteCount = await db.select({ count: count() }).from(comptes);
  const mouvementCount = await db.select({ count: count() }).from(mouvementsFinanciers);

  if (clientCount[0].count > 0 || compteCount[0].count > 0 || mouvementCount[0].count > 0) {
    return 'PRODUCTION'; // Données métier présentes → Config Sync only
  }

  const userCount = await db.select({ count: count() }).from(users);
  if (userCount[0].count > 0) {
    return 'SEEDED'; // Déjà seedé mais pas de données métier
  }

  return 'EMPTY'; // Base vierge
}
```

### 4.4 Stratégie par table

| Table | EMPTY | SEEDED | PRODUCTION |
|-------|-------|--------|------------|
| users | INSERT | UPSERT (admin only) | UPSERT (admin only) |
| agences | INSERT | UPSERT | SKIP |
| zones | INSERT | UPSERT | SKIP |
| modules | INSERT | UPSERT | UPSERT |
| permissions | INSERT | UPSERT | UPSERT |
| rolePermissions | INSERT | DELETE+INSERT | DELETE+INSERT |
| systemSettings | INSERT | UPSERT | SKIP |
| maintenanceModules | INSERT | UPSERT | UPSERT |
| planComptable | INSERT | UPSERT | UPSERT (isSystem only) |
| caisses | INSERT | UPSERT | SKIP |
| coffresForts | INSERT | UPSERT | SKIP |

---

## 5. INVARIANTS DE VALIDATION

Après exécution du seed, `validateProdBootstrap()` vérifie:

```typescript
const INVARIANTS = [
  // Geography
  'Au moins 1 agence (Siège) existe',
  'Au moins 1 zone existe',

  // Auth
  'Au moins 1 user ADMIN existe avec canLogin=true',
  'userRoles contient au moins 1 entrée ADMIN avec isPrimary=true',

  // RBAC
  'modules.count >= 32',
  'permissions.count >= 100',
  'rolePermissions pour ADMIN couvre toutes les permissions',

  // Settings
  'systemSettings existe (non null)',
  'securitySettings existe avec passwordMinLength >= 8',

  // Accounting
  'exercices contient au moins 1 exercice avec statut=OPEN',
  'planComptable contient au moins 30 comptes',
  'journaux contient au moins 5 journaux (CAISSE, BANK, ACHAT, VENTE, OD)',

  // Vault/Treasury
  'coffresForts contient au moins 1 coffre (CF-SIEGE)',
  'comptesLiaison contient au moins 1 compte (LIAISON-SIEGE)',
  'configTransfertInterCoffres existe (global config)',

  // Caisse
  'caisses contient au moins 1 caisse liée au Siège',
  'configCoffreFort existe pour chaque agence',

  // HR
  'departments.count >= 5',
  'jobPositions.count >= 10',
  'employes contient au moins 1 employé (admin)',
  'payrollConfig existe (global)',

  // Maintenance
  'maintenanceModules couvre tous les modules RBAC',
];
```

---

## 6. CHECKLIST QA POST-SEED

### 6.1 Tests API
- [ ] `POST /api/auth/login` avec admin → session créée
- [ ] `GET /api/dashboard/stats` → pas d'erreur 500
- [ ] `GET /api/agences` → retourne Siège
- [ ] `GET /api/rbac/modules` → retourne 32+ modules
- [ ] `GET /api/rbac/my-permissions` → retourne permissions admin
- [ ] `GET /api/coffre/balance` → retourne solde coffre
- [ ] `GET /api/caisse/sessions` → pas d'erreur (peut être vide)
- [ ] `GET /api/comptabilite/plan-comptable` → retourne 30+ comptes
- [ ] `GET /api/hr/config/payroll` → retourne config paie

### 6.2 Tests UI
- [ ] Login admin → Dashboard s'affiche sans erreur
- [ ] Sidebar → Tous les modules accessibles
- [ ] Caisse → Page s'affiche (même sans session)
- [ ] Coffre-Fort → Solde affiché
- [ ] Comptabilité → Plan comptable listable
- [ ] Administration → Page accessible
- [ ] RH → Employé admin visible

### 6.3 Tests WebSocket
- [ ] Connexion WS établie après login
- [ ] `DASHBOARD_UPDATE` reçu après connexion
- [ ] `BALANCE_UPDATED` fonctionnel

---

## 7. MIGRATIONS REQUISES

Aucune migration schéma requise. Les tables existent déjà.

Cependant, le seed doit créer les données manquantes:
1. Caisse du siège
2. payrollConfig global
3. Plan comptable étendu (comptes microfinance)
4. accountingRules de base
5. maintenanceModules synchronisés

---

## 8. RISQUES ET MITIGATIONS

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Seed corrompt données prod | CRITIQUE | Preflight check détecte données métier → Config Sync only |
| Password admin faible | ÉLEVÉ | Utiliser env var + force change au 1er login |
| Rollback échoue | ÉLEVÉ | Transactions par bloc avec savepoints |
| Module RBAC manquant | MOYEN | Validation post-seed vérifie cohérence |
| FK constraint violation | MOYEN | Ordre de seed respecte les dépendances |

---

## 9. PLAN D'IMPLÉMENTATION

### Phase 1: Refactor seed-prod.ts
1. Ajouter preflight check
2. Refactorer en modules
3. Implémenter upsert patterns
4. Ajouter transactions par bloc

### Phase 2: Compléter les données
1. Ajouter caisses (au moins Siège)
2. Ajouter payrollConfig
3. Étendre plan comptable microfinance
4. Synchroniser maintenanceModules

### Phase 3: Validation
1. Implémenter validateProdBootstrap()
2. Ajouter script dry-run
3. Tests automatisés post-seed

### Phase 4: Documentation
1. Mettre à jour README avec nouvelles commandes
2. Documenter les variables d'environnement
3. Guide de recovery en cas d'échec

---

**Auteur:** Claude Code
**Statut:** Prêt pour implémentation
