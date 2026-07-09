#!/bin/bash
# =============================================================================
# MTN MoMo Production - Configuration & Validation Script
# =============================================================================
#
# IMPORTANT: En production, vous ne pouvez PAS créer d'API User via script!
# Les credentials production sont obtenus via le processus d'onboarding MTN:
#
# 1. S'inscrire sur le MTN Developer Portal (https://momodeveloper.mtn.com)
# 2. Créer un compte Business/Partner
# 3. Soumettre une demande de mise en production
# 4. Attendre l'approbation MTN
# 5. Recevoir vos credentials production par email sécurisé
#
# Ce script:
# - Valide vos credentials production existants
# - Teste l'obtention du token
# - Génère la configuration .env pour production
#
# Usage: ./mtn-production-setup.sh
# =============================================================================

set -e

# =============================================================================
# Configuration Production - À REMPLIR
# =============================================================================

# URL de l'API production MTN Congo
BASE_URL="https://proxy.momoapi.mtn.com"
# Autres pays possibles:
# Cameroun: https://proxy.momoapi.mtn.com (mtncameroon)
# Côte d'Ivoire: https://proxy.momoapi.mtn.com (mtnivorycoast)
# Ghana: https://proxy.momoapi.mtn.com (mtnghana)

# Target Environment pour MTN Congo
TARGET_ENVIRONMENT="mtncongo"

# Vos credentials (reçus de MTN après onboarding)
read -p "Entrez votre API User ID (UUID fourni par MTN): " API_USER_ID
read -sp "Entrez votre API Key (fourni par MTN): " API_KEY
echo ""

# Subscription Keys (depuis votre portail développeur)
read -p "Subscription Key Collection: " COLLECTION_KEY
read -p "Subscription Key Disbursement: " DISBURSEMENT_KEY

# Callback URL (doit être HTTPS en production!)
read -p "Callback URL HTTPS (ex: https://microflex.com/api/webhooks/mtn): " CALLBACK_URL

# Valider que c'est HTTPS
if [[ ! "$CALLBACK_URL" =~ ^https:// ]]; then
  echo "⚠ ERREUR: En production, le callback URL doit être HTTPS!"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║          MTN MoMo Production - Validation des Credentials        ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Base URL:           $BASE_URL"
echo "Target Environment: $TARGET_ENVIRONMENT"
echo "API User ID:        ${API_USER_ID:0:8}****"
echo "Callback URL:       $CALLBACK_URL"
echo ""

# =============================================================================
# 1. Tester le token Collection
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Test du token Collection..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BASIC_AUTH=$(echo -n "$API_USER_ID:$API_KEY" | base64)

COLLECTION_TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/collection/token/" \
  -H "Authorization: Basic $BASIC_AUTH" \
  -H "Ocp-Apim-Subscription-Key: $COLLECTION_KEY" \
  --connect-timeout 30)

HTTP_CODE=$(echo "$COLLECTION_TOKEN_RESPONSE" | tail -1)
TOKEN_BODY=$(echo "$COLLECTION_TOKEN_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  ACCESS_TOKEN=$(echo "$TOKEN_BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  EXPIRES_IN=$(echo "$TOKEN_BODY" | grep -o '"expires_in":[0-9]*' | cut -d':' -f2)
  echo "✓ Token Collection obtenu!"
  echo "  - Expire dans: ${EXPIRES_IN}s"
  COLLECTION_OK=true
else
  echo "✗ Erreur Collection: HTTP $HTTP_CODE"
  echo "  Réponse: $TOKEN_BODY"
  COLLECTION_OK=false
fi

# =============================================================================
# 2. Tester le token Disbursement
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Test du token Disbursement..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DISBURSEMENT_TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/disbursement/token/" \
  -H "Authorization: Basic $BASIC_AUTH" \
  -H "Ocp-Apim-Subscription-Key: $DISBURSEMENT_KEY" \
  --connect-timeout 30)

HTTP_CODE=$(echo "$DISBURSEMENT_TOKEN_RESPONSE" | tail -1)
TOKEN_BODY=$(echo "$DISBURSEMENT_TOKEN_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  ACCESS_TOKEN=$(echo "$TOKEN_BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  EXPIRES_IN=$(echo "$TOKEN_BODY" | grep -o '"expires_in":[0-9]*' | cut -d':' -f2)
  echo "✓ Token Disbursement obtenu!"
  echo "  - Expire dans: ${EXPIRES_IN}s"
  DISBURSEMENT_OK=true
else
  echo "✗ Erreur Disbursement: HTTP $HTTP_CODE"
  echo "  Réponse: $TOKEN_BODY"
  DISBURSEMENT_OK=false
fi

# =============================================================================
# 3. Générer le callback token
# =============================================================================
CALLBACK_TOKEN=$(openssl rand -hex 32)

# =============================================================================
# RÉSUMÉ ET CONFIGURATION
# =============================================================================
echo ""
echo ""

if [ "$COLLECTION_OK" = true ] && [ "$DISBURSEMENT_OK" = true ]; then
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║     ✓ TOUS LES TESTS RÉUSSIS - CONFIGURATION PRODUCTION         ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
else
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║     ⚠ CERTAINS TESTS ONT ÉCHOUÉ - VÉRIFIEZ VOS CREDENTIALS      ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
fi

echo ""
echo "# =================================================================="
echo "# CONFIGURATION .env PRODUCTION"
echo "# =================================================================="
echo ""
echo "# ===== MTN MoMo (Production Congo) ====="
echo "MTN_MOMO_ENVIRONMENT=production"
echo "MTN_MOMO_BASE_URL=$BASE_URL"
echo "MTN_MOMO_TARGET_ENVIRONMENT=$TARGET_ENVIRONMENT"
echo ""
echo "# API User credentials"
echo "MTN_MOMO_API_USER_ID=$API_USER_ID"
echo "MTN_MOMO_API_KEY=$API_KEY"
echo ""
echo "# Subscription Keys par produit"
echo "MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY=$COLLECTION_KEY"
echo "MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY=$DISBURSEMENT_KEY"
echo ""
echo "# Callback (HTTPS obligatoire)"
echo "MTN_MOMO_CALLBACK_URL=$CALLBACK_URL"
echo "MTN_MOMO_CALLBACK_TOKEN=$CALLBACK_TOKEN"
echo ""
echo "# Options Congo"
echo "MTN_MOMO_CURRENCY=XAF"
echo "MTN_MOMO_COUNTRY=CG"
echo ""
echo "# =================================================================="
echo ""

# =============================================================================
# Conseils de sécurité
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                    CONSEILS DE SÉCURITÉ                          ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "1. Ne commitez JAMAIS le fichier .env dans git!"
echo "   Ajoutez .env à votre .gitignore"
echo ""
echo "2. Utilisez un gestionnaire de secrets en production:"
echo "   - AWS Secrets Manager"
echo "   - HashiCorp Vault"
echo "   - Google Secret Manager"
echo ""
echo "3. Activez la validation IP des webhooks:"
echo "   WEBHOOK_IP_VALIDATION=true"
echo ""
echo "4. Configurez le rate limiting sur vos endpoints webhooks"
echo ""
echo "5. Surveillez les logs pour détecter les anomalies"
echo ""
echo "6. Gardez le CALLBACK_TOKEN secret - il sert à vérifier"
echo "   l'authenticité des webhooks MTN"
echo ""
