/**
 * Seed script for Pay-to-Connect production testing
 * Run inside the container:
 *   docker compose cp scripts/seed-test-data.js app:/app/seed.js
 *   docker compose exec app node /app/seed.js   (use MSYS_NO_PATHCONV=1 on Windows Git Bash)
 */

'use strict';

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// ─── Config (matches docker-compose internal networking) ─────────────────────
const DB_CONFIG = {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'captiveportal',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Calvin@4002',
};

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '3cb4580db45194010d381b9e0faa95856d894d285ddf865ed050357814b514f2';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
const TEST_PASSWORD = 'Test@1234';

// ─── AES-256-GCM encryption (mirrors src/utils/encryption.ts) ────────────────
function encrypt(plaintext) {
    const keyBuffer = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
        encrypted: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
    };
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const ESTATES = [
    { id: '10000000-0000-0000-0000-000000000001', name: 'Nairobi West Apartments', address: 'Nairobi West, Nairobi',  description: 'Residential apartments block A & B' },
    { id: '10000000-0000-0000-0000-000000000002', name: 'Westlands Complex',        address: 'Westlands, Nairobi',     description: 'Mixed-use commercial & residential' },
    { id: '10000000-0000-0000-0000-000000000003', name: 'Karen Residences',         address: 'Karen, Nairobi',         description: 'Gated community Karen suburb' },
];

// MikroTik routers
// router_credentials schema: router_id, api_username, api_password_encrypted, encryption_iv, encryption_auth_tag
const ROUTERS_RAW = [
    { id: '20000000-0000-0000-0000-000000000001', estate_id: '10000000-0000-0000-0000-000000000001', name: 'NW-Router-01',  ip_address: '192.168.88.1', api_port: 8728, username: 'admin',    password: 'admin',         description: 'Nairobi West Block A' },
    { id: '20000000-0000-0000-0000-000000000002', estate_id: '10000000-0000-0000-0000-000000000001', name: 'NW-Router-02',  ip_address: '192.168.89.1', api_port: 8728, username: 'admin',    password: 'admin',         description: 'Nairobi West Block B' },
    { id: '20000000-0000-0000-0000-000000000003', estate_id: '10000000-0000-0000-0000-000000000002', name: 'WL-Router-01',  ip_address: '192.168.90.1', api_port: 8728, username: 'wladmin', password: 'Westl@nds2024', description: 'Westlands Floors 1-3' },
    { id: '20000000-0000-0000-0000-000000000004', estate_id: '10000000-0000-0000-0000-000000000002', name: 'WL-Router-02',  ip_address: '192.168.91.1', api_port: 8729, username: 'wladmin', password: 'Westl@nds2024', description: 'Westlands Floors 4-6 (SSL)' },
    { id: '20000000-0000-0000-0000-000000000005', estate_id: '10000000-0000-0000-0000-000000000003', name: 'KN-Router-01',  ip_address: '10.0.0.1',    api_port: 8728, username: 'karennet', password: 'Karen$ecure!',  description: 'Karen Main Gate' },
];

const PACKAGES = [
    { id: '30000000-0000-0000-0000-000000000001', name: '30 Minutes Starter',  duration_minutes: 30,    price_kes: 5    },
    { id: '30000000-0000-0000-0000-000000000002', name: '1 Hour Basic',         duration_minutes: 60,    price_kes: 10   },
    { id: '30000000-0000-0000-0000-000000000003', name: '3 Hours Standard',     duration_minutes: 180,   price_kes: 25   },
    { id: '30000000-0000-0000-0000-000000000004', name: '6 Hours Extended',     duration_minutes: 360,   price_kes: 40   },
    { id: '30000000-0000-0000-0000-000000000005', name: '12 Hours Half-Day',    duration_minutes: 720,   price_kes: 70   },
    { id: '30000000-0000-0000-0000-000000000006', name: '24 Hours Daily',       duration_minutes: 1440,  price_kes: 100  },
    { id: '30000000-0000-0000-0000-000000000007', name: '7 Days Weekly',        duration_minutes: 10080, price_kes: 500  },
    { id: '30000000-0000-0000-0000-000000000008', name: '14 Days Bi-Weekly',    duration_minutes: 20160, price_kes: 900  },
    { id: '30000000-0000-0000-0000-000000000009', name: '30 Days Monthly',      duration_minutes: 43200, price_kes: 1500 },
];

// Portal users — login with username + Test@1234
const PORTAL_USERS = [
    { id: '40000000-0000-0000-0000-000000000001', username: 'testuser1',  email: 'testuser1@smartwifi.test',  phone: '+254711000001', first_name: 'Alice',  last_name: 'Wanjiku' },
    { id: '40000000-0000-0000-0000-000000000002', username: 'testuser2',  email: 'testuser2@smartwifi.test',  phone: '+254711000002', first_name: 'Brian',  last_name: 'Ochieng' },
    { id: '40000000-0000-0000-0000-000000000003', username: 'testuser3',  email: 'testuser3@smartwifi.test',  phone: '+254711000003', first_name: 'Carol',  last_name: 'Mutua'   },
    { id: '40000000-0000-0000-0000-000000000004', username: 'demoguest',  email: 'demo@smartwifi.test',       phone: '+254711000004', first_name: 'Demo',   last_name: 'Guest'   },
];

