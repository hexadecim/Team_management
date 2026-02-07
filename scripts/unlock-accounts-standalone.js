/**
 * Standalone script to unlock all user accounts
 * Run with: node scripts/unlock-accounts-standalone.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'team_management',
    user: process.env.DB_USER || 'sanjayrana',
    password: process.env.DB_PASSWORD || '',
});

async function unlockAccounts() {
    try {
        console.log('Connecting to database...');
        const client = await pool.connect();

        console.log('Clearing failed login attempts...');
        await client.query('TRUNCATE TABLE iam.failed_login_attempts');

        console.log('✅ Successfully cleared all failed login attempts');
        console.log('All user accounts are now unlocked');

        client.release();
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error unlocking accounts:', error.message);
        await pool.end();
        process.exit(1);
    }
}

unlockAccounts();
