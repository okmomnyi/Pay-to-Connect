const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initializeDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('🔄 Initializing database...');
        
        // Check if admin_users table exists and has data
        const adminCheck = await client.query('SELECT COUNT(*) FROM admin_users WHERE username = $1', ['admin']);
        
        if (adminCheck.rows[0].count === '0') {
            console.log('📝 Creating default admin user...');
            
            // Hash the default password
            const passwordHash = await bcrypt.hash('admin123', 12);
            
            await client.query(
                'INSERT INTO admin_users (username, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
                ['admin', 'admin@estate.local', passwordHash]
            );
            
            console.log('✅ Default admin user created (username: admin, password: admin123)');
        } else {
            console.log('✅ Admin user already exists');
        }
        
        // Check if packages exist
        const packageCheck = await client.query('SELECT COUNT(*) FROM packages');
        
        if (packageCheck.rows[0].count === '0') {
            console.log('📦 Creating default packages...');
            
            const packages = [
                ['1 Hour Basic', 60, 10.00],
                ['3 Hours Standard', 180, 25.00],
                ['24 Hours Premium', 1440, 50.00],
                ['7 Days Unlimited', 10080, 200.00]
            ];
            
            for (const [name, duration, price] of packages) {
                await client.query(
                    'INSERT INTO packages (name, duration_minutes, price_kes) VALUES ($1, $2, $3)',
                    [name, duration, price]
                );
            }
            
            console.log('✅ Default packages created');
        } else {
            console.log('✅ Packages already exist');
        }
        
        // Check if estates exist
        const estateCheck = await client.query('SELECT COUNT(*) FROM estates');
        
        if (estateCheck.rows[0].count === '0') {
            console.log('🏢 Creating default estate...');
            
            await client.query(
                'INSERT INTO estates (name) VALUES ($1)',
                ['Default Estate']
            );
            
            console.log('✅ Default estate created');
        } else {
            console.log('✅ Estate already exists');
        }
        
        console.log('🎉 Database initialization completed successfully!');
        console.log('');
        console.log('Admin Login Credentials:');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('');
        console.log('IMPORTANT: Change the default admin password in production!');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run initialization
initializeDatabase()
    .then(() => {
        console.log('Database initialization completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Database initialization failed:', error);
        process.exit(1);
    });
