# Procédure Équipe: Mode GL Strict Activé

**Date d'activation**: 2026-02-02
**Statut**: ✅ Mode STRICT activé en production
**Public**: Équipe technique et support

---

## 🎯 Qu'est-ce que le Mode GL Strict ?

### Avant (Mode Legacy)
```
Opération → Créer mouvement → Mettre à jour solde
                                    ↓
                            Essayer GL posting
                                    ↓
                        ❌ GL échoue → Continue quand même
                                    ↓
                            RÉSULTAT: Écart de balance!
```

### Maintenant (Mode STRICT)
```
Opération → Valider règle existe → db.transaction {
                ✅                      ↓
                                   Créer mouvement
                                        ↓
                                   Mettre à jour solde
                                        ↓
                                   Poster au GL
                                        ↓
                                   ✅ Succès → COMMIT
                                   ❌ Échec → ROLLBACK
                                }
                                    ↓
                        RÉSULTAT: Cohérence garantie!
```

### Garantie
**Solde Opérationnel = Solde GL (TOUJOURS)**

---

## 📊 Monitoring Quotidien

### Commandes Essentielles

#### 1. Monitoring Complet (À lancer chaque matin)
```bash
npm run monitor:gl
```

**Ce que ça vérifie:**
- ✅ Écarts de balance (coffres & caisses)
- ✅ Complétude des règles comptables
- ✅ Mouvements échoués (dernières 24h)
- ✅ Erreurs GL dans les logs

**Interprétation des résultats:**

**Statut OK ✅:**
```
=== RÉSUMÉ ===
Statut: ✅ OK
✅ Aucun problème détecté
```
→ **Action**: Aucune, tout va bien!

**Statut WARNING ⚠️:**
```
=== RÉSUMÉ ===
Statut: ⚠️ WARNING
Problèmes détectés:
  - 2 mouvements échoués (24h)
  - 1 erreurs GL dans logs
```
→ **Action**: Investiguer les mouvements échoués (voir section Troubleshooting)

**Statut CRITICAL ❌:**
```
=== RÉSUMÉ ===
Statut: ❌ CRITICAL
Problèmes détectés:
  - Règles manquantes: DEPOSIT_TERM
  - Écart coffres: 50,000 FCFA
```
→ **Action**: Intervention immédiate requise (voir section Urgences)

#### 2. Diagnostic des Balances
```bash
npm run diagnose:balance
```

**Résultat attendu:**
```
TOTAL COFFRES:
  Solde opérationnel total: 100,000,000 FCFA
  Solde GL (531):           100,000,000 FCFA
  Écart:                    0 FCFA ✓

TOTAL CAISSES:
  Solde opérationnel total: 50,000,000 FCFA
  Solde GL (521):           50,000,000 FCFA
  Écart:                    0 FCFA ✓
```

**Si écart détecté:**
→ Voir section "Urgence 2: Écart de Balance Détecté"

#### 3. Vérification des Règles Comptables
```bash
npm run verify:accounting-rules
```

**Résultat attendu:**
```
✅ Toutes les règles comptables requises sont présentes!
   Le système peut être passé en mode GL_POSTING_MODE=STRICT en toute sécurité.
```

**Si règles manquantes:**
→ Voir section "Problème 1: Règle Comptable Manquante"

---

## 📅 Planning de Monitoring

### Quotidien (Lundi - Vendredi)

**09h00 - Vérification du matin:**
```bash
npm run monitor:gl
```
- Noter le statut dans le journal de bord
- Si WARNING ou CRITICAL: Suivre procédure d'urgence

**12h00 - Vérification mi-journée:**
```bash
# Vérifier les logs en temps réel
tail -f logs/app.log | grep -i "error\|règle\|GL"
```
- Vérifier qu'aucune erreur GL n'apparaît
- Si erreurs: Investiguer immédiatement

**18h00 - Bilan de journée:**
```bash
npm run monitor:gl
npm run diagnose:balance
```
- Comparer avec le statut du matin
- Noter tout changement dans le journal de bord
- Rapporter toute anomalie au lead technique

### Hebdomadaire (Lundi)

**Audit Complet:**
```bash
npm run verify:accounting-rules
npm run audit:integrity
npm run monitor:gl
```
- Archiver les rapports
- Analyser les tendances
- Planifier correctifs si nécessaire

### Mensuel (1er du mois)

**Revue Complète:**
1. Analyser les rapports de monitoring du mois
2. Identifier les patterns d'erreurs
3. Optimiser les règles comptables
4. Mettre à jour la documentation

