import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixDatabase() {
    try {
        console.log('Starting database fix...');
        console.log(`Connecting to ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
        
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✓ Database connection successful');
        
        // Check if users table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('Users table does not exist. Running full production schema...');
            const schemaPath = join(__dirname, '..', 'src', 'database', 'production-schema.sql');
            const schemaSQL = readFileSync(schemaPath, 'utf8');
            await pool.query(schemaSQL);
            console.log('✓ Production schema applied');
        } else {
            console.log('Users table exists. Checking for missing columns...');
            
            // Add missing columns one by one
            const columnsToAdd = [
                { name: 'email_verified', type: 'BOOLEAN DEFAULT false' },
                { name: 'phone_verified', type: 'BOOLEAN DEFAULT false' },
                { name: 'failed_login_attempts', type: 'INTEGER DEFAULT 0' },
                { name: 'locked_until', type: 'TIMESTAMP WITH TIME ZONE' },
                { name: 'last_login', type: 'TIMESTAMP WITH TIME ZONE' },
                { name: 'first_name', type: 'VARCHAR(100)' },
                { name: 'last_name', type: 'VARCHAR(100)' },
                { name: 'active', type: 'BOOLEAN DEFAULT true' }
            ];
            
            for (const col of columnsToAdd) {
                const colCheck = await pool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_name = 'users' AND column_name = $1
                    );
                `, [col.name]);
                
                if (!colCheck.rows[0].exists) {
                    await pool.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
                    console.log(`✓ Added column: ${col.name}`);
                } else {
                    console.log(`  Column exists: ${col.name}`);
                }
            }
        }
        
        // Verify final schema
        const columns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        console.log('\nUsers table columns:');
        columns.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
        console.log('\n✓ Database fix completed successfully!');
        
    } catch (error) {
        console.error('Database fix failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

fixDatabase();
