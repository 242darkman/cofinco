#!/usr/bin/env bash
# ==========================================================
# Génère des certificats TLS auto-signés pour le dev local
# ==========================================================
# Usage : bash scripts/generate-local-certs.sh
#
# Génère localhost.crt + localhost.key dans infra/certs/
# Valides 365 jours, avec SAN pour localhost + 127.0.0.1
#
# Alternative : utiliser mkcert pour des certificats trusted :
#   mkcert -install
#   mkcert -cert-file infra/certs/localhost.crt \
#          -key-file infra/certs/localhost.key \
#          localhost 127.0.0.1
# ==========================================================

set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/infra/certs"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/localhost.crt" ] && [ -f "$CERT_DIR/localhost.key" ]; then
  echo "Certificats existants trouvés dans $CERT_DIR"
  echo "Supprimez-les manuellement pour régénérer."
  exit 0
fi

echo "Génération des certificats TLS auto-signés..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/localhost.key" \
  -out "$CERT_DIR/localhost.crt" \
  -subj "/C=CG/ST=Brazzaville/L=Brazzaville/O=Cofinco/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  2>/dev/null

chmod 600 "$CERT_DIR/localhost.key"
chmod 644 "$CERT_DIR/localhost.crt"

echo "Certificats générés :"
echo "  $CERT_DIR/localhost.crt"
echo "  $CERT_DIR/localhost.key"
echo ""
echo "Note : Le navigateur affichera un avertissement de sécurité."
echo "Pour des certificats trusted, utilisez mkcert :"
echo "  brew install mkcert  (macOS)"
echo "  mkcert -install"
echo "  mkcert -cert-file infra/certs/localhost.crt \\"
echo "         -key-file infra/certs/localhost.key \\"
echo "         localhost 127.0.0.1"
