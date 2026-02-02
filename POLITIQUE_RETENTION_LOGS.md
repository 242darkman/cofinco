# Politique de Rétention des Logs

**Date de mise en place**: 2026-02-02
**Statut**: ✅ Actif avec nettoyage automatique

---

## 📋 Vue d'Ensemble

Le système implémente un nettoyage automatique des logs pour:
- ✅ Éviter la croissance illimitée du stockage
- ✅ Maintenir les performances du système
- ✅ Conserver uniquement les données pertinentes
- ✅ Respecter les bonnes pratiques de gestion des logs

---

## 🗂️ Politiques de Rétention

### Logs Applicatifs (Winston)
**Gestion**: Automatique via `winston-daily-rotate-file`
- **Logs courants** (`app-current.log`, `error-current.log`): Conservation permanente (liens symboliques)
- **Logs archivés** (`app-YYYY-MM-DD.log`): Rotation journalière
- **Logs compressés** (`app-YYYY-MM-DD.log.gz`): 90 jours
- **Taille maximale**: 20MB par fichier

**Configuration dans**: `server/logger.ts`

### Rapports de Monitoring GL
**Répertoire**: `logs/gl-monitoring/`
**Rétention**: 30 jours

**Fichiers concernés**:
```
monitor-2026-02-02T09-00-00.json
monitor-2026-02-02T12-00-00.json
monitor-2026-02-02T18-00-00.json
```

**Justification**: 30 jours permettent de:
- Analyser les tendances récentes
- Investiguer les problèmes des dernières semaines
- Comparer les métriques période par période

### Rapports d'Audit
**Répertoire**: `logs/audit-reports/`
**Rétention**: 90 jours

**Fichiers concernés**:
```
audit-YYYY-MM-DD.json
integrity-report-YYYY-MM-DD.json
```

**Justification**: 90 jours pour:
- Conformité réglementaire
- Audits trimestriels
- Analyse des tendances à long terme

### Logs Cron
**Répertoire**: `logs/`
**Rétention**: 30 jours

**Fichiers concernés**:
```
cron-monitor.log      # Résultats du monitoring
cron-balance.log      # Diagnostics de balance
cron-rules.log        # Vérifications des règles
cron-audit.log        # Audits complets
cron-cleanup.log      # Logs du nettoyage lui-même
```

**Justification**: 30 jours suffisent pour:
- Vérifier l'exécution des tâches planifiées
- Déboguer les problèmes cron
- Analyser l'historique récent

---

## 🤖 Nettoyage Automatique

### Configuration Cron

**Fréquence**: Chaque nuit à 02h00
```cron
0 2 * * * cd /path/to/cofinco && npm run cleanup:logs
```

**Logs du nettoyage**: `logs/cron-cleanup.log`

### Processus de Nettoyage

Le script `scripts/cleanup-logs.ts` effectue:

1. **Scan des répertoires**:
   - `logs/gl-monitoring/` (30 jours)
   - `logs/audit-reports/` (90 jours)

2. **Scan par pattern**:
   - `cron-*.log` (30 jours)
   - `*.gz` (90 jours)

3. **Calcul de l'âge**:
   - Basé sur la date de dernière modification (`mtime`)
   - Comparaison avec la politique de rétention

4. **Suppression**:
   - Fichiers plus anciens que la politique
   - Mise à jour des statistiques

5. **Rapport**:
   - Fichiers analysés
   - Fichiers supprimés
   - Espace libéré

---

## 💻 Commandes Manuelles

### Nettoyage Manuel

**Simulation (voir ce qui serait supprimé):**
```bash
npm run cleanup:logs:dry-run
```

**Résultat attendu:**
```
=== NETTOYAGE AUTOMATIQUE DES LOGS ===
Mode: DRY-RUN (simulation)

📁 Nettoyage: gl-monitoring (rétention: 30 jours)
  [DRY-RUN] Supprimerait: monitor-2025-12-15T09-00-00.json (2.45 KB)
  [DRY-RUN] Supprimerait: monitor-2025-12-15T12-00-00.json (2.38 KB)
  ...

=== RÉSUMÉ ===
Fichiers analysés:  125
Fichiers supprimés: 45
Espace libéré:      1.23 MB
```

**Nettoyage réel:**
```bash
npm run cleanup:logs
```

### Vérifier l'Utilisation du Disque

**Taille totale du dossier logs:**
```bash
du -sh logs/
```

**Détail par sous-répertoire:**
```bash
du -sh logs/*/
```

**Fichiers les plus volumineux:**
```bash
find logs/ -type f -exec du -h {} + | sort -rh | head -20
```

### Vérifier les Logs du Nettoyage

**Derniers nettoyages:**
```bash
tail -100 logs/cron-cleanup.log
```

**Statistiques des nettoyages:**
```bash
grep "Espace libéré" logs/cron-cleanup.log
```

---

## 📊 Monitoring de l'Espace Disque

### Vérification Quotidienne

Ajouter au monitoring quotidien:
```bash
# Vérifier l'espace disque
df -h | grep -E "Filesystem|/$"

# Taille du dossier logs
du -sh /path/to/cofinco/logs/
```

### Alertes Recommandées

**Seuils d'alerte**:
- ⚠️  Warning: Logs > 500 MB
- ❌ Critical: Logs > 1 GB ou Disque > 80%

