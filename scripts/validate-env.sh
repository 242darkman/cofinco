#!/usr/bin/env bash
# ==========================================================
# MicroFlex — Validation des variables d'environnement
# ==========================================================
# Usage :
#   bash scripts/validate-env.sh .env.staging       # staging
#   bash scripts/validate-env.sh .env.production     # production
#   npm run staging:validate
#   npm run prod:validate
# ==========================================================

set -euo pipefail

# ── Couleurs ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Arguments ─────────────────────────────────────────────
ENV_FILE="${1:-.env.staging}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}✗ Fichier '$ENV_FILE' introuvable.${NC}"
  echo -e "  Créez-le à partir de .env.production.example :"
  echo -e "  ${CYAN}cp .env.production.example $ENV_FILE${NC}"
  exit 1
fi

# ── Détecter l'environnement (staging vs production) ──────
if [[ "$ENV_FILE" == *"production"* ]] || [[ "$ENV_FILE" == *"prod"* ]]; then
  ENV_MODE="production"
else
  ENV_MODE="staging"
fi

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  MicroFlex — Validation de $ENV_FILE (${ENV_MODE})${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Charger le fichier .env ───────────────────────────────
set -a
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *"="* ]] && continue
  eval "$line" 2>/dev/null || true
done < "$ENV_FILE"
set +a

ERRORS=0
WARNINGS=0

# ── Fonctions utilitaires ─────────────────────────────────
check_required() {
  local var_name="$1"
  local var_value="${!var_name:-}"

  if [[ -z "$var_value" ]]; then
    echo -e "  ${RED}✗ $var_name${NC} — manquant ou vide"
    ((ERRORS++))
    return 1
  else
    echo -e "  ${GREEN}✓ $var_name${NC}"
    return 0
  fi
}

