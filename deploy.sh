#!/bin/bash
set -e

cd /var/www/visualmenu

echo "==> Pulling latest code..."
git pull origin main

echo "==> Installing dependencies..."
npm ci

echo "==> Applying database migrations..."
npx prisma migrate deploy

echo "==> Generating Prisma Client..."
npx prisma generate

echo "==> Building frontend..."
npm run build

echo "==> Restarting API..."
pm2 restart visualmenu-api --update-env

echo "==> Saving PM2 state..."
pm2 save

echo "==> Checking API health..."
sleep 2
curl -fsS http://127.0.0.1:4001/api/health

echo ""
echo "✅ Deployment completed successfully."
