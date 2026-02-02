# Changelog: Implémentation du Mode GL Strict

**Date**: 2026-02-02
**Objectif**: Garantir la cohérence entre soldes opérationnels et soldes comptables (GL)

---

## 🎯 Problème Résolu

### Symptômes
- Écarts entre soldes opérationnels (coffres_forts.solde, caisses.solde) et soldes GL (lignes_ecritures)
- Exemple détecté: 10,080,000 FCFA d'écart sur les caisses
- Mouvements avec `glPostingStatus='FAILED'` mais opérations quand même enregistrées

### Cause Racine
Le système utilisait un modèle "best-effort" pour le posting GL:
- Les mouvements et soldes étaient mis à jour
- Le posting GL était tenté ensuite
- **Si le GL échouait, l'opération continuait quand même** (ligne 302 de transfer-executor.ts)
- Résultat: Soldes opérationnels ≠ Soldes GL

---

## ✅ Solution Implémentée

### Architecture: Transaction Atomique avec Validation Préalable

```
┌─────────────────────────────────────────────────┐
│ 1. VALIDATION PRÉALABLE                         │
│    └─> Règle comptable existe?                  │
│        ├─ OUI → Continuer                       │
│        └─ NON → ERREUR (mode STRICT)            │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ 2. TRANSACTION ATOMIQUE                         │
│    ├─> Créer mouvement financier                │
│    ├─> Mettre à jour soldes opérationnels       │
│    └─> Créer écriture GL (OBLIGATOIRE)          │
│        ├─ SUCCÈS → COMMIT (tout est sauvegardé) │
│        └─ ÉCHEC → ROLLBACK (rien n'est sauvé)   │
└─────────────────────────────────────────────────┘
```

---

## 📁 Fichiers Créés

### 1. `server/services/accounting-validation.ts`
Service de validation des règles comptables

**Fonctions principales:**
- `validateAccountingRule(eventType, agenceId)`: Vérifie qu'une règle existe
- `handleGLPostingFailure(error, context)`: Gère les erreurs selon le mode
- `isGLStrictMode()`: Détecte si mode STRICT activé

### 2. `scripts/verify-accounting-rules-completeness.ts`
Script de vérification de complétude des règles

**Usage:**
```bash
npm run verify:accounting-rules
```

**Sortie:**
- Liste tous les types d'événements requis
- Identifie les règles manquantes
- Exit code 1 si règles manquantes (utilisable en CI/CD)

### 3. `scripts/diagnose-balance-issues.ts`
Script de diagnostic des écarts de balance

**Usage:**
```bash
npm run diagnose:balance
```

**Analyse:**
- Compare soldes opérationnels vs GL par entité
- Identifie les mouvements avec glPostingStatus='FAILED'
- Liste les écritures GL récentes

### 4. `.env.example`
Documentation de la configuration

**Variable ajoutée:**
```bash
GL_POSTING_MODE=LENIENT  # ou STRICT
```

### 5. `IMPLEMENTATION_GL_STRICT.md`
Guide complet d'implémentation avec stratégie de migration

---

## 🔧 Fichiers Modifiés

### 1. `server/services/coffre/transfer-executor.ts`

**Modifications:**

#### a) Import du service de validation (ligne ~19)
```typescript
import { validateAccountingRule, handleGLPostingFailure } from "../accounting-validation";
```

#### b) Validation préalable (avant transaction, ligne ~59)
```typescript
// PRE-VALIDATION: Vérifier que la règle comptable existe
const [transfertPreCheck] = await db.select()...;
const typePaiement = isCoffreSource ? "COFFRE_TO_CAISSE" : "CAISSE_TO_COFFRE";

// En mode STRICT, cette ligne throw si la règle n'existe pas
await validateAccountingRule(typePaiement, transfertPreCheck.agenceId);
```

#### c) Gestion stricte des erreurs GL (ligne ~304)
```typescript
} catch (error: unknown) {
  // ... log et update du mouvement ...

  // NOUVEAU: Gestion selon le mode configuré
  handleGLPostingFailure(error, { transfertId, typePaiement, ... });
  // En mode STRICT: rethrow → rollback complet
  // En mode LENIENT: continue (comportement legacy)
}
```

### 2. `package.json`

**Scripts ajoutés:**
```json
{
  "scripts": {
    "verify:accounting-rules": "...",
    "diagnose:balance": "..."
  }
}
```

---

## 🚀 Migration en Production

### Phase 1: Test en Mode LENIENT (Semaines 1-2)

```bash
# Dans .env
GL_POSTING_MODE=LENIENT
```

**Actions:**
1. ✅ Déployer le code modifié
2. ✅ Exécuter `npm run verify:accounting-rules`
3. ✅ Identifier les règles manquantes dans les logs
4. ✅ Créer les règles comptables manquantes via l'interface admin

### Phase 2: Validation (Semaine 3)

```bash
# Toujours en LENIENT
GL_POSTING_MODE=LENIENT
```

**Actions:**
1. ✅ Vérifier qu'aucune règle ne manque: `npm run verify:accounting-rules`
2. ✅ Tester toutes les opérations critiques
3. ✅ Former les utilisateurs sur les nouveaux messages d'erreur
4. ✅ Exécuter `npm run diagnose:balance` quotidiennement

### Phase 3: Production Stricte

