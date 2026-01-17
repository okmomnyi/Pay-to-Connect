#!/usr/bin/env node

/**
 * Admin Panel Setup Script
 * Initializes the admin panel database schema and creates default admin user
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function setupAdminPanel() {
    log('\n==============================================', colors.bright);
    log('  Admin Panel Setup', colors.bright);
    log('==============================================\n', colors.bright);

    // Validate environment variables
    log('1. Validating environment variables...', colors.blue);
    
    const requiredVars = ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'ENCRYPTION_KEY'];
    const missing = requiredVars.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
        log(`❌ Missing required environment variables: ${missing.join(', ')}`, colors.red);
        log('Please update your .env file and try again.', colors.yellow);
        process.exit(1);
    }

    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
        log('❌ ENCRYPTION_KEY must be at least 32 characters long', colors.red);
        log('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"', colors.yellow);
        process.exit(1);
    }

    log('✓ Environment variables validated', colors.green);

    // Connect to database
    log('\n2. Connecting to database...', colors.blue);
    
    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        log('✓ Connected to database', colors.green);
    } catch (error) {
        log(`❌ Failed to connect to database: ${error.message}`, colors.red);
        process.exit(1);
    }

    // Run admin schema
    log('\n3. Creating admin panel schema...', colors.blue);
    
    try {
        const schemaPath = path.join(__dirname, '../src/database/admin-schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        await client.query(schemaSql);
        log('✓ Admin schema created successfully', colors.green);
    } catch (error) {
        log(`❌ Failed to create schema: ${error.message}`, colors.red);
        await client.end();
        process.exit(1);
    }

    // Check if admin user already exists
    log('\n4. Checking for existing admin user...', colors.blue);
    
    try {
        const result = await client.query(
            "SELECT id, username FROM admin_users WHERE username = 'admin'"
        );

        if (result.rows.length > 0) {
            log('⚠ Admin user already exists', colors.yellow);
            log('Username: admin', colors.yellow);
            log('If you forgot the password, you can reset it manually in the database.', colors.yellow);
        } else {
            // Create default admin user
            log('\n5. Creating default admin user...', colors.blue);
            
            const initPath = path.join(__dirname, '../src/database/init-admin.sql');
            const initSql = fs.readFileSync(initPath, 'utf8');
            
            await client.query(initSql);
            
            log('✓ Default admin user created', colors.green);
            log('\n==============================================', colors.bright);
            log('  Default Admin Credentials', colors.bright);
            log('==============================================', colors.bright);
            log('Username: admin', colors.green);
            log('Password: Admin@123456', colors.green);
            log('\n⚠️  CRITICAL: Change this password immediately!', colors.red);
            log('==============================================\n', colors.bright);
        }
    } catch (error) {
        log(`❌ Failed to create admin user: ${error.message}`, colors.red);
        await client.end();
        process.exit(1);
    }

    // Close database connection
    await client.end();

    // Final instructions
    log('\n==============================================', colors.bright);
    log('  Setup Complete!', colors.bright);
    log('==============================================\n', colors.bright);
    
    log('Next steps:', colors.blue);
    log('1. Install dependencies: npm install', colors.reset);
    log('2. Build the project: npm run build', colors.reset);
    log('3. Start the server: npm start', colors.reset);
    log('4. Access admin panel: http://localhost:3000/admin', colors.reset);
    log('5. Login with the credentials above', colors.reset);
    log('6. CHANGE THE DEFAULT PASSWORD immediately!', colors.red);
    
    log('\nFor more information, see ADMIN_PANEL_SETUP.md\n', colors.yellow);
}

// Run setup
setupAdminPanel().catch(error => {
    log(`\n❌ Setup failed: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
});
