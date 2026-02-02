#!/bin/bash
###############################################################################
# Script de Configuration Automatique du Monitoring GL Strict
#
# Ce script configure les tâches cron pour le monitoring automatique
#
# Usage:
#   ./scripts/setup-cron-monitoring.sh
#   ./scripts/setup-cron-monitoring.sh --dry-run  # Voir sans installer
#
###############################################################################

set -e

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_LOG_DIR="$PROJECT_DIR/logs"
DRY_RUN=false
EMAIL_ALERT=""

# Couleurs pour output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --email=*)
      EMAIL_ALERT="${arg#*=}"
      shift
      ;;
    *)
      ;;
  esac
done

echo -e "${GREEN}=== Configuration du Monitoring GL Strict ===${NC}\n"
echo "Répertoire du projet: $PROJECT_DIR"
echo "Mode dry-run: $DRY_RUN"
echo ""

# Vérifier que le projet existe
if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo -e "${RED}❌ Erreur: package.json introuvable dans $PROJECT_DIR${NC}"
  exit 1
fi

# Créer le répertoire de logs si nécessaire
if [ "$DRY_RUN" = false ]; then
  if [ ! -d "$CRON_LOG_DIR" ]; then
    echo -e "${YELLOW}Création du répertoire de logs: $CRON_LOG_DIR${NC}"
    mkdir -p "$CRON_LOG_DIR"
  fi
fi

# Créer le script wrapper pour les alertes email
ALERT_SCRIPT="$PROJECT_DIR/scripts/monitor-with-email-alert.sh"

cat > "$ALERT_SCRIPT" << 'EOF'
#!/bin/bash
###############################################################################
# Script Wrapper pour Monitoring avec Alerte Email
###############################################################################

PROJECT_DIR="__PROJECT_DIR__"
EMAIL="__EMAIL__"

cd "$PROJECT_DIR"

# Exécuter le monitoring en mode alerte
npm run monitor:gl:alert > /tmp/monitor-result.txt 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  # Problème détecté - Envoyer email
  if [ -n "$EMAIL" ] && command -v mail &> /dev/null; then
    SUBJECT="[ALERTE] Cofinco GL Strict - Problème Détecté"
    cat /tmp/monitor-result.txt | mail -s "$SUBJECT" "$EMAIL"
  fi

  # Logger
  echo "$(date): ALERTE - Problème GL Strict détecté (exit code: $EXIT_CODE)"
fi

# Toujours afficher le résultat
cat /tmp/monitor-result.txt
exit $EXIT_CODE
EOF

# Remplacer les placeholders
sed -i "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$ALERT_SCRIPT"
sed -i "s|__EMAIL__|$EMAIL_ALERT|g" "$ALERT_SCRIPT"

if [ "$DRY_RUN" = false ]; then
  chmod +x "$ALERT_SCRIPT"
  echo -e "${GREEN}✓ Script d'alerte créé: $ALERT_SCRIPT${NC}"
else
  echo -e "${YELLOW}[DRY-RUN] Créerait: $ALERT_SCRIPT${NC}"
fi

# Définir les tâches cron
CRON_TASKS="# Cofinco - Monitoring GL Strict (ajouté le $(date))
# Monitoring complet - 3 fois par jour (9h, 12h, 18h)
0 9 * * * cd $PROJECT_DIR && $ALERT_SCRIPT >> $CRON_LOG_DIR/cron-monitor.log 2>&1
0 12 * * * cd $PROJECT_DIR && npm run monitor:gl >> $CRON_LOG_DIR/cron-monitor.log 2>&1
0 18 * * * cd $PROJECT_DIR && $ALERT_SCRIPT >> $CRON_LOG_DIR/cron-monitor.log 2>&1

# Diagnostic des balances - Chaque soir à 23h
0 23 * * * cd $PROJECT_DIR && npm run diagnose:balance >> $CRON_LOG_DIR/cron-balance.log 2>&1

# Vérification des règles - Chaque lundi à 8h
0 8 * * 1 cd $PROJECT_DIR && npm run verify:accounting-rules >> $CRON_LOG_DIR/cron-rules.log 2>&1

# Audit d'intégrité complet - Premier jour du mois à 1h
0 1 1 * * cd $PROJECT_DIR && npm run audit:integrity >> $CRON_LOG_DIR/cron-audit.log 2>&1
"

echo ""
echo -e "${GREEN}=== Tâches Cron à Installer ===${NC}"
echo "$CRON_TASKS"
echo ""

if [ "$DRY_RUN" = false ]; then
  # Demander confirmation
  read -p "Installer ces tâches cron? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Sauvegarder le crontab actuel
    BACKUP_FILE="/tmp/crontab-backup-$(date +%Y%m%d-%H%M%S).txt"
    crontab -l > "$BACKUP_FILE" 2>/dev/null || true
    echo -e "${GREEN}✓ Crontab sauvegardé: $BACKUP_FILE${NC}"

    # Ajouter les nouvelles tâches
    (crontab -l 2>/dev/null || true; echo "$CRON_TASKS") | crontab -
    echo -e "${GREEN}✓ Tâches cron installées${NC}"

    # Vérifier
    echo ""
    echo -e "${GREEN}=== Crontab Actuel ===${NC}"
    crontab -l | grep -A 12 "Cofinco - Monitoring"

    echo ""
    echo -e "${GREEN}✅ Installation terminée!${NC}"
    echo ""
    echo "📋 Prochaines étapes:"
    echo "  1. Les logs seront dans: $CRON_LOG_DIR/"
    echo "  2. Vérifier les logs avec: tail -f $CRON_LOG_DIR/cron-monitor.log"
    echo "  3. Les alertes email seront envoyées à: ${EMAIL_ALERT:-'(non configuré)'}"
    echo ""
    echo "Pour désinstaller:"
    echo "  crontab -e  # Puis supprimer les lignes Cofinco"
  else
    echo -e "${YELLOW}Installation annulée${NC}"
  fi
else
  echo -e "${YELLOW}[DRY-RUN] Mode simulation - Aucune modification effectuée${NC}"
  echo ""
  echo "Pour installer réellement:"
  echo "  ./scripts/setup-cron-monitoring.sh"
  echo ""
  echo "Avec alertes email:"
  echo "  ./scripts/setup-cron-monitoring.sh --email=admin@example.com"
fi
