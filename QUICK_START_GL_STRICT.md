# Guide Rapide: Mode GL Strict

## 🎯 En 2 Minutes

Le système a été amélioré pour **garantir que les soldes opérationnels = soldes comptables** en permanence.

### Avant
- Opération réussie **même si** l'écriture comptable échoue ❌
- Résultat: écarts de balance

### Maintenant
- Opération réussie **seulement si** l'écriture comptable réussit ✅
- Résultat: zéro écart garanti

---

## ⚡ Commandes Essentielles

```bash
# Vérifier les règles comptables manquantes
npm run verify:accounting-rules

# Diagnostiquer les écarts de balance
npm run diagnose:balance

# Démarrer en mode LENIENT (recommandé initialement)
# Éditer .env: GL_POSTING_MODE=LENIENT
npm run dev
```

---

## 🚦 Modes de Fonctionnement

### LENIENT (Mode Actuel - Transition)
```bash
GL_POSTING_MODE=LENIENT
```
- ✅ Permet de tester sans bloquer les opérations
- ⚠️ Logs des warnings si règles manquantes
- 📊 Utiliser pour identifier les règles à créer

### STRICT (Mode Production - Objectif)
```bash
GL_POSTING_MODE=STRICT
```
- 🔒 Opération bloquée si règle comptable manquante
- ✅ Garantit solde opérationnel = solde GL
- 🎯 Activer une fois toutes les règles créées

---

## 📋 Checklist de Migration

### Semaine 1-2: Phase de Test
- [x] Code déployé ✅ (fait le 2026-02-02)
- [ ] Exécuter `npm run verify:accounting-rules`
- [ ] Noter les règles manquantes
- [ ] Créer les règles via interface admin

### Semaine 3: Validation
- [ ] Re-vérifier: `npm run verify:accounting-rules` → Tout ✅
- [ ] Tester toutes les opérations critiques
- [ ] Former l'équipe sur nouveaux messages d'erreur

### Semaine 4: Activation STRICT
- [ ] Changer .env: `GL_POSTING_MODE=STRICT`
- [ ] Redémarrer l'application
- [ ] Monitorer 48h
- [ ] Vérifier: `npm run diagnose:balance` → Écarts = 0

---

## ⚠️ Messages d'Erreur Possibles

### "Règle comptable manquante pour X"
**Cause**: Tentative d'opération sans règle comptable

**Solution**:
1. Noter le type d'opération (ex: COFFRE_TO_CAISSE)
2. Créer la règle via interface admin
3. Ou passer temporairement en LENIENT

### "GL posting failed - rolling back"
**Cause**: Erreur lors de création de l'écriture comptable

**Solution**:
1. Vérifier les comptes dans la règle (521, 531, etc.)
2. Vérifier que les comptes existent dans le plan comptable
3. Contacter le support si problème persiste

---

## 🆘 Aide Rapide

### Problème: Opérations bloquées en production

**Solution Immédiate (5 min):**
```bash
# 1. Éditer .env
GL_POSTING_MODE=LENIENT

# 2. Redémarrer
pm2 restart cofinco  # ou docker restart cofinco

# 3. Créer la règle manquante
# Via interface admin

# 4. Repasser en STRICT
GL_POSTING_MODE=STRICT
pm2 restart cofinco
```

### Problème: Écarts de balance détectés

**Diagnostic:**
```bash
npm run diagnose:balance
# Regarder la section "Écart" pour chaque entité
```

**Correction**: Voir [CHANGELOG_GL_STRICT.md](./CHANGELOG_GL_STRICT.md) section "Solution Appliquée"

---

## 📚 Documentation Complète

- **Guide détaillé**: [IMPLEMENTATION_GL_STRICT.md](./IMPLEMENTATION_GL_STRICT.md)
- **Historique**: [CHANGELOG_GL_STRICT.md](./CHANGELOG_GL_STRICT.md)
- **Code**: [accounting-validation.ts](./server/services/accounting-validation.ts)

---

## 💡 Conseils Pro

1. **Toujours vérifier avant STRICT**:
   ```bash
   npm run verify:accounting-rules
   ```
   Si exit code = 0 → Safe pour STRICT ✅

2. **Monitorer quotidiennement**:
   ```bash
   npm run diagnose:balance
   ```
   Objectif: Écarts = 0 partout

3. **Créer les règles au fur et à mesure**:
   - Ne pas attendre d'avoir TOUTES les règles
   - Créer les règles pour les opérations **utilisées**
   - Retirer de REQUIRED_EVENT_TYPES les types non utilisés

4. **Tester en staging d'abord**:
   - Mode LENIENT → STRICT sur environnement de test
   - Valider pendant 1 semaine
   - Puis production

---

## ✅ Validation Finale

Le système est prêt pour STRICT quand:

- [ ] `npm run verify:accounting-rules` → Exit code 0
- [ ] `npm run diagnose:balance` → Tous écarts = 0
- [ ] Toutes opérations testées en staging
- [ ] Équipe formée sur nouveaux messages

---

**Besoin d'aide?** Voir [IMPLEMENTATION_GL_STRICT.md](./IMPLEMENTATION_GL_STRICT.md) ou contacter le support technique.
