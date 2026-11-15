# Hosting Intrusion on AWS

One small Amazon Lightsail server runs everything:

| Address | What it serves |
| --- | --- |
| `https://play-intrusion.us` | the built frontend (static files, via nginx) |
| `wss://server.play-intrusion.us` | the Colyseus game server (Node, kept alive by pm2, behind nginx) |

Colyseus is the multiplayer library inside our server code; AWS is only where that code runs.

**Current server:** Lightsail instance `intrusion` in us-east-1, plan `micro_3_0` ($7/month), fixed IP `184.72.107.126`, SSH key `~/.ssh/intrusion.pem` (created 2026-11-14). Every one-time step below is already done for it, including DNS at Porkbun and HTTPS. The certificate was requested without an email address, so Let's Encrypt sends no expiry notices; it renews itself through certbot's timer.

## One-time setup

1. **Sign in to AWS** on your laptop: `aws login`.
2. **Create the server** (about $7 a month, us-east-1, 1 GB memory) with a fixed IP and web ports open:

   ```bash
   aws lightsail create-instances --region us-east-1 --instance-names intrusion \
     --availability-zone us-east-1a --blueprint-id ubuntu_24_04 --bundle-id micro_3_0
   aws lightsail allocate-static-ip --region us-east-1 --static-ip-name intrusion-ip
   aws lightsail attach-static-ip --region us-east-1 --static-ip-name intrusion-ip --instance-name intrusion
   aws lightsail open-instance-public-ports --region us-east-1 --instance-name intrusion \
     --port-info fromPort=80,toPort=80,protocol=TCP
   aws lightsail open-instance-public-ports --region us-east-1 --instance-name intrusion \
     --port-info fromPort=443,toPort=443,protocol=TCP
   aws lightsail get-static-ip --region us-east-1 --static-ip-name intrusion-ip --query staticIp.ipAddress --output text
   ```

   The last command prints the server's IP address. Check the plan name first with
   `aws lightsail get-bundles --region us-east-1` if AWS has renamed it.
3. **Download the SSH key**: `aws lightsail download-default-key-pair --region us-east-1 --query privateKeyBase64 --output text > ~/.ssh/intrusion.pem && chmod 600 ~/.ssh/intrusion.pem`
4. **Point the domain at the server** in Porkbun (DNS records for `play-intrusion.us`), all three to the IP from step 2:

   | Type | Host | Answer |
   | --- | --- | --- |
   | A | *(blank)* | the IP |
   | A | `www` | the IP |
   | A | `server` | the IP |

   Delete any parked-page records Porkbun added for the same hosts.
5. **Prepare the server**: `ssh -i ~/.ssh/intrusion.pem ubuntu@<IP> 'bash -s' < deploy/setup.sh`
6. **Ship the game**: `HOST=<IP> KEY=~/.ssh/intrusion.pem ./deploy/deploy.sh`
7. **Turn on HTTPS** once the DNS records have spread (check with `dig +short server.play-intrusion.us`):

   ```bash
   ssh -i ~/.ssh/intrusion.pem ubuntu@<IP> \
     'sudo certbot --nginx -d play-intrusion.us -d www.play-intrusion.us -d server.play-intrusion.us --redirect -m <your email> --agree-tos -n'
   ```

   Certificates renew by themselves.

## Every update after that

```bash
HOST=<IP> KEY=~/.ssh/intrusion.pem ./deploy/deploy.sh
```

## Looking after it

- Server logs: `ssh ... 'pm2 logs intrusion'`
- Restart: `ssh ... 'pm2 restart intrusion'`
- The AI key lives in `server/.env` on your laptop (git-ignored) and is copied to `/opt/intrusion/.env` by the deploy script.
