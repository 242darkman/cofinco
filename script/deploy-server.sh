#!/bin/bash
set -e # Stop on error

# Directory where the app is located on the VPS
APP_DIR="/var/www/cofinco"

echo "🚀 Starting deployment..."

# Navigate to app directory
if [ -d "$APP_DIR" ]; then
  cd $APP_DIR
else
  echo "❌ Error: Application directory $APP_DIR not found!"
  exit 1
fi

echo "📥 Pulling latest changes from master..."
git fetch --all
git reset --hard origin/master

echo "📦 Installing dependencies..."
npm ci

echo "🏗️ Building application..."
npm run build

echo "🗄️ Running database migrations..."
npm run db:push

echo "🔄 Restarting application with PM2..."
# Reload if exists, otherwise start
if pm2 list | grep -q "cofinco"; then
    pm2 reload cofinco
else
    pm2 start npm --name "cofinco" -- start
fi

echo "✅ App Deployment successful!"
