#!/usr/bin/env node

/**
 * Generate Encryption Key
 * Creates a secure 32-byte encryption key for the admin panel
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

// Generate encryption key
const encryptionKey = crypto.randomBytes(32).toString('hex');

log('\n==============================================', colors.blue);
log('  Encryption Key Generated', colors.blue);
log('==============================================\n', colors.blue);

log('Your encryption key:', colors.green);
log(encryptionKey, colors.reset);

log('\n==============================================', colors.blue);
log('  Add to .env file', colors.blue);
log('==============================================\n', colors.blue);

log('Add this line to your .env file:', colors.yellow);
log(`ENCRYPTION_KEY=${encryptionKey}`, colors.reset);

log('\n⚠️  IMPORTANT:', colors.yellow);
log('- Keep this key secure and never commit it to version control', colors.reset);
log('- Do NOT change this key after routers are added (credentials will be unrecoverable)', colors.reset);
log('- Backup this key in a secure location\n', colors.reset);

// Check if .env file exists
const envPath = path.join(__dirname, '../.env');
const envExamplePath = path.join(__dirname, '../.env.example');

if (!fs.existsSync(envPath)) {
    log('Creating .env file from .env.example...', colors.yellow);
    
    if (fs.existsSync(envExamplePath)) {
        let envContent = fs.readFileSync(envExamplePath, 'utf8');
        
        // Replace the placeholder encryption key
        envContent = envContent.replace(
            /ENCRYPTION_KEY=.*/,
            `ENCRYPTION_KEY=${encryptionKey}`
        );
        
        fs.writeFileSync(envPath, envContent);
        log('✓ .env file created with encryption key', colors.green);
    } else {
        log('⚠ .env.example not found. Please create .env manually', colors.yellow);
    }
} else {
    log('\n.env file already exists.', colors.yellow);
    log('To update it, add or replace the ENCRYPTION_KEY line:', colors.yellow);
    log(`ENCRYPTION_KEY=${encryptionKey}\n`, colors.reset);
}