check_secret_strength() {
  local var_name="$1"
  local min_length="$2"
  local var_value="${!var_name:-}"

  if [[ -z "$var_value" ]]; then
    return 0
  fi

  if [[ ${#var_value} -lt $min_length ]]; then
    echo -e "  ${YELLOW}⚠ $var_name${NC} — trop court (${#var_value} chars, minimum $min_length)"
    ((WARNINGS++))
  fi
}

check_no_dev_value() {
  local var_name="$1"
  shift
  local dev_values=("$@")
  local var_value="${!var_name:-}"

  if [[ -z "$var_value" ]]; then
    return 0
  fi

  for dev_val in "${dev_values[@]}"; do
    if [[ "$var_value" == "$dev_val" ]]; then
      echo -e "  ${YELLOW}⚠ $var_name${NC} — contient une valeur de développement (${dev_val})"
      ((WARNINGS++))
      return 0
    fi
  done
}

# ══════════════════════════════════════════════════════════
# 1. Variables OBLIGATOIRES (docker-compose échoue sans)
# ══════════════════════════════════════════════════════════
echo -e "${CYAN}▸ Variables obligatoires${NC}"
echo ""

check_required "POSTGRES_USER"
check_required "POSTGRES_PASSWORD"
check_required "POSTGRES_DB"
check_required "REDIS_PASSWORD"
check_required "SESSION_SECRET"
check_required "OTP_HMAC_SECRET"
check_required "MINIO_ROOT_USER"
check_required "MINIO_ROOT_PASSWORD"
check_required "GRAFANA_ADMIN_PASSWORD"

# ── Variables obligatoires PRODUCTION uniquement ──────────
if [[ "$ENV_MODE" == "production" ]]; then
  check_required "DOMAIN"
  check_required "ACME_EMAIL"
fi

echo ""

# ══════════════════════════════════════════════════════════
# 2. Variables RECOMMANDÉES
# ══════════════════════════════════════════════════════════
echo -e "${CYAN}▸ Variables recommandées${NC}"
echo ""

check_required "OFFLINE_LIMITS_HMAC_KEY" || true
check_required "GL_POSTING_MODE" || true
check_required "PAWAPAY_ENVIRONMENT" || true
check_required "LOG_LEVEL" || true
check_required "APP_VERSION" || true

# SMTP
SMTP_HOST_VAL="${SMTP_HOST:-}"
if [[ -z "$SMTP_HOST_VAL" ]]; then
  echo -e "  ${YELLOW}⚠ SMTP_HOST${NC} — non configuré (les emails ne seront pas envoyés)"
  ((WARNINGS++))
else
  echo -e "  ${GREEN}✓ SMTP_HOST${NC} = $SMTP_HOST_VAL"
fi

# Production: vérifier les tokens critiques
if [[ "$ENV_MODE" == "production" ]]; then
  PAWAPAY_TOKEN="${PAWAPAY_API_TOKEN:-}"
  if [[ -z "$PAWAPAY_TOKEN" ]]; then
    echo -e "  ${RED}✗ PAWAPAY_API_TOKEN${NC} — obligatoire en production"
    ((ERRORS++))
  else
    echo -e "  ${GREEN}✓ PAWAPAY_API_TOKEN${NC}"
  fi

  SMTP_PASS="${SMTP_PASSWORD:-}"
  if [[ -z "$SMTP_PASS" ]]; then
    echo -e "  ${YELLOW}⚠ SMTP_PASSWORD${NC} — vide (les emails ne seront pas envoyés)"
    ((WARNINGS++))
  else
    echo -e "  ${GREEN}✓ SMTP_PASSWORD${NC}"
  fi
fi

echo ""

# ══════════════════════════════════════════════════════════
# 3. Sécurité des secrets
# ══════════════════════════════════════════════════════════
echo -e "${CYAN}▸ Sécurité des secrets${NC}"
echo ""

check_secret_strength "SESSION_SECRET" 32
check_secret_strength "OTP_HMAC_SECRET" 32
check_secret_strength "OFFLINE_LIMITS_HMAC_KEY" 32
check_secret_strength "POSTGRES_PASSWORD" 8
check_secret_strength "REDIS_PASSWORD" 8
check_secret_strength "MINIO_ROOT_PASSWORD" 8
check_secret_strength "GRAFANA_ADMIN_PASSWORD" 8

# Vérifier qu'on n'utilise pas les valeurs dev par défaut
check_no_dev_value "POSTGRES_PASSWORD" "microflex_dev" "password" "postgres"
check_no_dev_value "REDIS_PASSWORD" "redis_dev" "password" "redis"
check_no_dev_value "SESSION_SECRET" "dev-session-secret-not-for-production-use-32chars"
check_no_dev_value "OTP_HMAC_SECRET" "dev-otp-hmac-secret-not-for-production-use-64chars-long-enough"
check_no_dev_value "OFFLINE_LIMITS_HMAC_KEY" "dev-offline-limits-hmac-key-not-for-production" "microflex-offline-limits-v1"
check_no_dev_value "MINIO_ROOT_PASSWORD" "minioadmin" "minioadmin123"
check_no_dev_value "GRAFANA_ADMIN_PASSWORD" "admin"

echo ""

# ══════════════════════════════════════════════════════════
# 4. Cohérence des valeurs
# ══════════════════════════════════════════════════════════
echo -e "${CYAN}▸ Cohérence${NC}"
echo ""

GL_MODE="${GL_POSTING_MODE:-}"
if [[ "$GL_MODE" == "STRICT" ]]; then
  echo -e "  ${GREEN}✓ GL_POSTING_MODE${NC} = STRICT"
elif [[ "$GL_MODE" == "LENIENT" ]]; then
  echo -e "  ${YELLOW}⚠ GL_POSTING_MODE${NC} = LENIENT (non recommandé hors dev)"
  ((WARNINGS++))
fi

PAWAPAY_ENV="${PAWAPAY_ENVIRONMENT:-}"
if [[ "$ENV_MODE" == "production" ]]; then
  if [[ "$PAWAPAY_ENV" == "sandbox" ]]; then
    echo -e "  ${RED}✗ PAWAPAY_ENVIRONMENT${NC} = sandbox (doit être 'production' en prod)"
    ((ERRORS++))
  elif [[ "$PAWAPAY_ENV" == "production" ]]; then
    echo -e "  ${GREEN}✓ PAWAPAY_ENVIRONMENT${NC} = production"
  fi

  # Vérifier HTTPS sur le callback URL
  CALLBACK_URL="${PAWAPAY_CALLBACK_URL:-}"
  if [[ -n "$CALLBACK_URL" && "$CALLBACK_URL" != https://* ]]; then
    echo -e "  ${RED}✗ PAWAPAY_CALLBACK_URL${NC} — doit utiliser HTTPS en production"
    ((ERRORS++))
  elif [[ -n "$CALLBACK_URL" ]]; then
    echo -e "  ${GREEN}✓ PAWAPAY_CALLBACK_URL${NC} = $CALLBACK_URL"
  fi

  # Vérifier que DOMAIN est dans le callback
  DOMAIN_VAL="${DOMAIN:-}"
  if [[ -n "$CALLBACK_URL" && -n "$DOMAIN_VAL" && "$CALLBACK_URL" != *"$DOMAIN_VAL"* ]]; then
    echo -e "  ${YELLOW}⚠ PAWAPAY_CALLBACK_URL${NC} — ne contient pas le DOMAIN ($DOMAIN_VAL)"
    ((WARNINGS++))
  fi
else
  if [[ "$PAWAPAY_ENV" == "production" ]]; then
    echo -e "  ${YELLOW}⚠ PAWAPAY_ENVIRONMENT${NC} = production (vérifiez que c'est intentionnel en staging)"
    ((WARNINGS++))
  elif [[ "$PAWAPAY_ENV" == "sandbox" ]]; then
    echo -e "  ${GREEN}✓ PAWAPAY_ENVIRONMENT${NC} = sandbox"
  fi
fi

echo ""

# ══════════════════════════════════════════════════════════
# RÉSUMÉ
# ══════════════════════════════════════════════════════════
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}  ✗ $ERRORS erreur(s)${NC}, ${YELLOW}$WARNINGS avertissement(s)${NC}"
  echo -e "${RED}  → Corrigez les erreurs avant de lancer la ${ENV_MODE}.${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${GREEN}  ✓ Toutes les variables obligatoires sont présentes.${NC}"
  echo -e "${YELLOW}  ⚠ $WARNINGS avertissement(s) — vérifiez ci-dessus.${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
else
  echo -e "${GREEN}  ✓ Tout est OK — prêt pour la ${ENV_MODE} !${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
fi
