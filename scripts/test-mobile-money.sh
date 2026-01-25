#!/bin/bash

# ===========================================
# Script de Test Mobile Money
# ===========================================

BASE_URL="${BASE_URL:-http://localhost:5000}"
CLIENT_ID="${CLIENT_ID:-}"  # UUID d'un client existant

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Test Mobile Money ===${NC}"
echo "Base URL: $BASE_URL"
echo ""

# 1. Health Check
echo -e "${YELLOW}1. Vérification santé des providers...${NC}"
HEALTH=$(curl -s "$BASE_URL/api/payments-test/health")
echo "$HEALTH" | jq .
echo ""

# Vérifier si les tables existent
DB_STATUS=$(echo "$HEALTH" | jq -r '.database')
if [ "$DB_STATUS" != "connected" ]; then
    echo -e "${RED}ERREUR: Tables Mobile Money non créées!${NC}"
    echo "Exécutez: psql -d cofinco -f migrations/0028_mobile_money_payments.sql"
    exit 1
fi

# 2. Si pas de CLIENT_ID, demander
if [ -z "$CLIENT_ID" ]; then
    echo -e "${YELLOW}2. Aucun CLIENT_ID fourni.${NC}"
    echo "Pour créer un mock intent, fournissez un CLIENT_ID:"
    echo "  CLIENT_ID=uuid-du-client ./scripts/test-mobile-money.sh"
    echo ""
    echo "Ou récupérez un client existant avec:"
    echo "  psql -d cofinco -c \"SELECT id, nom, prenom FROM clients LIMIT 5;\""
    exit 0
fi

# 3. Créer un mock payment intent
echo -e "${YELLOW}2. Création d'un mock payment intent...${NC}"
INTENT=$(curl -s -X POST "$BASE_URL/api/payments-test/create-mock-intent" \
    -H "Content-Type: application/json" \
    -d "{
        \"provider\": \"MTN\",
        \"type\": \"COLLECTION\",
        \"amount\": 5000,
        \"phone\": \"242064000000\",
        \"clientId\": \"$CLIENT_ID\"
    }")
echo "$INTENT" | jq .

INTENT_ID=$(echo "$INTENT" | jq -r '.intent.id')
if [ "$INTENT_ID" == "null" ] || [ -z "$INTENT_ID" ]; then
    echo -e "${RED}Erreur lors de la création du mock intent${NC}"
    exit 1
fi
echo -e "${GREEN}Intent créé: $INTENT_ID${NC}"
echo ""

# 4. Lister les intents PENDING
echo -e "${YELLOW}3. Liste des intents PENDING...${NC}"
curl -s "$BASE_URL/api/payments-test/pending" | jq .
echo ""

# 5. Simuler un webhook SUCCESS
echo -e "${YELLOW}4. Simulation webhook SUCCESS...${NC}"
WEBHOOK_RESULT=$(curl -s -X POST "$BASE_URL/api/payments-test/simulate-webhook" \
    -H "Content-Type: application/json" \
    -d "{
        \"paymentIntentId\": \"$INTENT_ID\",
        \"status\": \"SUCCESS\",
        \"providerTxnId\": \"TXN-$(date +%s)\"
    }")
echo "$WEBHOOK_RESULT" | jq .

FINAL_STATUS=$(echo "$WEBHOOK_RESULT" | jq -r '.intent.status')
if [ "$FINAL_STATUS" == "SUCCESS" ]; then
    echo -e "${GREEN}SUCCESS! Le paiement a été traité correctement.${NC}"
    echo ""
    echo "Vérifiez:"
    echo "  - mouvements_financiers: mouvement créé avec source_module = MOBILE_MONEY"
    echo "  - provider_events: événement webhook logué"
else
    echo -e "${RED}Statut inattendu: $FINAL_STATUS${NC}"
fi

echo ""
echo -e "${YELLOW}=== Test terminé ===${NC}"
