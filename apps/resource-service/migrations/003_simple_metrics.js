const db = require('../../../packages/shared/db');

async function runMigration() {
    console.log('Starting migration: Simple Billable/Bench Metrics');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Create Schema if not exists
        await client.query(`CREATE SCHEMA IF NOT EXISTS analytics`);

        // 2. Create Table
        console.log('Creating table analytics.daily_metrics...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS analytics.daily_metrics (
                date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
                total_count INTEGER DEFAULT 0,
                billable_count INTEGER DEFAULT 0,
                bench_count INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Create Function to Calculate and Upsert
        console.log('Creating function analytics.update_employee_metrics...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.update_employee_metrics()
            RETURNS TRIGGER AS $$
            DECLARE
                v_total INTEGER;
                v_billable INTEGER;
                v_bench INTEGER;
            BEGIN
                -- Calculate counts based on current_project column
                -- Billable: current_project IS NOT NULL AND current_project != ''
                -- Bench: current_project IS NULL OR current_project = ''
                
                SELECT 
                    COUNT(*),
                    COUNT(CASE WHEN current_project IS NOT NULL AND current_project != '' THEN 1 END),
                    COUNT(CASE WHEN current_project IS NULL OR current_project = '' THEN 1 END)
                INTO v_total, v_billable, v_bench
                FROM core.employees;

                -- Upsert for Today
                INSERT INTO analytics.daily_metrics (date, total_count, billable_count, bench_count, updated_at)
                VALUES (CURRENT_DATE, v_total, v_billable, v_bench, CURRENT_TIMESTAMP)
                ON CONFLICT (date) 
                DO UPDATE SET 
                    total_count = EXCLUDED.total_count,
                    billable_count = EXCLUDED.billable_count,
                    bench_count = EXCLUDED.bench_count,
                    updated_at = EXCLUDED.updated_at;

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 4. Create Trigger
        console.log('Creating trigger trg_update_metrics_on_employee_change...');
        await client.query(`DROP TRIGGER IF EXISTS trg_update_metrics_on_employee_change ON core.employees`);
        await client.query(`
            CREATE TRIGGER trg_update_metrics_on_employee_change
            AFTER INSERT OR UPDATE OR DELETE ON core.employees
            FOR EACH STATEMENT
            EXECUTE FUNCTION analytics.update_employee_metrics();
        `);

        // 5. Initial Population
        console.log('Running initial population...');
        await client.query(`
            INSERT INTO analytics.daily_metrics (date, total_count, billable_count, bench_count, updated_at)
            SELECT 
                CURRENT_DATE,
                COUNT(*),
                COUNT(CASE WHEN current_project IS NOT NULL AND current_project != '' THEN 1 END),
                COUNT(CASE WHEN current_project IS NULL OR current_project = '' THEN 1 END),
                CURRENT_TIMESTAMP
            FROM core.employees
            ON CONFLICT (date) 
            DO UPDATE SET 
                total_count = EXCLUDED.total_count,
                billable_count = EXCLUDED.billable_count,
                bench_count = EXCLUDED.bench_count,
                updated_at = EXCLUDED.updated_at;
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

runMigration();
