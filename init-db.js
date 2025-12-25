// Quick database initialization script
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

async function initializeDatabase() {
    console.log('🔄 Initializing database...');
    
    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful');

        // Read schema file
        const schemaPath = path.join(__dirname, 'src', 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Execute schema
        console.log('🔄 Creating tables...');
        await pool.query(schema);
        console.log('✅ All tables created successfully');

        // Verify tables
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        console.log('\n📋 Created tables:');
        result.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });

        console.log('\n✅ Database initialization complete!');
        console.log('🚀 You can now start the application with: npm run dev');

    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        if (error.message.includes('password')) {
            console.error('\n⚠️  Please make sure DB_PASSWORD is set in your .env file');
            console.error('   Get it from: https://dashboard.render.com/d/dpg-d56ki275r7bs73flekng-a');
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

initializeDatabase();