// Admin users — login with username + Test@1234
// admin_users has: id, username, email, password_hash, full_name, active
const ADMIN_USERS = [
    { id: '50000000-0000-0000-0000-000000000001', username: 'superadmin',  email: 'superadmin@smartwifi.test', full_name: 'Super Admin',   role: 'superadmin' },
    { id: '50000000-0000-0000-0000-000000000002', username: 'netadmin',    email: 'netadmin@smartwifi.test',   full_name: 'Network Admin',  role: 'netadmin'   },
    { id: '50000000-0000-0000-0000-000000000003', username: 'support1',    email: 'support1@smartwifi.test',   full_name: 'Support One',    role: 'support'    },
    { id: '50000000-0000-0000-0000-000000000004', username: 'reportonly',  email: 'reports@smartwifi.test',    full_name: 'Report Viewer',  role: 'admin'      },
];

const SECURITY_QUESTIONS = [
    "What was the name of your first pet?",
    "What is your mother's maiden name?",
    "What city were you born in?",
    "What was the name of your primary school?",
    "What is the name of the street you grew up on?",
    "What was your childhood nickname?",
    "What is your oldest sibling's middle name?",
    "What was the make of your first car?",
    "In what city did you meet your spouse/significant other?",
    "What is the name of your favourite childhood friend?",
    "What is your favourite sports team?",
    "What was the first concert you attended?",
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();

    try {
        console.log('Connected to PostgreSQL. Starting seed...\n');
        await client.query('BEGIN');

        // ── 1. Estates ──────────────────────────────────────────────────────
        console.log('→ Seeding estates...');
        for (const e of ESTATES) {
            await client.query(`
                INSERT INTO estates (id, name, address, description, active)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (id) DO UPDATE
                  SET name = EXCLUDED.name, address = EXCLUDED.address, description = EXCLUDED.description
            `, [e.id, e.name, e.address, e.description]);
            console.log(`   ✓ ${e.name}`);
        }

        // ── 2. Routers + credentials ─────────────────────────────────────────
        console.log('\n→ Seeding MikroTik routers...');
        for (const r of ROUTERS_RAW) {
            await client.query(`
                INSERT INTO routers (id, estate_id, name, ip_address, api_port, description, active)
                VALUES ($1, $2, $3, $4, $5, $6, true)
                ON CONFLICT (id) DO UPDATE
                  SET name = EXCLUDED.name, ip_address = EXCLUDED.ip_address,
                      api_port = EXCLUDED.api_port, description = EXCLUDED.description, active = true
            `, [r.id, r.estate_id, r.name, r.ip_address, r.api_port, r.description]);

            // Encrypt password only (schema stores plaintext username separately)
            const encPass = encrypt(r.password);

            await client.query(`
                INSERT INTO router_credentials
                    (router_id, api_username, api_password_encrypted, encryption_iv, encryption_auth_tag)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (router_id) DO UPDATE
                  SET api_username          = EXCLUDED.api_username,
                      api_password_encrypted = EXCLUDED.api_password_encrypted,
                      encryption_iv          = EXCLUDED.encryption_iv,
                      encryption_auth_tag    = EXCLUDED.encryption_auth_tag,
                      updated_at             = NOW()
            `, [r.id, r.username, encPass.encrypted, encPass.iv, encPass.authTag]);

            // Sync status placeholder
            await client.query(`
                INSERT INTO router_sync_status (router_id, sync_status)
                VALUES ($1, 'pending')
                ON CONFLICT (router_id) DO NOTHING
            `, [r.id]);

            console.log(`   ✓ ${r.name}  ${r.ip_address}:${r.api_port}  user="${r.username}"`);
        }

        // ── 3. Packages ──────────────────────────────────────────────────────
        console.log('\n→ Seeding packages...');
        for (const p of PACKAGES) {
            await client.query(`
                INSERT INTO packages (id, name, duration_minutes, price_kes, active)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (id) DO UPDATE
                  SET name = EXCLUDED.name, duration_minutes = EXCLUDED.duration_minutes,
                      price_kes = EXCLUDED.price_kes, active = true
            `, [p.id, p.name, p.duration_minutes, p.price_kes]);
            console.log(`   ✓ ${p.name}  ${p.duration_minutes}min  KES ${p.price_kes}`);
        }

        // ── 4. Security questions ─────────────────────────────────────────────
        console.log('\n→ Seeding security questions...');
        for (const q of SECURITY_QUESTIONS) {
            await client.query(`
                INSERT INTO security_questions (question, active)
                SELECT $1, true
                WHERE NOT EXISTS (SELECT 1 FROM security_questions WHERE question = $1)
            `, [q]);
        }
        const sqCount = await client.query("SELECT COUNT(*) FROM security_questions WHERE active = true");
        console.log(`   ✓ ${sqCount.rows[0].count} active security questions in DB`);

        // ── 5. Portal test users ──────────────────────────────────────────────
        console.log('\n→ Seeding portal users...');
        const userHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
        for (const u of PORTAL_USERS) {
            await client.query(`
                INSERT INTO users (id, username, email, phone, password_hash, first_name, last_name, active, email_verified)
                VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
                ON CONFLICT (id) DO UPDATE
                  SET username = EXCLUDED.username, email = EXCLUDED.email, phone = EXCLUDED.phone,
                      first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
                      password_hash = EXCLUDED.password_hash, active = true
            `, [u.id, u.username, u.email, u.phone, userHash, u.first_name, u.last_name]);
            console.log(`   ✓ ${u.username}  ${u.phone}  pwd: ${TEST_PASSWORD}`);
        }

        // ── 6. Admin users ────────────────────────────────────────────────────
        console.log('\n→ Seeding admin users...');
        const adminHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

        const rolesResult = await client.query('SELECT id, name FROM admin_roles');
        const roleMap = {};
        for (const row of rolesResult.rows) roleMap[row.name] = row.id;
        console.log(`   Found roles: ${Object.keys(roleMap).join(', ') || '(none)'}`);

        for (const a of ADMIN_USERS) {
            await client.query(`
                INSERT INTO admin_users (id, username, email, password_hash, full_name, active)
                VALUES ($1, $2, $3, $4, $5, true)
                ON CONFLICT (id) DO UPDATE
                  SET username = EXCLUDED.username, email = EXCLUDED.email,
                      password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, active = true
            `, [a.id, a.username, a.email, adminHash, a.full_name]);

            const roleId = roleMap[a.role] || roleMap['admin'];
            if (roleId) {
                await client.query(`
                    INSERT INTO admin_user_roles (admin_user_id, role_id)
                    VALUES ($1, $2)
                    ON CONFLICT (admin_user_id, role_id) DO NOTHING
                `, [a.id, roleId]);
            }
            console.log(`   ✓ ${a.username}  role=${a.role}  pwd: ${TEST_PASSWORD}`);
        }

        // ── 7. Test devices ───────────────────────────────────────────────────
        console.log('\n→ Seeding test devices...');
        // devices schema: id, user_id, mac_address, device_name, device_type, first_seen, last_seen
        const TEST_DEVICES = [
            { id: '60000000-0000-0000-0000-000000000001', user_id: '40000000-0000-0000-0000-000000000001', mac: 'AA:BB:CC:DD:EE:01', name: "Alice's Phone",  type: 'mobile' },
            { id: '60000000-0000-0000-0000-000000000002', user_id: '40000000-0000-0000-0000-000000000002', mac: 'AA:BB:CC:DD:EE:02', name: "Brian's Laptop", type: 'laptop' },
            { id: '60000000-0000-0000-0000-000000000003', user_id: '40000000-0000-0000-0000-000000000003', mac: 'AA:BB:CC:DD:EE:03', name: "Carol's Tablet",  type: 'tablet' },
            { id: '60000000-0000-0000-0000-000000000004', user_id: '40000000-0000-0000-0000-000000000004', mac: 'AA:BB:CC:DD:EE:04', name: 'Demo Device',    type: 'unknown' },
        ];
        for (const d of TEST_DEVICES) {
            await client.query(`
                INSERT INTO devices (id, user_id, mac_address, device_name, device_type, first_seen, last_seen)
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE
                  SET mac_address = EXCLUDED.mac_address, device_name = EXCLUDED.device_name,
                      last_seen = NOW()
            `, [d.id, d.user_id, d.mac, d.name, d.type]);
            console.log(`   ✓ ${d.mac}  ${d.name}`);
        }

        await client.query('COMMIT');

        // ── Summary ──────────────────────────────────────────────────────────
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║              SEED COMPLETED SUCCESSFULLY                   ║');
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log(`║  Password for ALL test accounts: ${TEST_PASSWORD}              ║`);
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log('║  PORTAL USERS — login at /login                            ║');
        for (const u of PORTAL_USERS) {
            console.log(`║    ${u.username.padEnd(12)} ${u.phone}                   ║`);
        }
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log('║  ADMIN USERS — login at /admin                             ║');
        for (const a of ADMIN_USERS) {
            console.log(`║    ${a.username.padEnd(12)} role: ${a.role.padEnd(12)}               ║`);
        }
        console.log('╠════════════════════════════════════════════════════════════╣');
        console.log('║  MIKROTIK ROUTERS (credentials encrypted in DB)            ║');
        for (const r of ROUTERS_RAW) {
            console.log(`║    ${r.name.padEnd(14)} ${r.ip_address.padEnd(15)}:${r.api_port}  user=${r.username}  ║`);
        }
        console.log('╚════════════════════════════════════════════════════════════╝');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n✗ Seed failed — rolled back.');
        console.error('  Error:', err.message);
        if (err.detail) console.error('  Detail:', err.detail);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
