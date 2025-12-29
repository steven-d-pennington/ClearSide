/**
 * Database Connection Test Script
 *
 * Usage: Set DATABASE_URL environment variable and run:
 * DATABASE_URL="postgresql://..." node test-db-connection.js
 */

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  process.exit(1);
}

console.log('📡 Testing database connection...');
console.log('🔗 URL format:', DATABASE_URL.replace(/:([^:@]{8})[^:@]*@/, ':****@'));

// Create pool with explicit SSL configuration
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Accept self-signed certificates
  },
  connectionTimeoutMillis: 10000,
});

async function testConnection() {
  let client;
  try {
    console.log('⏳ Attempting connection...');
    client = await pool.connect();
    console.log('✅ Connection successful!');

    const result = await client.query('SELECT version() as pg_version, NOW() as current_time');
    console.log('📊 PostgreSQL version:', result.rows[0].pg_version);
    console.log('🕐 Server time:', result.rows[0].current_time);

    // Test if we can create tables
    console.log('\n🧪 Testing table creation...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_connection_check (
        id SERIAL PRIMARY KEY,
        checked_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`INSERT INTO test_connection_check DEFAULT VALUES`);
    const testResult = await client.query(`SELECT COUNT(*) as count FROM test_connection_check`);
    console.log('✅ Table operations work! Row count:', testResult.rows[0].count);

    // Cleanup
    await client.query(`DROP TABLE IF EXISTS test_connection_check`);

    console.log('\n🎉 All connection tests passed!');
    console.log('✅ SSL configuration is working correctly');

  } catch (error) {
    console.error('\n💥 Connection test failed!');
    console.error('Error:', error.message);

    if (error.code) {
      console.error('PostgreSQL Error Code:', error.code);
    }

    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    // Provide troubleshooting hints
    console.error('\n💡 Troubleshooting:');
    if (error.message.includes('self-signed certificate')) {
      console.error('- SSL certificate issue detected');
      console.error('- The connection config should have ssl: { rejectUnauthorized: false }');
      console.error('- Verify the DATABASE_URL doesn\'t have conflicting SSL parameters');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('- Connection refused - check host and port');
      console.error('- Verify firewall/IP allowlist settings');
    } else if (error.message.includes('authentication')) {
      console.error('- Authentication failed - check username/password');
    }

    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

testConnection();
