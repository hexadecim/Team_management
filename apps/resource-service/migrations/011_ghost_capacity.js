require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { db } = require('@team-mgmt/shared');

async function runMigration() {
    console.log('Starting migration 011: Ghost Capacity Tracking');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Create ghost_capacity_log table
        console.log('Creating analytics.ghost_capacity_log...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS analytics.ghost_capacity_log (
                id          SERIAL PRIMARY KEY,
                employee_id UUID NOT NULL,
                project_id  UUID NOT NULL,
                actual_allocation  INTEGER NOT NULL,       -- The % actually allocated (e.g. 50)
                ghost_capacity     INTEGER NOT NULL,       -- 100 - actual (e.g. 50)
                allocation_start   DATE NOT NULL,
                allocation_end     DATE NOT NULL,
                recorded_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                operation          VARCHAR(10) NOT NULL    -- 'INSERT' | 'UPDATE' | 'DELETE'
            );
        `);

        // Index for fast employee/date lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_ghost_capacity_employee
                ON analytics.ghost_capacity_log (employee_id, recorded_at DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_ghost_capacity_date
                ON analytics.ghost_capacity_log (recorded_at DESC);
        `);

        // 2. Create trigger function that logs ghost capacity on allocation changes
        console.log('Creating trigger function analytics.log_ghost_capacity...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.log_ghost_capacity()
            RETURNS TRIGGER AS $$
            DECLARE
                rec RECORD;
            BEGIN
                -- On DELETE log the old row; otherwise log new
                IF (TG_OP = 'DELETE') THEN
                    rec := OLD;
                ELSE
                    rec := NEW;
                END IF;

                -- Only log allocations that are < 100% (ghost capacity exists)
                IF rec.percentage < 100 THEN
                    INSERT INTO analytics.ghost_capacity_log (
                        employee_id, project_id,
                        actual_allocation, ghost_capacity,
                        allocation_start, allocation_end,
                        recorded_at, operation
                    ) VALUES (
                        rec.employee_id, rec.project_id,
                        rec.percentage, (100 - rec.percentage),
                        rec.start_date, rec.end_date,
                        NOW(), TG_OP
                    );
                END IF;

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 3. Drop + recreate trigger to avoid duplicates
        console.log('Attaching trigger to core.allocations...');
        await client.query(`DROP TRIGGER IF EXISTS trg_log_ghost_capacity ON core.allocations`);
        await client.query(`
            CREATE TRIGGER trg_log_ghost_capacity
            AFTER INSERT OR UPDATE OR DELETE ON core.allocations
            FOR EACH ROW EXECUTE FUNCTION analytics.log_ghost_capacity();
        `);

        // 4. Backfill current under-allocated allocations into the log
        console.log('Backfilling existing under-allocated allocations...');
        await client.query(`
            INSERT INTO analytics.ghost_capacity_log (
                employee_id, project_id,
                actual_allocation, ghost_capacity,
                allocation_start, allocation_end,
                recorded_at, operation
            )
            SELECT
                a.employee_id,
                a.project_id,
                a.percentage,
                (100 - a.percentage),
                a.start_date,
                a.end_date,
                NOW(),
                'BACKFILL'
            FROM core.allocations a
            WHERE a.percentage < 100
            ON CONFLICT DO NOTHING;
        `);

        await client.query('COMMIT');
        console.log('Migration 011 completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration 011 failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

runMigration();
