# SmartWiFi - Wi-Fi Captive Portal System

A production-ready Wi-Fi captive portal and billing system with M-Pesa integration for seamless internet access management.

## 🚀 Features

- **Mobile-first captive portal** with responsive design
- **M-Pesa STK Push integration** for seamless payments
- **RADIUS authentication** with MikroTik router support
- **Time-based billing** with configurable packages
- **Real-time session management** with Redis caching
- **Admin dashboard** for monitoring and management
- **Multi-router support** for large deployments
- **Production-ready security** with rate limiting and validation
- **Docker containerization** for easy deployment
- **Nginx reverse proxy** with SSL termination

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MikroTik      │    │     Nginx        │    │   Node.js App   │
│   Router        │◄───┤  Reverse Proxy   │◄───┤   (Express)     │
│   (Hotspot)     │    │   (SSL/HTTPS)    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │ RADIUS                 │ HTTP/HTTPS             │
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Device   │    │  Captive Portal  │    │   PostgreSQL    │
│   (Phone/PC)    │    │   Frontend       │    │   Database      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   M-Pesa API     │    │     Redis       │
                       │   (Daraja)       │    │    Cache        │
                       └──────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- Ubuntu 22.04 LTS server
- Docker and Docker Compose
- PostgreSQL 15+
- Redis 7+
- Node.js 18+
- MikroTik RouterOS 7+
- Valid SSL certificate
- M-Pesa Daraja API credentials

## 🛠️ Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/smartwifi.git
cd smartwifi
```

### 2. Environment Configuration

```bash
cp .env.example .env
nano .env
```

Configure all environment variables:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/smartwifi
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smartwifi
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Server Configuration
PORT=3000
NODE_ENV=production
JWT_SECRET=your-super-secure-jwt-secret-key-here
BCRYPT_ROUNDS=12

# M-Pesa Daraja API Configuration
MPESA_CONSUMER_KEY=your-mpesa-consumer-key
MPESA_CONSUMER_SECRET=your-mpesa-consumer-secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your-mpesa-passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/portal/mpesa/callback
MPESA_ENVIRONMENT=production

# RADIUS Configuration
RADIUS_SECRET=your-radius-shared-secret

# Security Configuration
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. SSL Certificate Setup

```bash
# Create SSL directory
mkdir -p nginx/ssl

# Copy your SSL certificates
cp /path/to/your/cert.pem nginx/ssl/cert.pem
cp /path/to/your/key.pem nginx/ssl/key.pem

# Set proper permissions
chmod 600 nginx/ssl/key.pem
chmod 644 nginx/ssl/cert.pem
```

### Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env` (if exists) or create new `.env`
   - Set DATABASE_URL or DB_* variables
   - Generate strong JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - Configure M-Pesa credentials

3. **Run database migrations:**
```bash
npm run migrate
```

4. **Create admin user (SECURE):**
```bash
node scripts/setup-admin.js
```
   - Follow prompts to create admin credentials
   - Never use hardcoded passwords

5. **Build and start:**
```bash
npm run build
npm start
```

6. **Access the system:**
   - User Portal: http://localhost:3000/portal
   - Admin Panel: http://localhost:3000/api/admin
   - Health Check: http://localhost:3000/health

### Security First

- ✅ All credentials are entered interactively
- ✅ No hardcoded passwords in code
- ✅ Passwords are hashed with bcrypt (12 rounds)
- ✅ JWT tokens with secure secrets
- ✅ Rate limiting on all auth endpoints
- ✅ Input sanitization and validation
- ✅ M-Pesa callback authentication

All security measures are implemented following industry best practices.

### 4. Database Setup

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for database to be ready
sleep 30

# Run migrations
npm run migrate
```

### 5. Deploy with Docker Compose

```bash
# Build and start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f app
```

### 6. Alternative: PM2 Deployment

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

## 🔧 MikroTik Router Configuration

### 1. Basic Setup

```bash
# Upload configuration script to router
scp mikrotik/hotspot-setup.rsc admin@router-ip:/

