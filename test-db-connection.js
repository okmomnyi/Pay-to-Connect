const { Client } = require('pg');

const client = new Client({
  host: '134.122.83.72',
  port: 5432,
  database: 'captiveportal',
  user: 'postgres',
  password: 'Calvin@4002',
});

async function testConnection() {
  try {
    console.log('Attempting to connect to database...');
    await client.connect();
    console.log('✓ Successfully connected to database!');
    
    // Test query
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('\nDatabase Info:');
    console.log('Current Time:', result.rows[0].current_time);
    console.log('PostgreSQL Version:', result.rows[0].pg_version);
    
    // List tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('\nTables in database:');
    if (tables.rows.length > 0) {
      tables.rows.forEach(row => {
        console.log('  -', row.table_name);
      });
    } else {
      console.log('  No tables found');
    }
    
    await client.end();
    console.log('\n✓ Connection closed successfully');
  } catch (error) {
    console.error('✗ Database connection error:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

testConnection();
