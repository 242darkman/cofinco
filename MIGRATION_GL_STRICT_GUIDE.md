# Guide Complet de Migration vers GL Strict Mode

**Date**: 2026-02-02
**Version**: 2.0 - Implémentation Complète
**Statut**: ✅ Prêt pour déploiement en mode LENIENT

---

## 📋 Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Ce Qui a Été Fait](#ce-qui-a-été-fait)
3. [Plan de Migration en 4 Phases](#plan-de-migration-en-4-phases)
4. [Commandes Essentielles](#commandes-essentielles)
5. [Checklist Complète](#checklist-complète)
6. [Résolution de Problèmes](#résolution-de-problèmes)

---

## 🎯 Vue d'Ensemble

### Problème Résolu
**Avant**: Écarts entre soldes opérationnels et comptables (jusqu'à 10M+ FCFA)
**Maintenant**: Cohérence garantie - solde opérationnel = solde GL (toujours)

### Solution Implémentée
- ✅ **Validation préalable**: Règle comptable vérifiée AVANT toute opération
- ✅ **Transaction atomique**: Tout réussit ou tout échoue (aucun état incohérent)
- ✅ **Mode configurable**: STRICT (prod) ou LENIENT (migration)
- ✅ **Coverage complet**: Tous les endpoints financiers protégés

---

## ✅ Ce Qui a Été Fait

### Phase 1: Infrastructure (Fait le 2026-02-02)

#### Fichiers Créés
1. ✅ `server/services/accounting-validation.ts` - Service de validation
2. ✅ `scripts/verify-accounting-rules-completeness.ts` - Vérification complétude
3. ✅ `scripts/diagnose-balance-issues.ts` - Diagnostic écarts
4. ✅ `scripts/fix-caisse-balance-simple.ts` - Correction écarts (déjà exécuté)
5. ✅ `.env.example` - Documentation configuration
6. ✅ Documentation complète (5 fichiers MD)

#### Fichiers Modifiés
1. ✅ `server/services/coffre/transfer-executor.ts` - Transferts coffre-caisse
2. ✅ `server/services/ledger.ts` - Fonction centrale executeWithLedger
3. ✅ `package.json` - Scripts npm ajoutés

### Phase 2: Extension Complète (Fait le 2026-02-02)

#### Endpoints Protégés Automatiquement
- ✅ Transferts coffre-caisse (direct)
- ✅ Dépôts sur comptes (via executeWithLedger)
- ✅ Retraits sur comptes (via executeWithLedger)
- ✅ Décaissements crédit (via executeWithLedger)
- ✅ Remboursements crédit (via executeWithLedger)
- ✅ Opérations tontines (via executeWithLedger)
- ✅ Opérations terrain (via executeWithLedger)
- ✅ Transferts entre comptes (via executeWithLedger)

**Total**: ~20+ types d'opérations protégées

---

## 🚀 Plan de Migration en 4 Phases

### Phase 0: Préparation (Aujourd'hui - 1h)

```bash
# 1. Vérifier l'état actuel
npm run verify:accounting-rules
npm run diagnose:balance

# 2. Identifier les règles manquantes
# Résultat attendu: Liste des types d'opérations sans règle

# 3. Décider quoi faire pour chaque type manquant:
#    - Si utilisé → Créer la règle via interface admin
#    - Si non utilisé → Retirer de REQUIRED_EVENT_TYPES dans le script
```

**Livrables:**
- [ ] Liste des règles à créer
- [ ] Liste des types non utilisés à retirer

---

### Phase 1: Tests en Mode LENIENT (Semaines 1-2)

#### Configuration
```bash
# Dans .env
GL_POSTING_MODE=LENIENT
```

#### Actions Quotidiennes
```bash
# Matin
npm run diagnose:balance

# Vérifier les logs
tail -f logs/app.log | grep "Règle comptable"

# Soir - Bilan de la journée
npm run verify:accounting-rules
```

#### Checklist Semaine 1
- [ ] Jour 1: Déployer avec GL_POSTING_MODE=LENIENT
- [ ] Jour 1: Monitorer logs pour règles manquantes
- [ ] Jour 2-3: Créer les règles identifiées comme manquantes
- [ ] Jour 4-5: Tester toutes les opérations critiques
- [ ] Jour 5: `npm run verify:accounting-rules` → 0 erreurs

#### Checklist Semaine 2
- [ ] Jour 8: Vérifier aucune nouvelle règle manquante
- [ ] Jour 9-10: Tests intensifs par l'équipe
- [ ] Jour 11: Formation équipe sur nouveaux messages d'erreur
- [ ] Jour 12: `npm run diagnose:balance` → Tous écarts = 0
- [ ] Jour 14: Validation finale avant STRICT

---

### Phase 2: Validation en Staging (Semaine 3)

#### Configuration Staging
```bash
# Staging .env
GL_POSTING_MODE=STRICT
```

#### Tests à Effectuer
```bash
# Test 1: Dépôt CASH sur compte épargne
curl -X POST https://staging.cofinco.com/api/comptes/depot \
  -H "Content-Type: application/json" \
  -d '{
    "compteId": "...",
    "montant": 10000,
    "methodePaiement": "CASH",
    "sessionCaisseId": "..."
  }'
# Résultat attendu: 200 OK, solde mis à jour, écriture GL créée

# Test 2: Retrait Mobile Money
curl -X POST https://staging.cofinco.com/api/comptes/retrait \
  -H "Content-Type: application/json" \
  -d '{
    "compteId": "...",
    "montant": 5000,
    "methodePaiement": "MOBILE_MONEY",
    "provider": "MTN"
  }'
# Résultat attendu: 200 OK, solde mis à jour, écriture GL créée

# Test 3: Transfert coffre-caisse
curl -X POST https://staging.cofinco.com/api/coffre/transferts/execute \
  -H "Content-Type: application/json" \
  -d '{
    "transfertId": "...",
    "billetage": {...}
  }'
# Résultat attendu: 200 OK, soldes mis à jour, écriture GL créée

# Test 4: Règle manquante (simuler)
# Supprimer temporairement une règle
# Tenter l'opération
# Résultat attendu: 400 "Règle comptable manquante pour X"
```

#### Checklist Validation
- [ ] Tous les tests passent
- [ ] Aucune opération légitime bloquée
- [ ] Messages d'erreur clairs et actionnables
- [ ] Performance acceptable (< 5% overhead)
- [ ] `npm run diagnose:balance` → 0 écarts

---

### Phase 3: Production STRICT (Semaine 4)

#### Préparation Déploiement
```bash
# 1. Backup base de données
pg_dump -h localhost -U postgres cofinco > backup_avant_strict.sql

# 2. Vérification finale
npm run verify:accounting-rules  # Doit être 100% vert
npm run diagnose:balance  # Tous écarts doivent être 0

# 3. Plan de rollback prêt
# Fichier: rollback-procedure.md
```

#### Déploiement
```bash
# 1. Modifier .env en production
GL_POSTING_MODE=STRICT

# 2. Redémarrer l'application
pm2 restart cofinco
# ou
docker-compose restart app

# 3. Vérifier le démarrage
pm2 logs cofinco --lines 50 | grep "GL_POSTING_MODE"
# Doit afficher: "GL_POSTING_MODE=STRICT activated"
```

#### Monitoring Post-Déploiement (48h)

**Heure H+0 (Immédiat après déploiement):**
```bash
# Vérifier logs
tail -f logs/app.log | grep -i "error\|règle\|GL"

# Tester opération simple
curl -X POST .../api/comptes/depot (test manuel)

# Vérifier que ça fonctionne
```

**H+2h:**
```bash
npm run diagnose:balance
# Vérifier: Tous écarts = 0
```

**H+6h:**
```bash
# Vérifier volume d'opérations
# Comparer avec baseline habituel
```

**H+12h:**
```bash
npm run diagnose:balance
# Vérifier aucune dérive
```

**H+24h:**
```bash
# Audit complet
npm run verify:accounting-rules
npm run diagnose:balance
npm run audit:integrity

# Review des logs
grep "Règle comptable manquante" logs/app.log
# Doit être vide!
```

**H+48h:**
```bash
# Validation finale
npm run diagnose:balance
# Si écarts = 0 → SUCCESS! 🎉
```

---

### Phase 4: Stabilisation (Semaine 5+)

#### Monitoring Continu
```bash
# Quotidien
npm run diagnose:balance

# Hebdomadaire
npm run verify:accounting-rules
npm run audit:integrity
```

#### KPIs à Suivre
- Écarts de balance: **0 FCFA** (objectif permanent)
- Mouvements FAILED: **0** (sauf legacy à corriger)
- Temps de réponse API: < baseline + 5%
- Taux d'erreur règle manquante: **0%**

---

## 💻 Commandes Essentielles

### Diagnostic
```bash
# Vérifier complétude des règles
npm run verify:accounting-rules

# Diagnostiquer écarts de balance
npm run diagnose:balance

# Audit d'intégrité financière complet
npm run audit:integrity
```

### Développement
```bash
# Lancer en mode dev (auto LENIENT)
npm run dev

# Lancer tests
npm test
```

### Production
```bash
# Démarrer
npm start

# Logs
pm2 logs cofinco
tail -f logs/app.log
```

---

## ✅ Checklist Complète

### Avant Activation STRICT

#### Infrastructure
- [x] Service accounting-validation créé ✅
- [x] Scripts de diagnostic créés ✅
- [x] transfer-executor modifié ✅
- [x] ledger.ts modifié ✅
- [x] Documentation complète ✅

#### Règles Comptables
- [ ] `npm run verify:accounting-rules` → Exit code 0
- [ ] Toutes règles utilisées créées
- [ ] Types non utilisés retirés de REQUIRED_EVENT_TYPES

#### Tests
- [ ] Tous types d'opérations testés en staging STRICT
- [ ] Aucune opération légitime bloquée
- [ ] Messages d'erreur validés
- [ ] Performance validée

#### Équipe
- [ ] Formation sur nouveaux messages d'erreur
- [ ] Documentation accessible
- [ ] Procédure de rollback documentée
- [ ] Support technique prêt

### Après Activation STRICT

#### Immédiat (H+0)
- [ ] Application démarrée correctement
- [ ] Logs ne montrent pas d'erreurs critiques
- [ ] Test manuel d'une opération réussie

#### Court Terme (J+1 à J+7)
- [ ] `npm run diagnose:balance` quotidien → 0 écarts
- [ ] Aucune opération bloquée injustement
- [ ] Volume d'opérations normal
- [ ] Équipe à l'aise avec le système

#### Moyen Terme (Semaine 2-4)
- [ ] KPIs stables
- [ ] Aucun rollback nécessaire
- [ ] Retours positifs de l'équipe
- [ ] Zéro incident lié au GL strict

---

## 🆘 Résolution de Problèmes

### Problème 1: "Règle comptable manquante pour X"

**Symptôme**: Opération bloquée avec ce message

**Diagnostic**:
```bash
# Identifier le type exact
grep "Règle comptable manquante" logs/app.log | tail -5

# Vérifier si règle existe
npm run verify:accounting-rules | grep "X"
```

**Solution A - Créer la Règle (Recommandé)**:
1. Interface admin → Comptabilité → Règles
2. Créer nouvelle règle:
   - Code: Ex. `DEP_CASH_SAVINGS`
   - Type événement: Ex. `DEPOSIT_SAVINGS`
   - Méthode paiement: Ex. `CASH` (si applicable)
   - Comptes: Débit/Crédit selon OHADA
3. Retester l'opération

**Solution B - Rollback Temporaire**:
```bash
# .env
GL_POSTING_MODE=LENIENT

# Redémarrer
pm2 restart cofinco

# Puis créer la règle et repasser en STRICT
```

---

### Problème 2: Opérations Massives Bloquées

**Symptôme**: Plusieurs types d'opérations échouent

**Diagnostic**:
```bash
# Identifier tous les types en erreur
grep "Règle comptable manquante" logs/app.log | cut -d'"' -f4 | sort | uniq

# Vérifier l'état complet
npm run verify:accounting-rules
```

**Solution**:
```bash
# Option 1: Rollback immédiat en LENIENT
GL_POSTING_MODE=LENIENT

# Option 2: Créer rapidement les règles critiques
# Via interface admin ou script d'import

# Option 3: Si urgence extrême, désactiver requiresGlPosting
# (NON RECOMMANDÉ - perte de garanties)
```

---

### Problème 3: Écarts de Balance Détectés

**Symptôme**: `npm run diagnose:balance` montre des écarts

**Diagnostic**:
```bash
npm run diagnose:balance

# Analyser les mouvements FAILED/SKIPPED
# SELECT * FROM mouvements_financiers WHERE gl_posting_status IN ('FAILED', 'SKIPPED');
```

**Solution**:
1. Identifier la cause (règle manquante? compte inexistant?)
2. Corriger la cause racine
3. Créer écriture de régularisation si nécessaire:
   ```bash
   # Adapter scripts/fix-caisse-balance-simple.ts
   npx tsx scripts/fix-caisse-balance-simple.ts
   ```

---

### Problème 4: Performance Dégradée

**Symptôme**: Opérations plus lentes après activation

**Diagnostic**:
```bash
# Mesurer le temps de réponse
curl -w "@curl-format.txt" -X POST .../api/comptes/depot

# Vérifier les logs de timing
grep "GL posted sync" logs/app.log | tail -20
```

**Solutions**:
1. **Cache des règles**: Les règles sont déjà en DB, mais on peut ajouter un cache mémoire
2. **Index DB**: Vérifier que les index sont présents sur `accounting_rules.event_type`
3. **Batch operations**: Grouper les opérations quand possible

---

## 📞 Support et Contact

### En Cas de Blocage

1. **Logs**: `tail -f logs/app.log | grep -i "error\|règle\|GL"`
2. **Documentation**: Voir `IMPLEMENTATION_GL_STRICT.md`
3. **Diagnostic**: `npm run diagnose:balance`

### Procédure d'Escalade

1. **Niveau 1**: Vérifier documentation (5 min)
2. **Niveau 2**: Rollback en LENIENT (2 min)
3. **Niveau 3**: Créer règle manquante (10 min)
4. **Niveau 4**: Contact support technique

---

## 🎯 Critères de Succès

### Succès de la Migration

✅ **Phase LENIENT réussie si**:
- Aucune règle manquante pour opérations utilisées
- `npm run verify:accounting-rules` → 100% vert
- Équipe formée et à l'aise

✅ **Phase STRICT réussie si**:
- 48h sans incident
- `npm run diagnose:balance` → 0 écarts
- Volume d'opérations normal
- Aucun rollback nécessaire

✅ **Migration complète réussie si**:
- 1 mois en STRICT sans problème
- KPIs stables
- Équipe satisfaite
- Zéro écart de balance

---

## 📚 Ressources Complémentaires

- [IMPLEMENTATION_GL_STRICT.md](./IMPLEMENTATION_GL_STRICT.md) - Guide technique détaillé
- [CHANGELOG_GL_STRICT.md](./CHANGELOG_GL_STRICT.md) - Historique Part 1 (Coffre)
- [CHANGELOG_GL_STRICT_PART2.md](./CHANGELOG_GL_STRICT_PART2.md) - Historique Part 2 (Tous endpoints)
- [QUICK_START_GL_STRICT.md](./QUICK_START_GL_STRICT.md) - Guide rapide équipe
- [accounting-validation.ts](./server/services/accounting-validation.ts) - Code source

---

**Version**: 2.0
**Dernière mise à jour**: 2026-02-02
**Statut**: ✅ Prêt pour déploiement

**Prochaine action**: Phase 0 - Préparation (1h) → Exécuter `npm run verify:accounting-rules`