---

## 🆘 Guide de Troubleshooting

### Problème 1: Règle Comptable Manquante

**Symptôme:**
```
Erreur: Règle comptable manquante pour DEPOSIT_TERM
```

**Diagnostic:**
```bash
npm run verify:accounting-rules | grep "DEPOSIT_TERM"
```

**Solution - Créer la Règle:**

1. **Se connecter à l'interface admin:**
   - Naviguer vers: Comptabilité → Règles Comptables

2. **Cliquer sur "Nouvelle Règle"**

3. **Remplir le formulaire:**
   ```
   Code:             DEP_CASH_TERM
   Libellé:          Dépôt cash sur compte à terme
   Type d'événement: DEPOSIT_TERM
   Méthode paiement: CASH
   Actif:            ✓ Oui

   Débit:            521 (Caisse)
   Crédit:           414 (Comptes à terme clients)
   ```

4. **Sauvegarder et tester:**
   ```bash
   npm run verify:accounting-rules
   ```

**Si urgent (opérations bloquées):**
```bash
# Solution temporaire: Passer en LENIENT
# Éditer .env
GL_POSTING_MODE=LENIENT

# Redémarrer
pm2 restart cofinco

# Créer la règle
# Puis repasser en STRICT
GL_POSTING_MODE=STRICT
pm2 restart cofinco
```

---

### Problème 2: Mouvements Échoués

**Symptôme:**
```
2 mouvements échoués (24h)
```

**Diagnostic:**
```sql
-- Se connecter à la base de données
psql $DATABASE_URL

-- Identifier les mouvements échoués
SELECT
  reference,
  montant,
  type_paiement,
  gl_posting_status,
  gl_posting_error,
  date_operation
FROM mouvements_financiers
WHERE gl_posting_status = 'FAILED'
  AND date_operation > NOW() - INTERVAL '24 hours'
ORDER BY date_operation DESC;
```

**Causes Fréquentes:**

1. **Compte comptable inexistant:**
   ```
   gl_posting_error: "Compte 4111 introuvable"
   ```
   → Créer le compte dans le plan comptable

2. **Règle mal configurée:**
   ```
   gl_posting_error: "Comptes débit/crédit identiques"
   ```
   → Corriger la règle dans l'interface admin

3. **Problème réseau/BDD temporaire:**
   ```
   gl_posting_error: "Connection timeout"
   ```
   → Relancer l'opération manuellement

**Action Corrective:**
1. Corriger la cause racine
2. Si nécessaire, créer écriture de régularisation manuelle
3. Documenter l'incident

---

### Problème 3: Erreurs GL dans les Logs

**Symptôme:**
```
5 erreurs GL dans logs
```

**Diagnostic:**
```bash
# Extraire les erreurs GL des logs
grep "GL posting failed\|GL failed" logs/app.log | tail -20
```

**Analyse des Patterns:**

**Pattern 1: Erreur récurrente sur même type:**
```log
2026-02-02 10:23:12 ERROR GL posting failed for DEPOSIT_TERM
2026-02-02 10:24:45 ERROR GL posting failed for DEPOSIT_TERM
2026-02-02 10:26:18 ERROR GL posting failed for DEPOSIT_TERM
```
→ Problème avec la règle DEPOSIT_TERM: Vérifier/corriger la règle

**Pattern 2: Erreur ponctuelle:**
```log
2026-02-02 10:23:12 ERROR GL posting failed: Connection timeout
```
→ Problème transitoire: Vérifier état BDD/réseau

**Action:**
1. Identifier le pattern d'erreur
2. Appliquer la solution appropriée
3. Monitorer les 2h suivantes

---

## 🚨 Procédures d'Urgence

### Urgence 1: Opérations Bloquées en Masse

**Symptôme:**
- Plusieurs utilisateurs rapportent des erreurs
- Impossible d'effectuer dépôts/retraits

**Diagnostic Rapide (1 min):**
```bash
tail -50 logs/app.log | grep -i "règle comptable manquante"
```

**Solution Immédiate (5 min):**

**Étape 1: Rollback en LENIENT (2 min)**
```bash
# Éditer .env
nano .env
# Modifier: GL_POSTING_MODE=LENIENT

# Redémarrer
pm2 restart cofinco

# Vérifier
curl http://localhost:3000/health
```

**Étape 2: Identifier la règle manquante (1 min)**
```bash
npm run verify:accounting-rules
```

