require('dotenv').config({ path: '../../.env' });
const { db } = require('@team-mgmt/shared');

async function runMigration() {
    console.log('Starting migration: Add System Settings Management');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Create system_settings table
        console.log('Creating table core.system_settings...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS core.system_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Seed initial data
        console.log('Seeding initial system settings...');
        await client.query(`
            INSERT INTO core.system_settings (key, value)
            VALUES 
                ('currency', 'USD')
            ON CONFLICT (key) DO NOTHING
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
        throw err;
    } finally {
        client.release();
    }
}

if (require.main === module) {
    runMigration().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = runMigration;
