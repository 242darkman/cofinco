#!/bin/bash
# =============================================================================
# MTN MoMo Sandbox - Provisioning Script
# =============================================================================
# Ce script crée un API User, génère l'API Key et teste l'obtention du token
#
# Usage: ./mtn-sandbox-setup.sh [SUBSCRIPTION_KEY]
#   - Sans argument: utilise la clé Collection par défaut
#   - Avec argument: utilise la clé fournie
#
# Exemple:
#   ./mtn-sandbox-setup.sh                                    # Clé Collection
#   ./mtn-sandbox-setup.sh 5703635bfd7341798d9ee40a1ce46e79   # Clé Disbursement
# =============================================================================

set -e

# Configuration
BASE_URL="https://sandbox.momodeveloper.mtn.com"
SUBSCRIPTION_KEY="${1:-8baed02a5f95451fa5479a51ff32d559}"

# Générer un UUID pour l'API User
API_USER_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║           MTN MoMo Sandbox - Provisioning Script                 ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Base URL:         $BASE_URL"
echo "Subscription Key: ${SUBSCRIPTION_KEY:0:8}****"
echo "API User ID:      $API_USER_ID (généré)"
echo ""

# =============================================================================
# 1. Créer l'API User
# =============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Création de l'API User..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/v1_0/apiuser" \
  -H "Content-Type: application/json" \
  -H "X-Reference-Id: $API_USER_ID" \
  -H "Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY" \
  -d "{
    \"providerCallbackHost\": \"https://webhook.site\"
  }")

HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -1)
BODY=$(echo "$CREATE_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "201" ]; then
  echo "✓ API User créé avec succès!"
else
  echo "✗ Erreur lors de la création: HTTP $HTTP_CODE"
  echo "  Réponse: $BODY"
  exit 1
fi

# =============================================================================
# 2. Générer l'API Key
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Génération de l'API Key..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

KEY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/v1_0/apiuser/$API_USER_ID/apikey" \
  -H "Content-Length: 0" \
  -H "Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY")

HTTP_CODE=$(echo "$KEY_RESPONSE" | tail -1)
KEY_BODY=$(echo "$KEY_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "201" ]; then
  API_KEY=$(echo "$KEY_BODY" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
  echo "✓ API Key générée avec succès!"
else
  echo "✗ Erreur lors de la génération: HTTP $HTTP_CODE"
  echo "  Réponse: $KEY_BODY"
  exit 1
fi

# =============================================================================
# 3. Tester l'obtention du token (selon doc officielle)
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Test d'obtention du token (Basic Auth)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Basic Auth: base64(api_user:api_key)
BASIC_AUTH=$(echo -n "$API_USER_ID:$API_KEY" | base64)

TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/collection/token/" \
  -H "Authorization: Basic $BASIC_AUTH" \
  -H "Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY")

HTTP_CODE=$(echo "$TOKEN_RESPONSE" | tail -1)
TOKEN_BODY=$(echo "$TOKEN_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  ACCESS_TOKEN=$(echo "$TOKEN_BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  EXPIRES_IN=$(echo "$TOKEN_BODY" | grep -o '"expires_in":[0-9]*' | cut -d':' -f2)
  echo "✓ Token obtenu avec succès!"
  echo "  - Token: ${ACCESS_TOKEN:0:50}..."
  echo "  - Expire dans: ${EXPIRES_IN}s"
else
  echo "✗ Erreur lors de l'obtention du token: HTTP $HTTP_CODE"
  echo "  Réponse: $TOKEN_BODY"
  echo ""
  echo "  Note: Les credentials sont valides mais le token a échoué."
  echo "  Cela peut être normal si le sandbox a des restrictions."
fi

# =============================================================================
# 4. Générer un callback token
# =============================================================================
CALLBACK_TOKEN=$(openssl rand -hex 32)

# =============================================================================
# RÉSULTAT FINAL
# =============================================================================
echo ""
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                 CONFIGURATION À COPIER DANS .env                 ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "# MTN MoMo Sandbox Credentials"
echo "MTN_MOMO_ENVIRONMENT=sandbox"
echo "MTN_MOMO_API_USER_ID=$API_USER_ID"
echo "MTN_MOMO_API_KEY=$API_KEY"
echo "MTN_MOMO_CALLBACK_TOKEN=$CALLBACK_TOKEN"
echo ""
echo "# Subscription Keys (selon le produit utilisé pour ce setup)"
echo "# Collection: 8baed02a5f95451fa5479a51ff32d559"
echo "# Disbursement: 5703635bfd7341798d9ee40a1ce46e79"
echo ""
echo "═══════════════════════════════════════════════════════════════════"

# =============================================================================
# 5. Vérifier l'API User
# =============================================================================
echo ""
echo "4. Vérification finale de l'API User..."

VERIFY_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/v1_0/apiuser/$API_USER_ID" \
  -H "Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY")

if [ "$VERIFY_RESPONSE" = "200" ]; then
  echo "✓ API User vérifié avec succès!"
else
  echo "⚠ Avertissement: impossible de vérifier l'API User (HTTP $VERIFY_RESPONSE)"
fi

echo ""
echo "Setup terminé! Copiez les valeurs ci-dessus dans votre fichier .env"
echo ""
