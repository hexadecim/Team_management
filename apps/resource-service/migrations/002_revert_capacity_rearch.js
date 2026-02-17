const db = require('../../../packages/shared/db');

async function revertMigration() {
    console.log('Starting REVERT: Capacity Analysis Re-architecture');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Drop Trigger
        console.log('Dropping trigger trg_refresh_metrics...');
        await client.query(`DROP TRIGGER IF EXISTS trg_refresh_metrics ON core.allocations`);

        // 2. Drop Trigger Function
        console.log('Dropping function analytics.trigger_refresh_metrics...');
        await client.query(`DROP FUNCTION IF EXISTS analytics.trigger_refresh_metrics()`);

        // 3. Drop Refresh Function
        console.log('Dropping function analytics.refresh_daily_metrics...');
        await client.query(`DROP FUNCTION IF EXISTS analytics.refresh_daily_metrics(DATE)`);

        // 4. Drop Table
        console.log('Dropping table analytics.daily_metrics...');
        await client.query(`DROP TABLE IF EXISTS analytics.daily_metrics`);

        // 5. Drop Schema
        console.log('Dropping schema analytics...');
        await client.query(`DROP SCHEMA IF EXISTS analytics`);

        // 6. Remove Column from Projects
        console.log('Removing type column from core.projects...');
        await client.query(`ALTER TABLE core.projects DROP COLUMN IF EXISTS type`);

        await client.query('COMMIT');
        console.log('Revert completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Revert failed:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

revertMigration();