**Script d'alerte** (à ajouter au monitoring):
```bash
#!/bin/bash
LOGS_SIZE=$(du -sm logs/ | cut -f1)

if [ $LOGS_SIZE -gt 1000 ]; then
  echo "CRITICAL: Logs trop volumineux (${LOGS_SIZE}MB)"
  exit 2
elif [ $LOGS_SIZE -gt 500 ]; then
  echo "WARNING: Logs volumineux (${LOGS_SIZE}MB)"
  exit 1
fi

echo "OK: Logs dans les limites (${LOGS_SIZE}MB)"
```

---

## 🔧 Ajuster les Politiques de Rétention

### Modifier les Durées

**Éditer** `scripts/cleanup-logs.ts`:

```typescript
const RETENTION_POLICIES = {
  'gl-monitoring': 30,      // Modifier ici (jours)
  'audit-reports': 90,      // Modifier ici (jours)
  'cron-*.log': 30,         // Modifier ici (jours)
};
```

**Puis redéployer:**
```bash
# Le script sera utilisé automatiquement la nuit suivante
# Ou forcer un nettoyage immédiat:
npm run cleanup:logs
```

### Ajouter une Nouvelle Catégorie

**Exemple**: Nettoyer les exports CSV de plus de 15 jours:

```typescript
// Dans scripts/cleanup-logs.ts, après les nettoyages existants:

// 5. Nettoyer les exports CSV
cleanupLogsByPattern('export-*.csv', 15);
```

---

## 📈 Estimation de l'Espace

### Calcul Théorique

**Par jour:**
- Monitoring GL: 3 rapports × 2 KB = 6 KB
- Logs cron: ~50 KB (tous combinés)
- Logs applicatifs: Variable (dépend du trafic)
- Rapports d'audit: ~500 KB (mensuels)

**Par mois (estimation):**
- Monitoring: 6 KB × 30 = 180 KB
- Cron: 50 KB × 30 = 1.5 MB
- Applicatifs: ~100-500 MB (dépend du trafic)
- Audit: ~500 KB

**Total par mois**: ~100-500 MB (variable selon l'activité)

**Avec nettoyage automatique**: Espace stabilisé à ~150-300 MB maximum

---

## 🆘 Problèmes et Solutions

### Problème 1: Logs Croissent Trop Vite

**Symptôme**: Logs > 1 GB en quelques jours

**Diagnostic:**
```bash
# Identifier les fichiers volumineux
find logs/ -type f -size +50M

# Voir la croissance récente
find logs/ -type f -mtime -7 -exec ls -lh {} \;
```

**Solutions:**
1. **Réduire la verbosité** des logs applicatifs:
   ```typescript
   // server/logger.ts
   level: process.env.LOG_LEVEL || 'info'  // Au lieu de 'debug'
   ```

2. **Réduire la rétention** des logs cron:
   ```typescript
   'cron-*.log': 15,  // Au lieu de 30
   ```

3. **Activer la rotation** plus agressive:
   ```typescript
   maxSize: '10m',  // Au lieu de '20m'
   ```

### Problème 2: Nettoyage Automatique Ne S'Exécute Pas

**Diagnostic:**
```bash
# Vérifier que la tâche cron existe
crontab -l | grep cleanup

# Vérifier le log du nettoyage
tail -50 logs/cron-cleanup.log

# Vérifier que cron est actif
sudo systemctl status cron
```

**Solutions:**
1. **Réinstaller la tâche cron**:
   ```bash
   # Éditer crontab
   crontab -e

   # Ajouter:
   0 2 * * * cd /path/to/cofinco && npm run cleanup:logs >> /path/to/logs/cron-cleanup.log 2>&1
   ```

2. **Tester manuellement**:
   ```bash
   npm run cleanup:logs
   ```

### Problème 3: Espace Disque Plein Malgré le Nettoyage

**Diagnostic:**
```bash
# Vérifier l'espace disque
df -h

# Identifier les gros répertoires
du -sh /* | sort -rh | head -10

# Vérifier les fichiers supprimés mais toujours ouverts
sudo lsof | grep deleted
```

**Solutions:**
1. **Redémarrer l'application** (libère les fichiers supprimés):
   ```bash
   pm2 restart cofinco
   ```

2. **Nettoyer d'autres dossiers**:
   ```bash
   # Temp files
   rm -rf /tmp/*

   # Docker (si utilisé)
   docker system prune -a
   ```

3. **Ajuster les politiques** de rétention (réduire à 15 jours)

---

## ✅ Checklist de Maintenance

### Hebdomadaire
- [ ] Vérifier `logs/cron-cleanup.log` (derniers nettoyages)
- [ ] Vérifier l'espace disque (`df -h`)
- [ ] Vérifier la taille des logs (`du -sh logs/`)

### Mensuel
- [ ] Analyser les tendances d'espace disque
- [ ] Ajuster les politiques si nécessaire
- [ ] Archiver les rapports d'audit importants ailleurs

### Trimestriel
- [ ] Réviser les politiques de rétention
- [ ] Optimiser la verbosité des logs
- [ ] Documenter les changements

---

## 📚 Ressources

### Scripts
- [cleanup-logs.ts](scripts/cleanup-logs.ts) - Script principal de nettoyage
- [monitor-gl-strict.ts](scripts/monitor-gl-strict.ts) - Monitoring (inclut nettoyage des rapports)

### Documentation
- [Winston Daily Rotate File](https://github.com/winstonjs/winston-daily-rotate-file) - Documentation de la rotation automatique

### Configuration
- `package.json` - Commandes `cleanup:logs` et `cleanup:logs:dry-run`
- `crontab` - Tâche planifiée de nettoyage

---

**Document Version**: 1.0
**Dernière mise à jour**: 2026-02-02
**Prochaine révision**: 2026-05-02

**Responsable**: Équipe technique
**Contact**: [Support technique]
