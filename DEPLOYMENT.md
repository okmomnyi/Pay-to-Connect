# Production Deployment Guide

## 🚀 Quick Start Deployment

### Prerequisites Checklist

- [ ] Ubuntu 22.04 LTS server with root access
- [ ] Domain name with DNS configured
- [ ] SSL certificate (Let's Encrypt or commercial)
- [ ] M-Pesa Daraja API credentials
- [ ] Minimum 4GB RAM, 2 CPU cores, 50GB storage

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reboot to apply Docker group changes
sudo reboot
```

### 2. Application Deployment

```bash
# Clone repository
git clone https://github.com/your-org/pay-to-connect.git
cd pay-to-connect

# Configure environment
cp .env.example .env
nano .env

# Generate secure secrets
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 16  # For DB_PASSWORD
openssl rand -hex 16  # For REDIS_PASSWORD

# Setup SSL certificates
mkdir -p nginx/ssl
# Copy your SSL certificates to nginx/ssl/

# Deploy
docker-compose up -d

# Check deployment
docker-compose ps
docker-compose logs -f app
```

### 3. Initial Configuration

```bash
# Access admin panel
curl -k https://yourdomain.com/admin

# Default admin credentials (CHANGE IMMEDIATELY):
# Username: admin
# Password: admin123

# Test captive portal
curl -k https://yourdomain.com/portal
```

## 🔧 Production Configuration

### Environment Variables

```env
# Production Database
DATABASE_URL=postgresql://postgres:SECURE_PASSWORD@postgres:5432/pay_to_connect
DB_PASSWORD=SECURE_DB_PASSWORD

# Redis Security
REDIS_PASSWORD=SECURE_REDIS_PASSWORD

# Application Security
JWT_SECRET=64_CHARACTER_RANDOM_STRING
BCRYPT_ROUNDS=12
NODE_ENV=production

# M-Pesa Production
MPESA_ENVIRONMENT=production
MPESA_CONSUMER_KEY=your_production_consumer_key
MPESA_CONSUMER_SECRET=your_production_consumer_secret
MPESA_SHORTCODE=your_production_shortcode
MPESA_PASSKEY=your_production_passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/portal/mpesa/callback

# Security
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### SSL Certificate Setup

#### Option 1: Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Stop nginx temporarily
docker-compose stop nginx

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/key.pem
sudo chown $USER:$USER nginx/ssl/*.pem

# Restart nginx
docker-compose up -d nginx

# Setup auto-renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet && docker-compose restart nginx" | sudo crontab -
```

#### Option 2: Commercial Certificate

```bash
# Copy your certificates
cp /path/to/your/certificate.crt nginx/ssl/cert.pem
cp /path/to/your/private.key nginx/ssl/key.pem
chmod 600 nginx/ssl/key.pem
chmod 644 nginx/ssl/cert.pem
```

## 🛡️ Security Hardening

### 1. System Security

```bash
# Configure firewall
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw allow 1812/udp comment 'RADIUS Auth'
sudo ufw allow 1813/udp comment 'RADIUS Accounting'

# Secure SSH
sudo sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Install fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Configure fail2ban for nginx
sudo tee /etc/fail2ban/jail.local << EOF
[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 600
EOF

sudo systemctl restart fail2ban
```

### 2. Database Security

```bash
# Secure PostgreSQL configuration
docker-compose exec postgres psql -U postgres -c "
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_statement = 'all';
SELECT pg_reload_conf();
"

# Create read-only user for monitoring
docker-compose exec postgres psql -U postgres -d pay_to_connect -c "
CREATE USER monitor WITH PASSWORD 'monitor_password';
GRANT CONNECT ON DATABASE pay_to_connect TO monitor;
GRANT USAGE ON SCHEMA public TO monitor;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitor;
"
```

### 3. Application Security

```bash
# Change default admin password immediately
curl -X POST https://yourdomain.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Use the returned token to change password
curl -X PUT https://yourdomain.com/api/admin/change-password \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"admin123","newPassword":"SECURE_NEW_PASSWORD"}'
```

## 📊 Monitoring Setup

### 1. System Monitoring

```bash
# Install monitoring tools
sudo apt install htop iotop nethogs -y

# Setup log rotation
sudo tee /etc/logrotate.d/pay-to-connect << EOF
/var/log/pay-to-connect/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        docker-compose restart nginx
    endscript
}
EOF
```

### 2. Application Monitoring

```bash
# Health check script
sudo tee /usr/local/bin/health-check.sh << 'EOF'
#!/bin/bash
HEALTH_URL="https://localhost/health"
LOG_FILE="/var/log/health-check.log"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)
timestamp=$(date '+%Y-%m-%d %H:%M:%S')

if [ $response -eq 200 ]; then
    echo "$timestamp - Health check passed" >> $LOG_FILE
else
    echo "$timestamp - Health check failed with code: $response" >> $LOG_FILE
    # Send alert (configure your notification method)
    # mail -s "Pay-to-Connect Health Check Failed" admin@yourdomain.com < /dev/null
fi
EOF

sudo chmod +x /usr/local/bin/health-check.sh

# Schedule health checks
echo "*/5 * * * * /usr/local/bin/health-check.sh" | sudo crontab -
```

### 3. Database Monitoring

```bash
# Database backup script
sudo tee /usr/local/bin/db-backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/database"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p $BACKUP_DIR

# Create backup
docker-compose exec -T postgres pg_dump -U postgres pay_to_connect | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Remove old backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') - Database backup completed: backup_$DATE.sql.gz"
EOF

sudo chmod +x /usr/local/bin/db-backup.sh

# Schedule daily backups at 2 AM
echo "0 2 * * * /usr/local/bin/db-backup.sh" | sudo crontab -
```

## 🔄 Maintenance Procedures

### Daily Tasks

```bash
# Check system status
docker-compose ps
docker-compose logs --tail=50 app

# Check disk space
df -h

# Review error logs
tail -n 100 /var/log/nginx/error.log
```

### Weekly Tasks

```bash
# Update system packages
sudo apt update && sudo apt list --upgradable

# Review payment reconciliation
docker-compose exec postgres psql -U postgres -d pay_to_connect -c "
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_payments,
    SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as successful_amount,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
FROM payments 
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
"

# Check active sessions
docker-compose exec postgres psql -U postgres -d pay_to_connect -c "
SELECT COUNT(*) as active_sessions FROM sessions WHERE active = true AND end_time > NOW();
"
```

### Monthly Tasks

```bash
# Security updates
sudo apt upgrade -y

# Certificate renewal check
sudo certbot certificates

# Performance review
docker stats --no-stream
```

## 🚨 Troubleshooting

### Common Issues and Solutions

#### 1. Application Won't Start

```bash
# Check logs
docker-compose logs app

# Common fixes:
# - Verify environment variables
# - Check database connectivity
# - Ensure ports aren't in use
sudo netstat -tulpn | grep :3000
```

#### 2. Database Connection Issues

```bash
# Test database connection
docker-compose exec postgres psql -U postgres -d pay_to_connect -c "SELECT 1;"

# Reset database if needed
docker-compose down
docker volume rm pay-to-connect_postgres_data
docker-compose up -d postgres
# Wait 30 seconds, then run migrations
npm run migrate
```

#### 3. M-Pesa Callback Issues

```bash
# Check if callbacks are reaching the server
tail -f /var/log/nginx/access.log | grep mpesa

# Test callback endpoint
curl -X POST https://yourdomain.com/api/portal/mpesa/callback \
  -H "Content-Type: application/json" \
  -d '{"test": "callback"}'

# Verify M-Pesa IP whitelist includes your server IP
```

#### 4. RADIUS Authentication Problems

```bash
# Test RADIUS connectivity from MikroTik
/radius monitor 0 user=test password=test

# Check RADIUS logs
docker-compose logs app | grep -i radius

# Verify shared secret matches between router and server
```

### Emergency Procedures

#### Service Recovery

```bash
# Quick restart
docker-compose restart

# Full rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Database recovery from backup
docker-compose exec postgres psql -U postgres -d pay_to_connect < /backups/database/latest_backup.sql
```

#### Rollback Procedure

```bash
# Stop current version
docker-compose down

# Restore previous version
git checkout previous-stable-tag
docker-compose up -d

# Restore database if needed
docker-compose exec postgres psql -U postgres -d pay_to_connect < /backups/database/pre_update_backup.sql
```

## 📞 Support Contacts

- **System Administrator**: admin@yourdomain.com
- **Technical Support**: support@yourdomain.com
- **Emergency Contact**: +254XXXXXXXXX

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] Server meets minimum requirements
- [ ] Domain DNS configured correctly
- [ ] SSL certificate obtained
- [ ] M-Pesa API credentials verified
- [ ] Environment variables configured
- [ ] Firewall rules configured
- [ ] Backup procedures tested

### Post-Deployment

- [ ] Health check endpoint responding
- [ ] Admin panel accessible
- [ ] Captive portal loading correctly
- [ ] M-Pesa test payment successful
- [ ] RADIUS authentication working
- [ ] SSL certificate valid
- [ ] Monitoring alerts configured
- [ ] Backup script tested
- [ ] Default passwords changed
- [ ] Documentation updated

### Go-Live Checklist

- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Staff training completed
- [ ] Support procedures documented
- [ ] Monitoring dashboards configured
- [ ] Incident response plan ready
- [ ] Rollback procedure tested

---

**⚠️ Critical**: Always test deployments in a staging environment before production. This system handles real financial transactions.
