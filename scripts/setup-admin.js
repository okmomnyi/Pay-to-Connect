#!/usr/bin/env node
/**
 * Secure Admin Setup Script
 * 
 * This script creates an admin user in the database.
 * It prompts for credentials interactively - NO HARDCODED PASSWORDS.
 * 
 * Usage: node scripts/setup-admin.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function questionHidden(query) {
    return new Promise(resolve => {
        const stdin = process.stdin;
        const stdout = process.stdout;
        
        stdout.write(query);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        
        let password = '';
        stdin.on('data', function listener(char) {
            char = char.toString('utf8');
            
            switch (char) {
                case '\n':
                case '\r':
                case '\u0004':
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.removeListener('data', listener);
                    stdout.write('\n');
                    resolve(password);
                    break;
                case '\u0003':
                    process.exit();
                    break;
                case '\u007f':
                    password = password.slice(0, -1);
                    stdout.clearLine();
                    stdout.cursorTo(0);
                    stdout.write(query);
                    stdout.write('*'.repeat(password.length));
                    break;
                default:
                    password += char;
                    stdout.write('*');
                    break;
            }
        });
    });
}

async function setupAdmin() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   Secure Admin User Setup                  ║');
    console.log('║   Pay-to-Connect System                    ║');
    console.log('╚════════════════════════════════════════════╝\n');

    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
        console.error('❌ Error: Database configuration not found in environment variables.');
        console.error('Please ensure .env file is configured with DATABASE_URL or DB_* variables.\n');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectionTimeoutMillis: 30000,
        ssl: process.env.DB_SSL === 'true' ? {
            rejectUnauthorized: false
        } : false
    });

    try {
        console.log('📋 Please provide admin user details:\n');

        const username = await question('Username: ');
        if (!username || username.length < 3) {
            console.error('❌ Username must be at least 3 characters long.');
            process.exit(1);
        }

        const email = await question('Email: ');
        if (!email || !email.includes('@')) {
            console.error('❌ Please provide a valid email address.');
            process.exit(1);
        }

        const password = await questionHidden('Password (min 8 characters): ');
        if (!password || password.length < 8) {
            console.error('\n❌ Password must be at least 8 characters long.');
            process.exit(1);
        }

        const confirmPassword = await questionHidden('Confirm Password: ');
        if (password !== confirmPassword) {
            console.error('\n❌ Passwords do not match.');
            process.exit(1);
        }

        console.log('\n🔐 Hashing password...');
        const passwordHash = await bcrypt.hash(password, 12);

        console.log('🔍 Checking if admin user exists...');
        const checkResult = await pool.query(
            'SELECT id FROM admin_users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (checkResult.rows.length > 0) {
            const update = await question('\n⚠️  Admin user already exists. Update? (yes/no): ');
            if (update.toLowerCase() !== 'yes') {
                console.log('❌ Setup cancelled.');
                process.exit(0);
            }

            await pool.query(
                'UPDATE admin_users SET password_hash = $1, email = $2, active = true WHERE username = $3',
                [passwordHash, email, username]
            );
            console.log('\n✅ Admin user updated successfully!');
        } else {
            await pool.query(
                'INSERT INTO admin_users (username, email, password_hash, active) VALUES ($1, $2, $3, true)',
                [username, email, passwordHash]
            );
            console.log('\n✅ Admin user created successfully!');
        }

        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║   Setup Complete                           ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('\n📝 Admin Details:');
        console.log('   Username:', username);
        console.log('   Email:', email);
        console.log('\n🌐 Login at: http://localhost:3000/api/admin');
        console.log('\n⚠️  IMPORTANT: Store these credentials securely!');
        console.log('   This information will not be displayed again.\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
        rl.close();
    }
}

setupAdmin();
