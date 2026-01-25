#!/bin/bash
# =============================================================================
# Airtel Money Congo - Configuration & Validation Script
# =============================================================================
#
# Ce script valide vos credentials Airtel et teste les endpoints disponibles
#
# Les credentials sont obtenus via le processus d'onboarding Airtel:
# 1. S'inscrire sur le portail Airtel Partner
# 2. Créer une application
# 3. Obtenir client_id et client_secret
# 4. Obtenir le PIN pour les transactions
#
# Usage:
#   ./airtel-setup.sh              # Mode interactif (demande les credentials)
#   ./airtel-setup.sh --from-env   # Utilise les variables d'environnement
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Configuration
# =============================================================================

# Default to UAT
ENVIRONMENT="${AIRTEL_ENV:-uat}"

if [ "$ENVIRONMENT" = "production" ]; then
  DEFAULT_BASE_URL="https://openapi.airtel.cg"
else
  DEFAULT_BASE_URL="https://openapiuat.airtel.cg"
fi

COUNTRY="${AIRTEL_COUNTRY:-CG}"
CURRENCY="${AIRTEL_CURRENCY:-XAF}"

# =============================================================================
# Parse arguments
# =============================================================================

USE_ENV=false
if [ "$1" = "--from-env" ]; then
  USE_ENV=true
fi

# =============================================================================
# Get credentials
# =============================================================================

if [ "$USE_ENV" = true ]; then
  BASE_URL="${AIRTEL_BASE_URL:-$DEFAULT_BASE_URL}"
  CLIENT_ID="$AIRTEL_CLIENT_ID"
  CLIENT_SECRET="$AIRTEL_CLIENT_SECRET"
  PIN="$AIRTEL_PIN"
  CALLBACK_URL="$AIRTEL_CALLBACK_URL"
else
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║         Airtel Money Congo - Configuration & Validation         ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Environnement: $ENVIRONMENT"
  echo ""

  read -p "Base URL [$DEFAULT_BASE_URL]: " BASE_URL
  BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"

  read -p "Client ID: " CLIENT_ID
  read -sp "Client Secret: " CLIENT_SECRET
  echo ""
  read -sp "PIN (4 chiffres): " PIN
  echo ""
  read -p "Callback URL (optionnel, HTTPS en prod): " CALLBACK_URL
fi

# =============================================================================
# Validation
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Validation des paramètres..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ERRORS=()

if [ -z "$CLIENT_ID" ]; then
  ERRORS+=("CLIENT_ID est requis")
fi

if [ -z "$CLIENT_SECRET" ]; then
  ERRORS+=("CLIENT_SECRET est requis")
fi

if [ -z "$PIN" ]; then
  ERRORS+=("PIN est requis")