**Étape 3: Créer la règle (2 min)**
- Via interface admin (voir Problème 1)

**Étape 4: Repasser en STRICT**
```bash
# Éditer .env
nano .env
# Modifier: GL_POSTING_MODE=STRICT

# Redémarrer
pm2 restart cofinco

# Tester
npm run monitor:gl
```

**Communication:**
- Informer l'équipe: "Incident résolu - Règle X créée"
- Documenter l'incident dans le registre

---

### Urgence 2: Écart de Balance Détecté

**Symptôme:**
```
Écart coffres: 50,000 FCFA ⚠️
```

**Diagnostic Approfondi:**
```bash
npm run diagnose:balance
```

**Analyser les mouvements sans écriture GL:**
```sql
SELECT
  reference,
  montant,
  type_paiement,
  gl_posting_status,
  gl_posting_error
FROM mouvements_financiers
WHERE gl_posting_status IN ('FAILED', 'SKIPPED')
  AND date_operation > NOW() - INTERVAL '7 days'
ORDER BY date_operation DESC;
```

**Solution:**

**Si écart < 1000 FCFA:**
- Probable arrondi ou erreur mineure
- Créer OD de régularisation:
  ```
  Débit 401 (Écarts de conversion): 1000
  Crédit 531 (Coffre): 1000
  ```

**Si écart > 1000 FCFA:**
1. **Ne PAS créer d'OD immédiatement**
2. Contacter le lead technique
3. Analyser TOUS les mouvements concernés
4. Identifier la cause racine
5. Corriger la cause
6. Puis créer OD de régularisation si nécessaire

**Alerte:**
```bash
# En attendant la résolution, passer en LENIENT
# pour éviter de bloquer les opérations
GL_POSTING_MODE=LENIENT
pm2 restart cofinco
```

---

## 📝 Messages d'Erreur Fréquents

### Pour les Utilisateurs Finaux

**Erreur Affichée:**
```
"Impossible d'effectuer l'opération: Règle comptable non configurée"
```

**Explication à donner:**
> "Le système détecte qu'une configuration comptable est manquante.
> Notre équipe technique a été notifiée et corrige le problème.
> Veuillez réessayer dans quelques minutes."

**Action technique:**
- Créer la règle manquante (voir Problème 1)
- Temps de résolution: 5-10 minutes

---

**Erreur Affichée:**
```
"Erreur lors de l'enregistrement comptable. Transaction annulée."
```

**Explication à donner:**
> "Une erreur technique a empêché l'enregistrement.
> Votre solde n'a PAS été modifié et aucune opération n'a été effectuée.
> Veuillez réessayer ou contacter le support."

**Action technique:**
- Vérifier les logs pour identifier la cause
- Corriger le problème (compte manquant, règle incorrecte, etc.)

---

## 📊 Rapports de Monitoring

### Emplacement des Rapports
```
logs/gl-monitoring/
├── monitor-2026-02-02T09-00-00.json
├── monitor-2026-02-02T12-00-00.json
└── monitor-2026-02-02T18-00-00.json
```

### Lecture d'un Rapport

**Exemple de rapport:**
```json
{
  "timestamp": "2026-02-02T09:00:00.000Z",
  "glMode": "STRICT",
  "status": "OK",
  "issues": [],
  "metrics": {
    "balanceDiscrepancy": {
      "coffres": 0,
      "caisses": 0
    },
    "accountingRules": {
      "required": 36,
      "present": 36,
      "missing": []
    },
    "movements": {
      "failedLast24h": 0,
      "pendingGlPosting": 0
    },
    "logErrors": {
      "glPostingFailures": 0,
      "missingRulesErrors": 0
    }
  }
}
```

**Indicateurs Clés:**
- `status`: OK / WARNING / CRITICAL
- `issues`: Liste des problèmes détectés
- `balanceDiscrepancy`: Doit être 0 en permanence
- `accountingRules.missing`: Doit être vide []

---

## 🔔 Configuration des Alertes

### Cron Job (Recommandé)

**Éditer crontab:**
```bash
crontab -e
```

**Ajouter les tâches:**
```cron
# Monitoring GL Strict - Tous les jours à 9h, 12h, 18h
0 9 * * * cd /path/to/cofinco && npm run monitor:gl:alert >> /var/log/cofinco/cron-monitor.log 2>&1
0 12 * * * cd /path/to/cofinco && npm run monitor:gl:alert >> /var/log/cofinco/cron-monitor.log 2>&1
0 18 * * * cd /path/to/cofinco && npm run monitor:gl:alert >> /var/log/cofinco/cron-monitor.log 2>&1

# Diagnostic balance - Tous les jours à 23h
0 23 * * * cd /path/to/cofinco && npm run diagnose:balance >> /var/log/cofinco/cron-balance.log 2>&1
```

