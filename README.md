# SmartWiFi — Pay-to-Connect Captive Portal

Production-ready Wi-Fi billing system for residential estates and apartments in Kenya. Users pay via M-Pesa STK Push and get timed internet access enforced by MikroTik routers through RADIUS.

---

## Architecture

```
User Device
    │
    │ connects to WiFi (MikroTik Hotspot)
    ▼
MikroTik Router ──── RADIUS (UDP 1812) ────► Node.js App
    │                                              │
    │ redirects uncapped users                     │
    ▼                                              │
Nginx (80/443) ──────────────────────────────────►│
    │                                             ├─ PostgreSQL 15
    │                                             ├─ Redis 7
    ▼                                              │
Captive Portal ──── M-Pesa STK Push ─────────────►│
(Browser)           (Daraja API)          session created on
                                          confirmed payment
```

**Stack:** Node.js 18 · TypeScript · Express · PostgreSQL 15 · Redis 7 · Docker · Nginx

**Ports:**
| Port | Protocol | Service |
|------|----------|---------|
| 80 | TCP | HTTP (redirect to HTTPS in production) |
| 443 | TCP | HTTPS (Nginx) |
| 3000 | TCP | App (internal, not exposed publicly) |
| 1812 | UDP | RADIUS Authentication |
| 3799 | UDP | RADIUS CoA (Change of Authorization) |

---

## Prerequisites

- Ubuntu 22.04 LTS VPS (min 1 GB RAM)
- Docker Engine 24+ and Docker Compose v2
- Domain name pointing to the server (for SSL)
- Safaricom Daraja API credentials (sandbox or production)
- MikroTik router running RouterOS 7+ with hotspot enabled

---

## Deployment

### 1. Clone and configure

```bash
git clone https://github.com/your-org/pay-to-connect.git
cd pay-to-connect
cp .env.example .env
nano .env
```

Fill in every variable in `.env`. See the table below for what each one does.

### 2. Required `.env` variables

| Variable | Example | Notes |
|----------|---------|-------|
| `DB_NAME` | `smartwifi` | PostgreSQL database name |
| `DB_USER` | `smartwifi` | PostgreSQL username |
| `DB_PASSWORD` | *(strong password)* | PostgreSQL password |
| `REDIS_PASSWORD` | *(strong password)* | Redis password |
| `JWT_SECRET` | *(64-char hex)* | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `ENCRYPTION_KEY` | *(32-char hex)* | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `MPESA_CONSUMER_KEY` | | From Safaricom Daraja portal |
| `MPESA_CONSUMER_SECRET` | | From Safaricom Daraja portal |
| `MPESA_SHORTCODE` | `174379` | Your paybill/till number |
| `MPESA_PASSKEY` | | From Daraja portal |
| `MPESA_CALLBACK_URL` | `https://yourdomain.com/api/portal/mpesa/callback` | Must be publicly reachable HTTPS |
| `MPESA_ENVIRONMENT` | `sandbox` or `production` | |
| `RADIUS_SECRET` | *(strong secret)* | Shared between this server and all MikroTik routers |
| `SERVER_HOST` | `yourdomain.com` | Used in MikroTik setup scripts |
| `CORS_ORIGIN` | `https://yourdomain.com` | Comma-separated if multiple origins |
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/smartwifi` | Must use `postgres` as host (Docker service name) |

### 3. Start the stack

```bash
# First boot — builds image, runs schema, creates admin user
docker compose up -d --build

# Watch logs
docker compose logs -f app
```

All five containers start in dependency order:
`postgres` → `redis` → `app` → `nginx`

The database schema and default admin user are created automatically on first boot.

**Default admin credentials:**
- Username: `admin`
- Password: `Calvin@4002`

**Change the admin password immediately after first login.**

### 4. SSL (production)

```bash
# Obtain certificate (DNS must already point to this server)
docker compose --profile certbot run --rm certbot

# Reload nginx with the new certificate
docker compose exec nginx nginx -s reload

# Switch to the HTTPS nginx config
cp nginx/sites-available/pay-to-connect-letsencrypt nginx/conf.d/smartwifi.conf
# Edit it: replace YOUR_DOMAIN with your actual domain
docker compose exec nginx nginx -s reload
```

### 5. Firewall (UFW)

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 1812/udp   # RADIUS auth
sudo ufw allow 3799/udp   # RADIUS CoA
sudo ufw enable
```

---

## MikroTik Setup

1. Log into the Admin Panel → **Routers** → **Add Router**
2. Enter the router's IP, API port (8729), and API credentials
3. Click **Generate Setup Script**
4. Copy the script and paste it into the MikroTik terminal (Winbox or SSH)
5. Click **Test Connection** to verify
6. Click **Sync Packages** to push hotspot profiles to the router

The script configures:
- RADIUS client pointing to your server
- Hotspot profile with `login-by=mac` (device MAC used as username)
- Walled garden to allow the portal before payment
- API-SSL service (port 8729) for remote management

---

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `/portal` | User-facing captive portal |
| `/admin` | Admin panel |
| `/login` | User login |
| `/health` | Health check (database + Redis status) |
| `POST /api/portal/mpesa/callback` | M-Pesa callback (Safaricom only) |
| `POST /api/portal/pay` | Initiate payment |
| `GET /api/portal/status/:checkoutId` | Poll payment status |

---

## Operations

### View logs
```bash
docker compose logs -f app       # Application
docker compose logs -f nginx     # Nginx access/error
docker compose logs -f postgres  # Database
```

### Database backup
```bash
docker compose exec postgres pg_dump -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d).sql
```

### Restore database
```bash
docker compose exec -T postgres psql -U $DB_USER $DB_NAME < backup.sql
```

### Restart a service
```bash
docker compose restart app
```

### Full redeploy (preserves data volumes)
```bash
git pull
docker compose build app
docker compose up -d
```

### Wipe and start fresh (destroys all data)
```bash
docker compose down -v
docker compose up -d --build
```

---

## Security Checklist

- [ ] Changed default admin password
- [ ] All `.env` secrets are unique and strong (use `crypto.randomBytes`)
- [ ] `MPESA_ENVIRONMENT=production` for live payments
- [ ] `CORS_ORIGIN` set to your exact domain (no wildcard)
- [ ] UFW firewall rules applied
- [ ] SSL certificate installed and HTTP redirects to HTTPS
- [ ] `RADIUS_SECRET` is a strong random string, same on all routers
- [ ] SSH key-based authentication only (disable password auth)

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| App fails to start | `docker compose logs app` — usually a missing `.env` variable |
| Postgres ECONNREFUSED | `DB_HOST` must be `postgres` (the Docker service name), not an IP |
| M-Pesa callback not received | Verify `MPESA_CALLBACK_URL` is HTTPS and publicly reachable; check Safaricom IP allowlist |
| RADIUS auth fails | Verify `RADIUS_SECRET` matches what was configured on the router; check port 1812/UDP is open |
| Admin login fails | Admin user created on first boot only — if volume was wiped, it re-creates automatically |
| Router connection fails | Ensure API-SSL (port 8729) is enabled on the router: `/ip service enable api-ssl` |
| Packages not syncing | Run **Sync Packages** from Admin → Routers after adding or changing packages |

---

## License

MIT
