#!/bin/bash

# Configuration
NODE_VERSION="20.x"
APP_DIR="/var/www/cofinco"
DB_NAME="cofinco"
DB_USER="admin"
# NOTE: Le mot de passe sera demandé ou doit être changé après l'installation
DB_PASS="Admin123!@#" 

# Couleurs pour les logs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Initialisation du Serveur VPS pour Cofinco ===${NC}"

# 1. Mise à jour du système
echo -e "${GREEN}1. Mise à jour du système...${NC}"
apt update && apt upgrade -y
apt install -y curl git build-essential nginx certbot python3-certbot-nginx

# 2. Installation de Node.js
echo -e "${GREEN}2. Installation de Node.js ($NODE_VERSION)...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v

# 3. Installation de PM2
echo -e "${GREEN}3. Installation de PM2...${NC}"
npm install -g pm2

# 4. Installation de PostgreSQL
echo -e "${GREEN}4. Installation de PostgreSQL...${NC}"
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# 5. Configuration de la Base de Données
echo -e "${GREEN}5. Configuration de la Base de Données...${NC}"
# Création de l'utilisateur et de la BDD si n'existent pas
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" || echo "BDD existe déjà ou erreur"
sudo -u postgres psql -c "CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';" || echo "User existe déjà ou erreur"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# 6. Configuration du pare-feu (UFW)
echo -e "${GREEN}6. Configuration du pare-feu...${NC}"
ufw allow OpenSSH
ufw allow 'Nginx Full'
# ufw enable # À faire manuellement pour éviter de se bloquer si SSH pas config

# 7. Préparation du dossier de l'application
echo -e "${GREEN}7. Préparation du dossier $APP_DIR...${NC}"
mkdir -p $APP_DIR
chown -R $USER:$USER $APP_DIR
# Donner les droits à l'utilisateur courant (si script lancé en root, attention)
# Idéalement on crée un utilisateur dédié 'app', mais pour simplifier on laisse root ou l'user courant gérer pour l'instant
# Si lancé en root :
if [ "$EUID" -eq 0 ]; then
  echo "Attention: Script lancé en root."
fi

echo -e "${BLUE}=== Installation des dépendances terminée ===${NC}"
echo -e "Prochaines étapes :"
echo -e "1. Copiez vos fichiers sources dans $APP_DIR (via git clone ou rsync)"
echo -e "2. Créez le fichier .env.production"
echo -e "3. Lancez 'npm ci' et 'npm run build'"
echo -e "4. Démarrez avec 'pm2 start npm --name \"cofinco\" -- start'"
echo -e "5. Configurez Nginx via le fichier /etc/nginx/sites-available/cofinco"
