# Quick Start - Admin Panel

## Issues Fixed

1. ✅ **Tailwind CDN Warning** - Replaced with CSS import
2. ✅ **admin.js 404 Error** - Fixed static file serving with proper MIME types
3. ✅ **Login Debugging** - Added console logging and better error messages

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Make sure your `.env` file has these critical variables:

```env
# Database (Required)
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=captive_portal
DB_USER=your-db-user
DB_PASSWORD=your-db-password

# Security (Required)
JWT_SECRET=your-super-secure-jwt-secret-key-here
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Generate ENCRYPTION_KEY with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Setup Database

Run the setup script:
```bash
node scripts/setup-admin-panel.js
```

Or manually:
```bash
# Connect to PostgreSQL
psql -U your_db_user -d captive_portal

# Run schema
\i src/database/admin-schema.sql

# Initialize admin
\i src/database/init-admin.sql
```

### 4. Test Database Setup

Run the diagnostic script:
```bash
node scripts/test-admin-login.js
```

This will:
- Check database connection
- Verify admin user exists
- Unlock account if locked
- Reset password if needed
- Verify roles and permissions

### 5. Build and Start

```bash
npm run build
npm start
```

### 6. Access Admin Panel

- **URL**: http://localhost:3000/admin
- **Username**: `admin`
- **Password**: `Admin@123456`

**⚠️ CRITICAL: Change this password immediately after first login!**

## Troubleshooting

### Login Not Working

1. **Check browser console** (F12) for errors
2. **Check server logs** for authentication errors
3. **Run diagnostic**: `node scripts/test-admin-login.js`
4. **Verify database setup**: Check if admin_users table exists
5. **Check environment variables**: Ensure JWT_SECRET and ENCRYPTION_KEY are set

### admin.js Not Loading

1. **Clear browser cache** (Ctrl+Shift+Delete)
2. **Check file exists**: `public/admin.js`
3. **Rebuild**: `npm run build`
4. **Check server logs** for static file errors

### Account Locked

Run this SQL to unlock:
```sql
UPDATE admin_users 
SET locked = false, failed_login_attempts = 0 
WHERE username = 'admin';
```

Or run: `node scripts/test-admin-login.js` (auto-unlocks)

### Database Connection Failed

1. Check `.env` database credentials
2. Verify PostgreSQL is running
3. Test connection: `psql -U your_db_user -d captive_portal`

### ENCRYPTION_KEY Error

Generate a new key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```env
ENCRYPTION_KEY=<generated-key-here>
```

## Next Steps After Login

1. **Change default password** immediately
2. **Create additional admin users** with appropriate roles
3. **Add routers** in the Routers section
4. **Test router connections**
5. **Sync packages to routers**

## Common Login Issues

### Issue: "Login failed" error
**Solution**: Run `node scripts/test-admin-login.js` to verify setup

### Issue: "Connection error"
**Solution**: Check if server is running and database is accessible

### Issue: "Account locked"
**Solution**: Run diagnostic script or manually unlock in database

### Issue: Nothing happens after clicking login
**Solution**: 
1. Open browser console (F12)
2. Check for JavaScript errors
3. Verify admin.js is loading (Network tab)
4. Check server is running on correct port

## Browser Console Debugging

Open browser console (F12) and check for:
- **Login response**: Should show `{success: true, token: "...", admin: {...}}`
- **Network errors**: Check Network tab for failed requests
- **JavaScript errors**: Check Console tab for errors

## Support

If issues persist:
1. Check server logs for detailed error messages
2. Run diagnostic script: `node scripts/test-admin-login.js`
3. Verify all environment variables are set correctly
4. Ensure database schema is properly initialized