elif [ ${#PIN} -ne 4 ]; then
  ERRORS+=("PIN doit être composé de 4 chiffres")
fi

if [ "$ENVIRONMENT" = "production" ]; then
  if [[ ! "$BASE_URL" =~ ^https:// ]]; then
    ERRORS+=("Base URL doit utiliser HTTPS en production")
  fi
  if [ -n "$CALLBACK_URL" ] && [[ ! "$CALLBACK_URL" =~ ^https:// ]]; then
    ERRORS+=("Callback URL doit utiliser HTTPS en production")
  fi
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo -e "${RED}✗ Erreurs de validation:${NC}"
  for error in "${ERRORS[@]}"; do
    echo "  - $error"
  done
  exit 1
fi

echo -e "${GREEN}✓ Paramètres validés${NC}"

# =============================================================================
# 1. Test OAuth2 Token
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Test du token OAuth2..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/auth/oauth2/token" \
  -H "Content-Type: application/json" \
  -H "Accept: */*" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"client_secret\": \"$CLIENT_SECRET\",
    \"grant_type\": \"client_credentials\"
  }" \
  --connect-timeout 30)

HTTP_CODE=$(echo "$TOKEN_RESPONSE" | tail -1)
TOKEN_BODY=$(echo "$TOKEN_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  ACCESS_TOKEN=$(echo "$TOKEN_BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  EXPIRES_IN=$(echo "$TOKEN_BODY" | grep -o '"expires_in":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$EXPIRES_IN" ]; then
    EXPIRES_IN=$(echo "$TOKEN_BODY" | grep -o '"expires_in":[0-9]*' | cut -d':' -f2)
  fi

  echo -e "${GREEN}✓ Token obtenu avec succès!${NC}"
  echo "  - Token: ${ACCESS_TOKEN:0:50}..."
  echo "  - Expire dans: ${EXPIRES_IN}s"
  TOKEN_OK=true
else
  echo -e "${RED}✗ Erreur lors de l'obtention du token: HTTP $HTTP_CODE${NC}"
  echo "  Réponse: $TOKEN_BODY"
  TOKEN_OK=false
  ACCESS_TOKEN=""
fi

# =============================================================================
# 2. Test RSA Encryption Key
# =============================================================================

if [ "$TOKEN_OK" = true ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "2. Test de récupération de la clé RSA..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  RSA_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$BASE_URL/v1/rsa/encryption-keys" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Country: $COUNTRY" \
    -H "X-Currency: $CURRENCY" \
    -H "Accept: */*" \
    --connect-timeout 30)

  HTTP_CODE=$(echo "$RSA_RESPONSE" | tail -1)
  RSA_BODY=$(echo "$RSA_RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ]; then
    RSA_KEY=$(echo "$RSA_BODY" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$RSA_KEY" ]; then
      echo -e "${GREEN}✓ Clé RSA récupérée avec succès!${NC}"
      echo "  - Clé: ${RSA_KEY:0:40}..."
      RSA_OK=true
    else
      echo -e "${YELLOW}⚠ Réponse reçue mais clé non trouvée${NC}"
      echo "  Réponse: $RSA_BODY"
      RSA_OK=false
    fi
  else
    echo -e "${YELLOW}⚠ Clé RSA non disponible: HTTP $HTTP_CODE${NC}"
    echo "  Note: Cet endpoint peut ne pas être disponible en UAT"
    RSA_OK=false
  fi
fi

# =============================================================================
# 3. Test Balance Enquiry
# =============================================================================

if [ "$TOKEN_OK" = true ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "3. Test de l'endpoint Balance..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  BALANCE_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$BASE_URL/standard/v2/users/balance" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Country: $COUNTRY" \
    -H "X-Currency: $CURRENCY" \
    -H "Accept: */*" \
    --connect-timeout 30)

  HTTP_CODE=$(echo "$BALANCE_RESPONSE" | tail -1)
  BALANCE_BODY=$(echo "$BALANCE_RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ]; then
    BALANCE=$(echo "$BALANCE_BODY" | grep -o '"balance":"[^"]*"' | cut -d'"' -f4)
    ACCOUNT_STATUS=$(echo "$BALANCE_BODY" | grep -o '"account_status":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✓ Endpoint Balance accessible!${NC}"
    if [ -n "$BALANCE" ]; then
      echo "  - Solde: $BALANCE $CURRENCY"
    fi
    if [ -n "$ACCOUNT_STATUS" ]; then
      echo "  - Statut compte: $ACCOUNT_STATUS"
    fi
    BALANCE_OK=true
  else
    echo -e "${YELLOW}⚠ Endpoint Balance non accessible: HTTP $HTTP_CODE${NC}"
    echo "  Note: Cet endpoint peut nécessiter des permissions spécifiques"
    BALANCE_OK=false
  fi
fi

# =============================================================================
# 4. Generate HMAC Secret
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Génération du secret HMAC pour les webhooks..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HMAC_SECRET=$(openssl rand -hex 32)
echo -e "${GREEN}✓ Secret HMAC généré${NC}"
echo "  - Ce secret doit être partagé avec Airtel pour la vérification des webhooks"

# =============================================================================
# RÉSUMÉ
# =============================================================================

echo ""
echo ""

if [ "$TOKEN_OK" = true ]; then
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║        ✓ AUTHENTIFICATION RÉUSSIE - CONFIGURATION PRÊTE         ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
else
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║     ⚠ ÉCHEC AUTHENTIFICATION - VÉRIFIEZ VOS CREDENTIALS         ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
fi

echo ""
echo "# =================================================================="
echo "# CONFIGURATION .env"
echo "# =================================================================="
echo ""
echo "# ===== Airtel Money Congo ====="
echo "AIRTEL_ENV=$ENVIRONMENT"
echo "AIRTEL_BASE_URL=$BASE_URL"
echo ""
echo "# OAuth2 Credentials"
echo "AIRTEL_CLIENT_ID=$CLIENT_ID"
echo "AIRTEL_CLIENT_SECRET=$CLIENT_SECRET"
echo ""
echo "# PIN pour transactions"
echo "AIRTEL_PIN=$PIN"
echo ""
echo "# Localisation"
echo "AIRTEL_COUNTRY=$COUNTRY"
echo "AIRTEL_CURRENCY=$CURRENCY"
echo ""
echo "# Callback / Webhook"
if [ -n "$CALLBACK_URL" ]; then
  echo "AIRTEL_CALLBACK_URL=$CALLBACK_URL"
else
  echo "AIRTEL_CALLBACK_URL="
fi
echo "AIRTEL_CALLBACK_HMAC_SECRET=$HMAC_SECRET"
echo ""
echo "# Signing (chiffrement V3)"
if [ "$ENVIRONMENT" = "production" ]; then
  echo "AIRTEL_SIGNING_ENABLED=true"
else
  echo "AIRTEL_SIGNING_ENABLED=false"
fi
echo ""
echo "# Timeouts et retry"
echo "AIRTEL_REQUEST_TIMEOUT=30000"
echo "AIRTEL_TOKEN_REFRESH_BUFFER=60000"
echo "AIRTEL_MAX_RETRIES=3"
echo "AIRTEL_RETRY_DELAY_MS=1000"
echo "AIRTEL_ENCRYPTION_KEY_CACHE_TTL=86400000"
echo ""
echo "# =================================================================="

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
echo "2. En production, utilisez un gestionnaire de secrets:"
echo "   - AWS Secrets Manager"
echo "   - HashiCorp Vault"
echo "   - Google Secret Manager"
echo ""
echo "3. Partagez le HMAC_SECRET avec Airtel pour la vérification"
echo "   des webhooks (signature dans le header)"
echo ""
echo "4. En production, AIRTEL_SIGNING_ENABLED=true est obligatoire"
echo "   pour les Disbursements V3"
echo ""
echo "5. Le PIN est chiffré avec RSA avant chaque envoi,"
echo "   il n'est jamais transmis en clair"
echo ""

# =============================================================================
# Résumé des tests
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Résumé des tests:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$TOKEN_OK" = true ]; then
  echo -e "  OAuth2 Token:    ${GREEN}✓ OK${NC}"
else
  echo -e "  OAuth2 Token:    ${RED}✗ FAILED${NC}"
fi

if [ "$RSA_OK" = true ]; then
  echo -e "  RSA Key:         ${GREEN}✓ OK${NC}"
else
  echo -e "  RSA Key:         ${YELLOW}⚠ Non disponible${NC}"
fi

if [ "$BALANCE_OK" = true ]; then
  echo -e "  Balance API:     ${GREEN}✓ OK${NC}"
else
  echo -e "  Balance API:     ${YELLOW}⚠ Non disponible${NC}"
fi

echo ""
echo "Setup terminé! Copiez les valeurs ci-dessus dans votre fichier .env"
echo ""
