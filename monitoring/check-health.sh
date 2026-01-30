#!/bin/bash
# Script de vérification de la stack de monitoring

echo "========================================="
echo "  COFINCO Monitoring Health Check"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_service() {
    local name=$1
    local url=$2
    local expected=$3

    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)

    if [ "$response" = "$expected" ]; then
        echo -e "  $name: ${GREEN}OK${NC} (HTTP $response)"
        return 0
    else
        echo -e "  $name: ${RED}FAIL${NC} (HTTP $response, expected $expected)"
        return 1
    fi
}

echo "1. Services Health"
echo "-----------------------------------------"
check_service "Prometheus" "http://localhost:9090/-/healthy" "200"
check_service "Grafana" "http://localhost:3001/api/health" "200"
check_service "App Metrics" "http://localhost:5000/api/metrics" "200"

echo ""
echo "2. Prometheus Targets"
echo "-----------------------------------------"
targets=$(curl -s "http://localhost:9090/api/v1/targets" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "$targets" | jq -r '.data.activeTargets[] | "  \(.labels.job): \(.health)"' 2>/dev/null || echo "  ${YELLOW}Could not parse targets${NC}"
else
    echo -e "  ${RED}Cannot reach Prometheus${NC}"
fi

echo ""
echo "3. App Metrics Sample"
echo "-----------------------------------------"
metrics=$(curl -s "http://localhost:5000/api/metrics" 2>/dev/null | head -20)
if [ -n "$metrics" ]; then
    echo "$metrics" | grep -E "^(http_|cofinco_)" | head -5 | sed 's/^/  /'
    echo "  ..."
else
    echo -e "  ${YELLOW}No metrics available (is the app running?)${NC}"
fi

echo ""
echo "4. Quick Queries to Try in Grafana"
echo "-----------------------------------------"
echo "  Prometheus: up"
echo "  Prometheus: rate(http_requests_total[5m])"
echo "  Prometheus: cofinco_process_cpu_seconds_total"

echo ""
echo "========================================="
echo "  Grafana UI: http://localhost:3001"
echo "  Login: admin / admin123"
echo "========================================="
