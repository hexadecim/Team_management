const { db } = require('@team-mgmt/shared');

async function runMigration() {
    console.log('Starting migration: Add Financial Year Management');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Create financial_years table
        console.log('Creating table core.financial_years...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS core.financial_years (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(50) NOT NULL UNIQUE, -- e.g. "FY 2025-26"
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                is_current BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Clear existing and seed initial data
        // Using DELETE instead of TRUNCATE for safety in migration scripts
        await client.query('DELETE FROM core.financial_years');

        console.log('Seeding initial financial years...');
        await client.query(`
            INSERT INTO core.financial_years (name, start_date, end_date, is_current)
            VALUES 
                ('FY 2024-25', '2024-04-01', '2025-03-31', FALSE),
                ('FY 2025-26', '2025-04-01', '2026-03-31', TRUE),
                ('FY 2026-27', '2026-04-01', '2027-03-31', FALSE)
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
