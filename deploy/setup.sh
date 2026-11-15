#!/usr/bin/env bash
# Run ONCE on a fresh Ubuntu server (as the default "ubuntu" user) to install
# what Intrusion needs: Node.js, nginx, certbot and the pm2 process manager.
set -euo pipefail

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx rsync
sudo npm install -g pm2

sudo mkdir -p /var/www/intrusion /opt/intrusion
sudo chown -R "$USER":"$USER" /var/www/intrusion /opt/intrusion

# Start pm2 (and whatever it runs) again after a reboot.
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME"
echo "Server is ready. Now run deploy/deploy.sh from your laptop."
