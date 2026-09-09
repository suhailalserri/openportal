#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# AI Platform — Fresh Ubuntu 22.04 VPS Bootstrap Script
# Run as root: curl -sSL https://yourdomain.com/deploy.sh | bash
# Or:          bash deploy.sh
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

DEPLOY_USER="deploy"
REPO_DIR="/opt/ai-platform"
LOG_FILE="/var/log/ai-platform-setup.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "═══════════════════════════════════════════"
log " AI Platform Server Bootstrap"
log " $(date)"
log "═══════════════════════════════════════════"

# ── 1. SYSTEM UPDATES ──────────────────────────────────────────────────
log "→ Updating system packages..."
apt-get update -y >> "$LOG_FILE" 2>&1
apt-get upgrade -y >> "$LOG_FILE" 2>&1
apt-get install -y \
  curl wget git unzip htop ncdu \
  ufw fail2ban \
  ca-certificates gnupg lsb-release \
  cron logrotate \
  >> "$LOG_FILE" 2>&1

# Unattended security upgrades
apt-get install -y unattended-upgrades >> "$LOG_FILE" 2>&1
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'APTEOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APTEOF
log "✓ System updated"

# ── 2. NON-ROOT DEPLOY USER ────────────────────────────────────────────
log "→ Creating deploy user..."
if ! id -u "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
mkdir -p "/home/$DEPLOY_USER/.ssh"
if [ -f ~/.ssh/authorized_keys ]; then
  cp ~/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null || true

# Harden SSH
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/'          /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/'    /etc/ssh/sshd_config
systemctl restart sshd
log "✓ Deploy user created, SSH hardened"

# ── 3. FIREWALL ─────────────────────────────────────────────────────────
log "→ Configuring UFW firewall..."
ufw --force reset >> "$LOG_FILE" 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw allow 443/udp  comment 'HTTP/3 QUIC'
echo "y" | ufw enable >> "$LOG_FILE" 2>&1
log "✓ Firewall configured (22, 80, 443 open)"

# ── 4. FAIL2BAN ─────────────────────────────────────────────────────────
log "→ Configuring Fail2ban..."
cat > /etc/fail2ban/jail.local << 'F2B'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
port     = ssh
backend  = systemd
F2B
systemctl enable fail2ban >> "$LOG_FILE" 2>&1
systemctl restart fail2ban >> "$LOG_FILE" 2>&1
log "✓ Fail2ban configured"

# ── 5. DOCKER ───────────────────────────────────────────────────────────
log "→ Installing Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y >> "$LOG_FILE" 2>&1
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >> "$LOG_FILE" 2>&1
usermod -aG docker "$DEPLOY_USER"

# Docker security config
cat > /etc/docker/daemon.json << 'DOCKEREOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "no-new-privileges": true,
  "live-restore": true
}
DOCKEREOF
systemctl restart docker >> "$LOG_FILE" 2>&1
systemctl enable  docker >> "$LOG_FILE" 2>&1
log "✓ Docker installed"

# ── 6. NODE.JS 20 LTS ──────────────────────────────────────────────────
log "→ Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >> "$LOG_FILE" 2>&1
apt-get install -y nodejs >> "$LOG_FILE" 2>&1
npm install -g pnpm tsx >> "$LOG_FILE" 2>&1
log "✓ Node.js $(node -v) installed"

# ── 7. DISK MONITORING CRON ─────────────────────────────────────────────
log "→ Setting up disk monitoring..."
cat > /usr/local/bin/disk-check.sh << 'DISKEOF'
#!/bin/bash
THRESHOLD=80
USAGE=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "$USAGE" -gt "$THRESHOLD" ]; then
  echo "$(date): DISK ALERT - ${USAGE}% used" >> /var/log/disk-alerts.log
  # Telegram alert (if configured)
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=🚨 DISK ALERT: Server disk is ${USAGE}% full" \
      > /dev/null 2>&1
  fi
fi
DISKEOF
chmod +x /usr/local/bin/disk-check.sh
echo "0 * * * * root /usr/local/bin/disk-check.sh" > /etc/cron.d/disk-monitor
log "✓ Disk monitoring cron created"

# ── 8. PROJECT DIRECTORIES ─────────────────────────────────────────────
log "→ Creating project directories..."
mkdir -p "$REPO_DIR" "$REPO_DIR/infra/backups" "$REPO_DIR/infra/logs"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$REPO_DIR"
log "✓ Created $REPO_DIR"

# ── 9. LOGROTATE ───────────────────────────────────────────────────────
log "→ Configuring log rotation..."
cat > /etc/logrotate.d/ai-platform << 'LOGEOF'
/opt/ai-platform/infra/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 deploy deploy
}
LOGEOF

# ── DONE ─────────────────────────────────────────────────────────────────
log ""
log "╔═══════════════════════════════════════════╗"
log "║     ✅ Server setup complete!              ║"
log "╚═══════════════════════════════════════════╝"
log ""
log "NEXT STEPS:"
log "  1. Switch to deploy user:   su - $DEPLOY_USER"
log "  2. Clone your repo:         git clone <your-repo-url> $REPO_DIR"
log "  3. Copy env file:           cp $REPO_DIR/infra/.env.example $REPO_DIR/infra/.env"
log "  4. Fill in all env vars:    nano $REPO_DIR/infra/.env"
log "  5. Start all services:      cd $REPO_DIR/infra && docker compose up -d"
log "  6. Run DB migrations:       docker compose exec api pnpm db:migrate"
log "  7. Run DB seed (dev only):  docker compose exec api pnpm db:seed"
log ""
log "Setup log saved to: $LOG_FILE"
