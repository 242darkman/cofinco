# Carte de Référence Rapide - Mode GL Strict

**📋 À garder sous la main pour le monitoring quotidien**

---

## ⚡ Commandes Essentielles

```bash
# Monitoring complet (quotidien 9h, 12h, 18h)
npm run monitor:gl

# Vérifier les balances
npm run diagnose:balance

# Vérifier les règles comptables
npm run verify:accounting-rules

# Voir les logs en temps réel
tail -f logs/app.log | grep -i "error\|règle\|GL"
```

---

## 🚦 Interprétation des Statuts

### ✅ OK
```
Statut: ✅ OK
✅ Aucun problème détecté
```
→ **Rien à faire**, tout va bien!

### ⚠️ WARNING
```
Statut: ⚠️ WARNING
Problèmes détectés:
  - 2 mouvements échoués (24h)
```
→ **Investiguer** dans les prochaines heures

### ❌ CRITICAL
```
Statut: ❌ CRITICAL
Problèmes détectés:
  - Règles manquantes: DEPOSIT_TERM
```
→ **Action immédiate** requise!

---

## 🆘 Solution Rapide: Opérations Bloquées

**Si les utilisateurs ne peuvent plus faire d'opérations:**

```bash
# 1. Passer en LENIENT (éditer .env)
GL_POSTING_MODE=LENIENT

# 2. Redémarrer
pm2 restart cofinco

# 3. Créer la règle manquante (via interface admin)
# Comptabilité → Règles Comptables → Nouvelle Règle

# 4. Repasser en STRICT
GL_POSTING_MODE=STRICT
pm2 restart cofinco
```

**Temps total: 5-10 minutes**

---

## 📊 Valeurs Attendues

| Métrique | Valeur OK |
|----------|-----------|
| Écart coffres | 0 FCFA |
| Écart caisses | 0 FCFA |
| Règles manquantes | 0 |
| Mouvements échoués | 0 |
| Erreurs GL (logs) | 0 |

**Si une valeur diffère**: Consulter [PROCEDURE_EQUIPE_GL_STRICT.md](./PROCEDURE_EQUIPE_GL_STRICT.md)

---

## 📅 Planning de Monitoring

| Heure | Action | Temps |
|-------|--------|-------|
| 09h00 | `npm run monitor:gl` | 2 min |
| 12h00 | Surveiller logs | 5 min |
| 18h00 | `npm run monitor:gl` + `diagnose:balance` | 3 min |

**Lundi matin**: Audit complet (verify + integrity)

---

## 💡 Créer une Règle Comptable

**Si message "Règle comptable manquante pour X":**

1. Interface admin → **Comptabilité** → **Règles Comptables**
2. Cliquer **"Nouvelle Règle"**
3. Remplir:
   - **Code**: Ex. `DEP_CASH_SAVINGS`
   - **Type événement**: Ex. `DEPOSIT_SAVINGS`
   - **Méthode**: Ex. `CASH` (si applicable)
   - **Débit**: Ex. `521` (Caisse)
   - **Crédit**: Ex. `4111` (Comptes épargne)
   - **Actif**: ✓
4. **Sauvegarder**
5. **Tester**: `npm run verify:accounting-rules`

---

## 📞 Contacts

- **Documentation complète**: [PROCEDURE_EQUIPE_GL_STRICT.md](./PROCEDURE_EQUIPE_GL_STRICT.md)
- **Guide technique**: [IMPLEMENTATION_GL_STRICT.md](./IMPLEMENTATION_GL_STRICT.md)
- **Lead technique**: [Contact]

---

**En cas de doute: demander de l'aide plutôt que de risquer une erreur!**

**Version**: 1.0 | **Mise à jour**: 2026-02-02
