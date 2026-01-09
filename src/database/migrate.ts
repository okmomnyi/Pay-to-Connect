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

async function runMigrations() {
    try {
        console.log('Starting database migration...');
        
        // Read SQL files from src directory (not dist)
        const srcDir = join(__dirname, '..', '..', 'src', 'database');
        const productionSchemaSQL = readFileSync(join(srcDir, 'production-schema.sql'), 'utf8');
        
        console.log('Running production schema...');
        console.log('This will create all tables, indexes, functions, and triggers...');
        await pool.query(productionSchemaSQL);
        
        console.log('✓ Production schema applied successfully!');
        
        console.log('Database migration completed successfully!');
        
        // Verify tables were created
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('Created tables:');
        result.rows.forEach(row => {
            console.log(`- ${row.table_name}`);
        });
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    runMigrations();
}

export { runMigrations };
