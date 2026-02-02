# Implémentation du Mode GL Strict

## Objectif
Garantir que les soldes opérationnels et GL restent toujours synchronisés en empêchant toute opération si l'écriture GL ne peut pas être créée.

## Configuration

Ajouter dans `.env`:
```bash
# GL_POSTING_MODE: STRICT (recommandé) ou LENIENT (migration)
# STRICT: Opération échoue si GL échoue (garantit cohérence)
# LENIENT: Opération continue même si GL échoue (comportement actuel)
GL_POSTING_MODE=STRICT
```

## Modifications à Apporter

### 1. Dans `server/services/coffre/transfer-executor.ts`

**Avant la transaction (ligne ~100):**
```typescript
import { validateAccountingRule, handleGLPostingFailure } from '../accounting-validation';

export async function executeTransfert(transfertId: string, executorId: string, ...) {
  // ... code existant ...

  // NOUVEAU: Valider la règle comptable AVANT de commencer
  const typePaiement = isCoffreSource ? 'COFFRE_TO_CAISSE' : 'CAISSE_TO_COFFRE';
  await validateAccountingRule(typePaiement, transfert.agenceId);
  // ⬆️ En mode STRICT, cette ligne throw si la règle n'existe pas
  //    L'opération s'arrête ICI avant toute modification de données

  // Continuer avec la transaction...
  return await db.transaction(async (tx) => {
    // ...
  });
}
```

**Dans la transaction (lignes 282-305):**
```typescript
// 9b. GL Posting — one écriture for the whole transfer (via DEBIT mouvement)
if (transfert.agenceId) {
  try {
    const glResult = await postGlForMouvement(tx, mouvementDebit, transfert.agenceId, executorId, {
      transfertId: transfert.id,
      coffreNom: coffre.nom,
      caisseNom: caisse.nom,
      direction: isCoffreSource ? "COFFRE→CAISSE" : "CAISSE→COFFRE",
    });

    if (glResult) {
      await tx.update(mouvementsFinanciers)
        .set({ glPostingStatus: "POSTED", glPostingError: null })
        .where(eq(mouvementsFinanciers.id, mouvementDebit.id));
    } else {
      // GL posting returned false (should not happen if validation passed)
      throw new Error('GL posting returned false despite validation');
    }

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown GL error";
    logger.error({ transfertId, error: message }, 'GL posting failed');

    await tx.update(mouvementsFinanciers)
      .set({ glPostingStatus: "FAILED", glPostingError: message })
      .where(eq(mouvementsFinanciers.id, mouvementDebit.id));

    // MODIFIÉ: Gérer selon le mode configuré
    handleGLPostingFailure(error, { transfertId, typePaiement: mouvementDebit.typePaiement });
    // ⬆️ En mode STRICT: rethrow → rollback de TOUTE la transaction
    //    En mode LENIENT: continue (comportement actuel)
  }
}
```

### 2. Appliquer le Même Pattern Partout

**Fichiers à modifier:**
- ✅ `server/services/coffre/transfer-executor.ts` (transferts coffre-caisse)
- ⬜ `server/routes/operations.ts` (dépôts, retraits)
- ⬜ `server/routes/comptes.ts` (opérations sur comptes)
- ⬜ `server/services/mobile-money-service.ts` (mobile money)
- ⬜ Tous les endroits qui créent des mouvements financiers

**Pattern général:**
```typescript
// 1. Validation AVANT transaction
await validateAccountingRule(eventType, agenceId);

// 2. Transaction avec gestion stricte des erreurs GL
await db.transaction(async (tx) => {
  // Créer mouvement + mettre à jour soldes
  // ...

  try {
    // Poster au GL (obligatoire)
    const glResult = await postGlForMouvement(tx, mouvement, ...);
    if (!glResult) throw new Error('GL posting failed');

  } catch (error) {
    // En mode STRICT: rethrow → rollback
    // En mode LENIENT: log warning → continue
    handleGLPostingFailure(error, context);
  }
});
```

## Stratégie de Migration

### Phase 1: Tests (1-2 semaines)
```bash
GL_POSTING_MODE=LENIENT  # Comportement actuel
```
- Déployer le code avec validation
- Logger tous les cas où une règle manque
- Créer les règles comptables manquantes

### Phase 2: Validation (1 semaine)
```bash
GL_POSTING_MODE=LENIENT  # Encore en mode permissif
```
- Vérifier qu'aucune règle ne manque dans les logs
- Tests intensifs sur environnement de staging
- Former les utilisateurs sur les nouveaux messages d'erreur

### Phase 3: Production Stricte
```bash
GL_POSTING_MODE=STRICT  # Mode robuste
```
- Activer le mode strict en production
- Monitorer attentivement les 48 premières heures
- Créer immédiatement toute règle manquante si détectée

## Avantages

✅ **Cohérence garantie**: Solde opérationnel = Solde GL (toujours)
✅ **Pas d'écarts**: Impossible d'avoir un mouvement sans GL
✅ **Messages clairs**: "Règle comptable manquante pour X" au lieu d'un échec silencieux
✅ **Traçabilité**: Toutes les erreurs sont loggées
✅ **Rollback automatique**: Si GL échoue, tout est annulé
✅ **Migration sûre**: Mode LENIENT pour la transition

## Risques et Mitigations

### Risque 1: Opérations bloquées en production
**Mitigation**:
- Phase de test approfondie
- Créer TOUTES les règles comptables avant d'activer STRICT
- Procédure d'urgence: repasser en LENIENT si besoin

### Risque 2: Règle manquante pour nouveau type d'opération
**Mitigation**:
- Documentation claire sur la création de règles
- Validation lors de l'ajout de nouveaux types d'opérations
- Script de vérification de complétude des règles

### Risque 3: Performances (validation supplémentaire)
**Mitigation**:
- La requête de validation est très rapide (index sur eventType)
- Peut être cachée en mémoire pour les règles fréquentes
- Le gain en cohérence dépasse largement le coût minimal

## Scripts de Support

### Vérifier la Complétude des Règles
```typescript
// scripts/verify-accounting-rules.ts
// Liste tous les types d'opérations et vérifie qu'ils ont une règle
```

### Monitorer les Échecs GL
```typescript
// scripts/monitor-gl-failures.ts
// Dashboard des mouvements avec glPostingStatus = 'FAILED'
```

## Conclusion

Cette approche transforme votre système d'un modèle "best-effort" (essayer de poster au GL mais continuer si ça échoue) vers un modèle "transactionnel" (tout réussit ou tout échoue).

C'est la bonne approche pour un système financier robuste. ✅