```bash
# Activer le mode strict
GL_POSTING_MODE=STRICT
```

**Actions:**
1. ✅ Déployer avec GL_POSTING_MODE=STRICT
2. ⚠️ Monitorer les 48 premières heures
3. ✅ Vérifier qu'aucune opération n'est bloquée
4. ✅ Exécuter `npm run diagnose:balance` → Écarts = 0

---

## 📊 Règles Comptables Actuelles

### Règles Existantes (Essentielles)
✅ COFFRE_TO_CAISSE (2 règles)
✅ CAISSE_TO_COFFRE (2 règles)
✅ DEPOSIT_SAVINGS (4 règles)
✅ WITHDRAWAL_SAVINGS (3 règles)
✅ DEPOSIT_CURRENT (5 règles)
✅ WITHDRAWAL_CURRENT (4 règles)
✅ CREDIT_DISBURSEMENT (4 règles)
✅ CREDIT_REPAYMENT (4 règles)
✅ INTERNAL_TRANSFER (1 règle)

### Règles à Créer (Si Utilisées)
⚠️ DEPOSIT_TERM
⚠️ WITHDRAWAL_TERM
⚠️ CREDIT_INTEREST_ACCRUAL
⚠️ CREDIT_PENALTY
⚠️ INTEREST_CAPITALIZATION
⚠️ SERVICE_FEE
⚠️ TRANSACTION_FEE
⚠️ REGULARISATION
⚠️ EXTERNAL_TRANSFER

**Note**: Si ces types d'opérations ne sont pas utilisés, retirez-les de `REQUIRED_EVENT_TYPES` dans le script de vérification.

---

## 🎓 Concepts Clés

### Mode STRICT vs LENIENT

| Aspect | STRICT | LENIENT |
|--------|--------|---------|
| Règle manquante | ❌ Opération refusée | ⚠️ Warning logué, opération continue |
| GL échoue | ❌ Rollback complet | ⚠️ Mouvement marqué FAILED, opération continue |
| Cohérence garantie | ✅ Toujours | ❌ Possible écart |
| Usage recommandé | Production | Migration, Debug |

### Garanties en Mode STRICT

1. **Impossible d'avoir un écart**: Soit tout est enregistré (mouvement + solde + GL), soit rien
2. **Validation précoce**: La règle est vérifiée AVANT toute modification
3. **Messages clairs**: "Règle comptable manquante pour X" au lieu d'échec silencieux
4. **Rollback automatique**: Si GL échoue, toute la transaction est annulée

---

## 🧪 Tests de Validation

### Test 1: Règle Manquante (Mode STRICT)
```bash
# Supprimer temporairement une règle
# Tenter un transfert coffre-caisse
# Résultat attendu: Erreur "Règle comptable manquante", aucun mouvement créé
```

### Test 2: GL Échoue (Mode STRICT)
```bash
# Simuler une erreur GL (ex: compte inexistant)
# Tenter une opération
# Résultat attendu: Rollback complet, soldes inchangés
```

### Test 3: Opération Normale (Mode STRICT)
```bash
# Effectuer un transfert coffre-caisse
# Vérifier: mouvement créé, soldes mis à jour, écriture GL créée
# npm run diagnose:balance → écart = 0
```

---

## 📈 Métriques de Succès

Après activation du mode STRICT:

- ✅ `npm run diagnose:balance` montre 0 écart
- ✅ Aucun mouvement avec `glPostingStatus='FAILED'`
- ✅ Solde opérationnel = Solde GL (pour tous les coffres et caisses)
- ✅ Aucune opération légitime bloquée

---

## 🆘 Procédure d'Urgence

Si des opérations critiques sont bloquées en production:

1. **Diagnostic immédiat:**
   ```bash
   npm run verify:accounting-rules
   # Identifier la règle manquante
   ```

2. **Créer la règle via l'interface admin** (recommandé)
   OU

3. **Rollback temporaire en LENIENT:**
   ```bash
   # Dans .env
   GL_POSTING_MODE=LENIENT
   # Redémarrer l'application
   ```

4. **Créer la règle, puis repasser en STRICT**

---

## 📚 Ressources

- [IMPLEMENTATION_GL_STRICT.md](./IMPLEMENTATION_GL_STRICT.md) - Guide détaillé
- [accounting-validation.ts](./server/services/accounting-validation.ts) - Code source
- Scripts de diagnostic dans `scripts/`

---

## ✨ Auteurs

- Implémentation: Claude Code (Anthropic)
- Date: 2026-02-02
- Version: 1.0.0

---

## 🔜 Prochaines Étapes

### À Court Terme
- [ ] Tester en mode LENIENT (1-2 semaines)
- [ ] Créer les règles comptables manquantes
- [ ] Exécuter `npm run verify:accounting-rules` quotidiennement
- [ ] Former l'équipe sur les nouveaux messages d'erreur

### À Moyen Terme
- [ ] Activer le mode STRICT en production
- [ ] Monitorer les 48 premières heures
- [ ] Documenter toute nouvelle règle comptable créée

### À Long Terme
- [ ] Appliquer le même pattern aux autres endpoints (dépôts, retraits, mobile money)
- [ ] Intégrer la vérification des règles dans le CI/CD
- [ ] Créer un dashboard de monitoring des écarts de balance
