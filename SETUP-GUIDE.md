# 🚀 Pay-to-Connect Setup Guide

## Prerequisites

- Node.js 16+ installed
- PostgreSQL database (Neon or local)
- M-Pesa API credentials (for production)

---

## 1️⃣ Environment Configuration

Create a `.env` file in the project root:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration (Use ONE of these methods)
# Method 1: Connection String
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# Method 2: Individual Parameters
DB_HOST=your-database-host
DB_PORT=5432
DB_NAME=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_SSL=true

# JWT Secret (CRITICAL - Generate a strong secret)
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your-generated-secret-here-minimum-32-characters

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Redis Configuration (Optional - for caching)
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# M-Pesa Configuration
MPESA_CONSUMER_KEY=your-mpesa-consumer-key
MPESA_CONSUMER_SECRET=your-mpesa-consumer-secret
MPESA_SHORTCODE=your-shortcode
MPESA_PASSKEY=your-passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/portal/mpesa/callback
MPESA_ENVIRONMENT=sandbox

# RADIUS Configuration
RADIUS_SECRET=your-radius-shared-secret

# Logging
LOG_LEVEL=info
```

---

## 2️⃣ Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build
```

---

## 3️⃣ Database Setup

```bash
# Run database migrations
npm run migrate
```

This will create all necessary tables:
- users
- admin_users
- packages
- devices
- sessions
- payments
- routers

---

## 4️⃣ Create Admin User (SECURE METHOD)

**NEVER use hardcoded credentials. Always use the secure setup script:**

```bash
node scripts/setup-admin.js
```

The script will prompt you for:
- Username (min 3 characters)
- Email address
- Password (min 8 characters)
- Password confirmation

**The password is never displayed or logged.**

Example:
```
╔════════════════════════════════════════════╗
║   Secure Admin User Setup                  ║
║   Pay-to-Connect System                    ║
╚════════════════════════════════════════════╝

📋 Please provide admin user details:

Username: admin
Email: admin@yourcompany.com
Password (min 8 characters): ********
Confirm Password: ********

🔐 Hashing password...
✅ Admin user created successfully!

╔════════════════════════════════════════════╗
║   Setup Complete                           ║
╚════════════════════════════════════════════╝

📝 Admin Details:
   Username: admin
   Email: admin@yourcompany.com

🌐 Login at: http://localhost:3000/api/admin

⚠️  IMPORTANT: Store these credentials securely!
```

---

## 5️⃣ Create Initial Packages

After creating an admin user, log in to the admin panel and create Wi-Fi packages:

1. Navigate to http://localhost:3000/api/admin
2. Login with your admin credentials
3. Go to "Packages" section
4. Click "Add Package"
5. Create packages (e.g., "1 Hour - KES 10", "1 Day - KES 50")

---

## 6️⃣ Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on the configured PORT (default: 3000).

---

## 7️⃣ Verify Installation

### Check Health Endpoint
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-01-07T...",
  "services": {
    "database": "connected",
    "redis": "disabled",
    "radius": "running"
  }
}
```

### Test Admin Login
1. Open http://localhost:3000/api/admin
2. Enter your admin credentials
3. Verify dashboard loads

### Test User Portal
1. Open http://localhost:3000/portal
2. Verify packages are displayed
3. Test user registration

---

## 🔒 Security Checklist

Before going to production:

- [ ] **Generate strong JWT_SECRET** (64+ characters)
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```

- [ ] **Set NODE_ENV=production**

- [ ] **Enable HTTPS** (use Let's Encrypt or commercial SSL)

- [ ] **Configure proper CORS_ORIGIN** (your domain, not *)

- [ ] **Use strong database password**

- [ ] **Create admin user with strong password** (min 12 characters, mixed case, numbers, symbols)

- [ ] **Verify M-Pesa credentials** (test in sandbox first)

- [ ] **Set up database backups**

- [ ] **Configure log rotation**

- [ ] **Set up monitoring** (Sentry, DataDog, etc.)

- [ ] **Review security audit report** (SECURITY-AUDIT-REPORT.md)

---

## 📁 Project Structure

```
Pay-to-Connect/
├── src/
│   ├── controllers/      # Business logic
│   ├── routes/          # API routes
│   ├── middleware/      # Auth, security, validation
│   ├── services/        # External services (M-Pesa, RADIUS)
│   ├── database/        # DB connection & migrations
│   └── utils/           # Logging, helpers
├── public/              # Frontend files
├── scripts/             # Setup & maintenance scripts
├── logs/                # Application logs
└── .env                 # Environment configuration
```

---

## 🔧 Maintenance Scripts

### Create/Update Admin User
```bash
node scripts/setup-admin.js
```

### Run Database Migrations
```bash
npm run migrate
```

### Check Database Connection
```bash
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL}); p.query('SELECT NOW()').then(r=>console.log('✅ Connected:',r.rows[0].now)).catch(e=>console.error('❌ Error:',e.message)).finally(()=>p.end());"
```

---

## 🚨 Troubleshooting

### Database Connection Failed
- Verify DATABASE_URL or DB_* variables in .env
- Check database is running and accessible
- Verify SSL settings (sslmode=require for Neon)
- Check firewall rules

### Admin Login Not Working
- Verify admin user was created: `node scripts/setup-admin.js`
- Check browser console for errors (F12)
- Verify JWT_SECRET is set in .env
- Hard refresh browser (Ctrl+Shift+R)

### Packages Not Showing
- Log in to admin panel
- Create packages in Packages section
- Verify database connection is working
- Check browser console for API errors

### M-Pesa Callback Not Working
- Verify MPESA_CALLBACK_URL is publicly accessible
- Check M-Pesa IP whitelist in middleware
- Review server logs for callback errors
- Test in sandbox environment first

---

## 📞 Support

For issues:
1. Check logs: `logs/app.log`
2. Review documentation: `SECURITY-AUDIT-REPORT.md`, `PRODUCTION-READINESS.md`
3. Verify environment configuration
4. Check database connectivity

---

## 🎯 Next Steps

1. ✅ Complete environment setup
2. ✅ Create admin user securely
3. ✅ Create Wi-Fi packages
4. ✅ Test user registration and login
5. ✅ Test payment flow (sandbox)
6. ✅ Configure production environment
7. ✅ Enable HTTPS
8. ✅ Deploy to production

---

**Remember:** Never commit `.env` file or hardcode credentials in code!

