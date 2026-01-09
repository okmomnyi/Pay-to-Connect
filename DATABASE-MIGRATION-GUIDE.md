# Database Migration Guide

## Running the Production Schema

You have two options to run the `production-schema.sql` file:

---

## Option 1: Using the Migration Script (Recommended)

### Step 1: Update the migration script

Edit `src/database/migrate.ts` to include the production schema:

```typescript
const productionSchemaSQL = readFileSync(join(srcDir, 'production-schema.sql'), 'utf8');

console.log('Running production schema...');
await pool.query(productionSchemaSQL);
```

### Step 2: Run the migration

```powershell
npm run migrate
```

This will:
- Connect to your database
- Execute the production schema
- Create all tables, indexes, functions, and triggers
- Insert default security questions

---

## Option 2: Using psql Command Line

### Step 1: Open PowerShell in project directory

```powershell
cd "c:\Users\okmom\Downloads\New folder (4)\Pay-to-Connect"
```

### Step 2: Run psql command

```powershell
psql -h YOUR_DB_HOST -p 5432 -U YOUR_DB_USER -d YOUR_DB_NAME -f src/database/production-schema.sql
```

**Replace:**
- `YOUR_DB_HOST` - Your database host (e.g., `134.122.83.72` or `localhost`)
- `YOUR_DB_USER` - Your database username
- `YOUR_DB_NAME` - Your database name

**Example:**
```powershell
psql -h 134.122.83.72 -p 5432 -U postgres -d smartwifi -f src/database/production-schema.sql
```

You'll be prompted for the password.

---

## Option 3: Using pgAdmin (GUI)

### Step 1: Open pgAdmin

### Step 2: Connect to your database

### Step 3: Open Query Tool
- Right-click on your database
- Select "Query Tool"

### Step 4: Load the SQL file
- Click "Open File" icon
- Navigate to: `src/database/production-schema.sql`
- Click "Execute" (F5)

---

## Option 4: Using DBeaver (GUI)

### Step 1: Open DBeaver

### Step 2: Connect to your database

### Step 3: Open SQL Editor
- Right-click on your database
- Select "SQL Editor" → "New SQL Script"

### Step 4: Load and execute
- Click "Open SQL Script" icon
- Select `src/database/production-schema.sql`
- Click "Execute SQL Statement" (Ctrl+Enter)

---

## Verification

After running the migration, verify tables were created:

```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see tables like:
- users
- packages
- sessions
- payments
- security_questions
- user_security_answers
- rate_limit_attempts
- password_recovery_attempts
- etc.

---

## Check Database Functions

```sql
-- List all functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_type = 'FUNCTION' 
AND routine_schema = 'public';
```

You should see:
- `get_user_total_data_usage`
- `get_user_active_session_stats`
- `get_user_session_history`
- `check_rate_limit`
- `log_rate_limit_attempt`
- `update_updated_at_column`

---

## Troubleshooting

### Error: "relation already exists"

This means tables already exist. You have two options:

**Option A: Drop and recreate (CAUTION: Deletes all data)**
```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
-- Then run the production-schema.sql again
```

**Option B: Skip existing tables**

The schema uses `CREATE TABLE IF NOT EXISTS` so it should skip existing tables. If you get errors, you may need to manually drop conflicting tables.

### Error: "permission denied"

Make sure your database user has CREATE privileges:
```sql
GRANT CREATE ON SCHEMA public TO your_username;
```

### Error: "database does not exist"

Create the database first:
```sql
CREATE DATABASE smartwifi;
```

---

## Environment Variables

Make sure your `.env` file has correct database credentials:

```env
DB_HOST=134.122.83.72
DB_PORT=5432
DB_NAME=smartwifi
DB_USER=your_username
DB_PASSWORD=your_password
```

---

## After Migration

Once the schema is applied:

1. **Restart the server:**
   ```powershell
   npm run dev
   ```

2. **Verify connection:**
   - Check server logs for "Database connected successfully"
   - No errors about missing tables

3. **Test basic queries:**
   ```sql
   SELECT * FROM security_questions;
   SELECT * FROM packages;
   ```

---

## Quick Command Reference

```powershell
# Using npm migration script
npm run migrate

# Using psql directly
psql -h HOST -U USER -d DATABASE -f src/database/production-schema.sql

# Check if psql is installed
psql --version

# Connect to database interactively
psql -h HOST -U USER -d DATABASE
```

---

## Notes

- The production schema includes all features: security questions, rate limiting, usage tracking
- It's safe to run multiple times (uses `IF NOT EXISTS` and `IF NOT EXISTS`)
- Backup your database before running if you have existing data
- The schema creates indexes automatically for performance
- Default security questions are inserted automatically
