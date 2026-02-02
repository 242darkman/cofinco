#!/bin/bash
###############################################################################
# Script Wrapper pour Monitoring avec Alerte Email
###############################################################################

PROJECT_DIR="/home/brandon/Documents/Projet perso/cofinco"
EMAIL=""

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
