#!/bin/bash

set -e

echo "🔄 Mise à jour du système..."
apt update -y
apt upgrade -y

echo "📦 Installation des paquets essentiels..."
apt install -y curl git ufw fail2ban htop ncdu unzip jq

echo "👤 Création de l'utilisateur deploy..."
if id "deploy" &>/dev/null; then
  echo "Utilisateur deploy existe déjà"
else
  adduser --disabled-password --gecos "" deploy
  usermod -aG sudo deploy
fi

echo "🔑 Copie des clés SSH vers deploy..."
mkdir -p /home/deploy/.ssh
cp /home/ubuntu/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

echo "🔒 Sécurisation SSH..."

sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config

systemctl restart ssh

echo "🔥 Configuration du firewall (UFW)..."

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "🛡 Configuration Fail2ban..."

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
EOF

systemctl enable fail2ban
systemctl restart fail2ban

echo "✅ Configuration terminée avec succès."
echo "⚠️ Teste maintenant la connexion :"
echo "ssh deploy@91.134.136.73"
