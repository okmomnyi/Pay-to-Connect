# 🔐 Secure Setup Guide - No Hardcoded Credentials

## ✅ **SECURITY STATUS: PROTECTED**
- ✅ Sensitive files removed from repository
- ✅ `.gitignore` updated to prevent credential commits
- ✅ Dynamic credential generation implemented
- ✅ Git history cleaned of sensitive data

## 🚀 **Setup Process**

### **1. Environment Configuration**
```bash
# Copy the template
cp .env.example .env

# Generate encryption key
node -e "console.log('ROUTER_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# Add the generated key to your .env file
```

### **2. Database Setup**
```bash
# Make sure your database is running and accessible
# Update .env with your actual database credentials

# Run the secure setup script
node scripts/setup-database.js
```

This will:
- Apply the router management schema
- Generate secure admin credentials dynamically
- Create sample packages
- Set up RBAC roles
- Display your admin credentials (SAVE THEM!)

### **3. Alternative: Manual Database Setup**
If the script fails, you can set up manually:

```bash
# Apply schema manually
psql -d your_database -f src/database/router-management-schema.sql

# Then run the interactive admin setup
node scripts/setup-admin.js
```

### **4. Install Dependencies**
```bash
npm install node-routeros bcrypt joi
npm install @types/bcrypt --save-dev
```

### **5. Start the Application**
```bash
npm start
```

## 🔑 **Admin Access**
- **URL**: http://localhost:3000/admin.html
- **Credentials**: Generated dynamically by setup script
- **⚠️ CRITICAL**: Change password after first login!

## 🛡️ **Security Features Implemented**

### **No Hardcoded Credentials**
- All passwords generated dynamically
- Encryption keys created at runtime
- No sensitive data in source code

### **Git Protection**
- Sensitive files in `.gitignore`
- Git history cleaned of credentials
- Template files for safe sharing

### **Database Security**
- Encrypted router credentials (AES-256)
- RBAC permission system
- Comprehensive audit logging
- Secure password hashing (bcrypt)

### **Router Management Security**
- Admin panel only access
- Encrypted credential storage
- Whitelisted MikroTik operations
- Connection validation before storage

## 📋 **Next Steps After Setup**

1. **Login to Admin Panel**
   - Use generated credentials from setup script
   - Change default password immediately

2. **Configure MikroTik Routers**
   - Create dedicated API users (not admin)
   - Enable API-SSL on port 8729
   - Configure firewall restrictions

3. **Test Security**
   - Verify RBAC permissions
   - Test router operations
   - Check audit logging

## 🚨 **Security Checklist**

- [ ] `.env` file not committed to git
- [ ] Admin password changed from generated default
- [ ] Router encryption key generated and secured
- [ ] Database credentials secured
- [ ] MikroTik API users created (not admin accounts)
- [ ] Firewall rules configured for API access
- [ ] Audit logging verified working

## 🔧 **Troubleshooting**

### Database Connection Issues
```bash
# Check database connectivity
psql -d your_database -c "SELECT version();"

# Verify .env configuration
cat .env | grep DATABASE_URL
```

### Admin Login Issues
```bash
# Verify admin user exists
psql -d your_database -c "SELECT username, active FROM admin_users WHERE username = 'admin';"

# Check RBAC roles
psql -d your_database -c "SELECT au.username, ar.name FROM admin_users au JOIN admin_user_roles aur ON au.id = aur.admin_user_id JOIN admin_roles ar ON aur.role_id = ar.id WHERE au.username = 'admin';"
```

### Router Connection Issues
- Verify MikroTik API-SSL is enabled
- Check firewall rules allow server IP
- Confirm API user has correct permissions
- Test connection from admin panel

## 📞 **Support**
All credentials are generated dynamically - no hardcoded passwords anywhere in the codebase. The system is now secure for production deployment.
