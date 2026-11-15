#!/usr/bin/env bash
# Run from your laptop, in the repo root, to build and ship the game.
#   HOST=<server ip>  KEY=<path to the server's .pem key>  ./deploy/deploy.sh
# Safe to run again for every update.
set -euo pipefail
: "${HOST:?set HOST to the server's IP address}"
: "${KEY:?set KEY to the path of the server's SSH key (.pem)}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"
REMOTE="ubuntu@$HOST"

# Frontend: built to talk to the game server over secure WebSockets.
(cd client && npm install --no-audit --no-fund && VITE_BACKEND_URL=wss://server.play-intrusion.us npm run build)
rsync -az --delete -e "$SSH" client/dist/ "$REMOTE:/var/www/intrusion/"

# Game server: compiled JavaScript plus its package list; dependencies install on the server.
(cd server && npm install --no-audit --no-fund && npm test && npm run build)
rsync -az --delete -e "$SSH" server/dist server/package.json server/package-lock.json "$REMOTE:/opt/intrusion/"
# The AI key travels in .env, straight to the server, never through git. A fixed MINI_GAMES order is
# for testing on a laptop, so it stays behind: the live game always shuffles.
grep -v '^MINI_GAMES=' server/.env | $SSH "$REMOTE" 'cat > /opt/intrusion/.env'

rsync -az -e "$SSH" deploy/nginx.conf "$REMOTE:/tmp/intrusion.nginx"
$SSH "$REMOTE" '
  set -e
  chmod 600 /opt/intrusion/.env
  cd /opt/intrusion && npm ci --omit=dev
  # Restart the game server if it is already running, otherwise start it. It reads .env from this folder.
  pm2 restart intrusion --update-env || pm2 start dist/index.js --name intrusion --time
  pm2 save
  # Install the site once; after that certbot owns the file (it adds the HTTPS lines).
  if [ ! -f /etc/nginx/sites-available/intrusion ]; then
    sudo mv /tmp/intrusion.nginx /etc/nginx/sites-available/intrusion
    sudo ln -sf /etc/nginx/sites-available/intrusion /etc/nginx/sites-enabled/intrusion
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
  # The installed site once told browsers to keep art for a week without asking. Ask every visit instead.
  sudo sed -i -e "s/expires 7d;/add_header Cache-Control \"no-cache\";/" -e "/add_header Cache-Control \"public\";/d" /etc/nginx/sites-available/intrusion
  sudo nginx -t && sudo systemctl reload nginx
'
echo "Deployed. Frontend: http://play-intrusion.us   Game server: server.play-intrusion.us"