# Connect to router and run script
ssh admin@router-ip
/import file=hotspot-setup.rsc
```

### 2. Configure Variables

Edit the script and replace:
- `YOUR_RADIUS_SERVER_IP` with your server IP
- `YOUR_RADIUS_SECRET` with your RADIUS secret
- Interface names (ether1, ether2) as needed
- IP ranges if conflicts exist

### 3. Multi-Router Deployment

For multiple routers:
1. Use `mikrotik/multi-router-setup.rsc`
2. Customize each router's identity and IP range
3. Ensure unique NAS identifiers

## 🔐 Security Hardening

### 1. Server Security

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Configure firewall
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 1812/udp  # RADIUS Auth
sudo ufw allow 1813/udp  # RADIUS Accounting

# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Install fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
```

### 2. Database Security

```bash
# Secure PostgreSQL
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'strong_password';"

# Configure pg_hba.conf for authentication
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

### 3. Application Security

- Change default admin password immediately
- Use strong JWT secrets (32+ characters)
- Enable HTTPS only in production
- Configure proper CORS origins
- Implement rate limiting
- Regular security updates

### 4. MikroTik Security

```bash
# Change default passwords
/user set admin password="strong_admin_password"

# Disable unnecessary services
/ip service disable telnet,ftp

# Configure secure SSH
/ip service set ssh port=2222

# Enable firewall
/ip firewall filter add chain=input action=drop comment="Drop all other input"
```

## 📊 Monitoring

### 1. Application Monitoring

```bash
# View application logs
docker-compose logs -f app

# Monitor with PM2
pm2 monit

# Check health endpoint
curl https://yourdomain.com/health
```

### 2. Database Monitoring

```bash
# PostgreSQL stats
docker-compose exec postgres psql -U postgres -d smartwifi -c "SELECT * FROM pg_stat_activity;"

# Redis monitoring
docker-compose exec redis redis-cli info
```

### 3. System Monitoring

```bash
# System resources
htop
df -h
free -m

# Network connections
netstat -tulpn
```

## 🚨 Troubleshooting

### Common Issues

1. **M-Pesa callbacks not received**
   - Check firewall allows HTTPS traffic
   - Verify callback URL is publicly accessible
   - Check M-Pesa whitelist settings

2. **RADIUS authentication fails**
   - Verify RADIUS server IP and secret
   - Check network connectivity between router and server
   - Review RADIUS logs: `docker-compose logs radius`

3. **Database connection errors**
   - Check PostgreSQL service status
   - Verify database credentials
   - Ensure database exists and migrations ran

4. **High memory usage**
   - Monitor Redis memory usage
   - Check for memory leaks in application
   - Consider increasing server resources

### Log Locations

- Application: `logs/combined.log`
- Nginx: `nginx_logs/access.log`, `nginx_logs/error.log`
- PostgreSQL: Docker logs
- Redis: Docker logs

## 📈 Scaling

### Horizontal Scaling

1. **Load Balancer Setup**
   ```bash
   # Add multiple app instances
   docker-compose up --scale app=3
   ```

2. **Database Clustering**
   - PostgreSQL streaming replication
   - Redis Cluster for high availability

3. **CDN Integration**
   - Serve static assets via CDN
   - Cache API responses where appropriate

### Performance Optimization

1. **Database Optimization**
   ```sql
   -- Add indexes for frequent queries
   CREATE INDEX CONCURRENTLY idx_sessions_active_end_time ON sessions(active, end_time);
   CREATE INDEX CONCURRENTLY idx_payments_status_created ON payments(status, created_at);
   ```

2. **Redis Caching**
   - Cache package data
   - Session state caching
   - Rate limiting counters

## 🔄 Backup and Recovery

### Automated Backups

```bash
# Database backup script
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# PostgreSQL backup
docker-compose exec postgres pg_dump -U postgres smartwifi > $BACKUP_DIR/db_$DATE.sql

# Application files backup
tar -czf $BACKUP_DIR/app_$DATE.tar.gz /path/to/app

# Retain only last 7 days
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

### Recovery Procedures

```bash
# Restore database
docker-compose exec postgres psql -U postgres -d smartwifi < backup.sql

# Restore application
tar -xzf app_backup.tar.gz -C /
```

## 📞 Support

### Getting Help

1. Check logs for error messages
2. Review this documentation
3. Search existing issues
4. Contact system administrator

### Maintenance Schedule

- **Daily**: Monitor system health and logs
- **Weekly**: Review payment reconciliation
- **Monthly**: Security updates and patches
- **Quarterly**: Performance optimization review

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

**⚠️ Important**: This system handles real money transactions. Always test thoroughly in a staging environment before deploying to production.