**Avec notification email (si configuré):**
```bash
#!/bin/bash
# /path/to/scripts/monitor-with-alert.sh

cd /path/to/cofinco
npm run monitor:gl:alert

if [ $? -ne 0 ]; then
    echo "Alerte GL Strict: Problème détecté" | mail -s "Alerte Cofinco" admin@example.com
fi
```

---

## 📚 Ressources et Documentation

### Documents de Référence
- [IMPLEMENTATION_GL_STRICT.md](./IMPLEMENTATION_GL_STRICT.md) - Guide technique complet
- [MIGRATION_GL_STRICT_GUIDE.md](./MIGRATION_GL_STRICT_GUIDE.md) - Plan de migration détaillé
- [QUICK_START_GL_STRICT.md](./QUICK_START_GL_STRICT.md) - Guide de démarrage rapide
- [CHANGELOG_GL_STRICT.md](./CHANGELOG_GL_STRICT.md) - Historique des modifications (Part 1)
- [CHANGELOG_GL_STRICT_PART2.md](./CHANGELOG_GL_STRICT_PART2.md) - Historique des modifications (Part 2)

### Commandes Utiles
```bash
# Monitoring
npm run monitor:gl              # Monitoring standard
npm run monitor:gl:alert        # Monitoring avec alertes

# Diagnostic
npm run diagnose:balance        # Vérifier écarts de balance
npm run verify:accounting-rules # Vérifier règles comptables
npm run audit:integrity         # Audit complet

# Logs
tail -f logs/app.log | grep -i "error\|règle\|GL"
pm2 logs cofinco --lines 100
```

### Contacts d'Urgence
- **Lead Technique**: [Contact]
- **Support BDD**: [Contact]
- **Escalade**: [Contact]

---

## ✅ Checklist Quotidienne

### Chaque Matin (09h00)
- [ ] Exécuter `npm run monitor:gl`
- [ ] Vérifier statut: OK / WARNING / CRITICAL
- [ ] Si WARNING: Investiguer et corriger
- [ ] Si CRITICAL: Appliquer procédure d'urgence
- [ ] Noter le statut dans le journal de bord

### Chaque Midi (12h00)
- [ ] Surveiller logs en temps réel (5 min)
- [ ] Vérifier aucune erreur GL
- [ ] Si erreurs: Investiguer

### Chaque Soir (18h00)
- [ ] Exécuter `npm run monitor:gl`
- [ ] Exécuter `npm run diagnose:balance`
- [ ] Comparer avec statut du matin
- [ ] Rapporter anomalies au lead

### Chaque Lundi (Hebdomadaire)
- [ ] Audit complet (verify + integrity + monitor)
- [ ] Archiver rapports
- [ ] Analyser tendances
- [ ] Planifier optimisations

---

## 🎯 KPIs à Suivre

### Indicateurs Critiques
| KPI | Objectif | Fréquence |
|-----|----------|-----------|
| Écarts de balance | 0 FCFA | Quotidien |
| Mouvements FAILED | 0 | Quotidien |
| Règles manquantes | 0 | Hebdomadaire |
| Temps de réponse API | < baseline + 5% | Hebdomadaire |

### Seuils d'Alerte
- **Écart de balance > 100 FCFA**: Investigation requise
- **Mouvements FAILED > 5 / jour**: Investigation requise
- **Règles manquantes > 0**: Création immédiate
- **Erreurs GL > 10 / jour**: Analyse des patterns

---

## 📞 Support

### En Cas de Doute
1. **Vérifier la documentation** (5 min)
2. **Consulter les logs** (5 min)
3. **Exécuter le monitoring** (2 min)
4. **Contacter le lead technique** si problème persiste

### Principe de Précaution
> En cas de doute sur une manipulation, il vaut mieux:
> 1. Passer temporairement en LENIENT
> 2. Consulter l'équipe technique
> 3. Corriger le problème à tête reposée
> 4. Repasser en STRICT après validation

**Ne jamais hésiter à demander de l'aide!**

---

**Document Version**: 1.0
**Dernière mise à jour**: 2026-02-02
**Prochaine révision**: 2026-03-02
