const { db } = require('@team-mgmt/shared');

async function runMigration() {
    console.log('Starting migration: Capacity Analysis Re-architecture');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Add type column to core.projects
        console.log('Adding type column to core.projects...');
        // Check if column exists first
        const colCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'core' 
            AND table_name = 'projects' 
            AND column_name = 'type'
        `);

        if (colCheck.rowCount === 0) {
            await client.query(`
                ALTER TABLE core.projects 
                ADD COLUMN type VARCHAR(20) DEFAULT 'billable' CHECK (type IN ('billable', 'internal'));
            `);
            console.log('Column added.');
        } else {
            console.log('Column already exists.');
        }

        // 2. Create analytics schema
        console.log('Creating analytics schema...');
        await client.query(`CREATE SCHEMA IF NOT EXISTS analytics`);

        // 3. Create daily_metrics table
        console.log('Creating analytics.daily_metrics table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS analytics.daily_metrics (
                date DATE PRIMARY KEY,
                total_employees INTEGER DEFAULT 0,
                billable_employees INTEGER DEFAULT 0,
                internal_employees INTEGER DEFAULT 0,
                bench_employees INTEGER DEFAULT 0,
                total_capacity NUMERIC DEFAULT 0,
                allocated_capacity NUMERIC DEFAULT 0,
                billable_capacity NUMERIC DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Create trigger function
        console.log('Creating refresh_daily_metrics function...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.refresh_daily_metrics(target_date DATE)
            RETURNS VOID AS $$
            DECLARE
                v_total_emp INTEGER;
                v_billable_emp INTEGER;
                v_internal_emp INTEGER;
                v_bench_emp INTEGER;
                v_total_cap NUMERIC;
                v_alloc_cap NUMERIC;
                v_billable_cap NUMERIC;
            BEGIN
                -- 1. Total Employees
                SELECT COUNT(*) INTO v_total_emp FROM core.employees;
                
                -- 2. Billable Employees (Allocated to 'billable' projects on target_date)
                SELECT COUNT(DISTINCT a.employee_id) INTO v_billable_emp
                FROM core.allocations a
                JOIN core.projects p ON a.project_id = p.id
                WHERE a.start_date <= target_date AND a.end_date >= target_date
                AND p.type = 'billable';

                -- 3. Internal Employees (Allocated to 'internal' projects but NOT 'billable' projects)
                -- Note: If an employee is on both, they count as billable for simplicity, or we check distinct ids
                -- Let's stick to: Any active allocation = active.
                -- Precise definition:
                -- Billable Emp: Has >=1 billable allocation
                -- Internal Emp: Has >=1 internal allocation AND 0 billable allocations
                
                SELECT COUNT(DISTINCT e.id) INTO v_internal_emp
                FROM core.employees e
                WHERE EXISTS (
                    SELECT 1 FROM core.allocations a
                    JOIN core.projects p ON a.project_id = p.id
                    WHERE a.employee_id = e.id
                    AND a.start_date <= target_date AND a.end_date >= target_date
                    AND p.type = 'internal'
                )
                AND NOT EXISTS (
                    SELECT 1 FROM core.allocations a
                    JOIN core.projects p ON a.project_id = p.id
                    WHERE a.employee_id = e.id
                    AND a.start_date <= target_date AND a.end_date >= target_date
                    AND p.type = 'billable'
                );

                -- 4. Bench Employees (No active allocations)
                SELECT COUNT(*) INTO v_bench_emp
                FROM core.employees e
                WHERE NOT EXISTS (
                    SELECT 1 FROM core.allocations a
                    WHERE a.employee_id = e.id
                    AND a.start_date <= target_date AND a.end_date >= target_date
                );

                -- 5. Capacities
                v_total_cap := v_total_emp * 100;

                -- Allocated Capacity (Sum of all allocation percentages)
                SELECT COALESCE(SUM(a.percentage), 0) INTO v_alloc_cap
                FROM core.allocations a
                WHERE a.start_date <= target_date AND a.end_date >= target_date;

                -- Billable Capacity (Sum of percentages for billable projects)
                SELECT COALESCE(SUM(a.percentage), 0) INTO v_billable_cap
                FROM core.allocations a
                JOIN core.projects p ON a.project_id = p.id
                WHERE a.start_date <= target_date AND a.end_date >= target_date
                AND p.type = 'billable';

                -- UPSERT into daily_metrics
                INSERT INTO analytics.daily_metrics (
                    date, total_employees, billable_employees, internal_employees, bench_employees,
                    total_capacity, allocated_capacity, billable_capacity, updated_at
                ) VALUES (
                    target_date, v_total_emp, v_billable_emp, v_internal_emp, v_bench_emp,
                    v_total_cap, v_alloc_cap, v_billable_cap, NOW()
                )
                ON CONFLICT (date) DO UPDATE SET
                    total_employees = EXCLUDED.total_employees,
                    billable_employees = EXCLUDED.billable_employees,
                    internal_employees = EXCLUDED.internal_employees,
                    bench_employees = EXCLUDED.bench_employees,
                    total_capacity = EXCLUDED.total_capacity,
                    allocated_capacity = EXCLUDED.allocated_capacity,
                    billable_capacity = EXCLUDED.billable_capacity,
                    updated_at = NOW();
                    
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 5. Create Trigger Function for Allocations
        console.log('Creating trigger_refresh_metrics function...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.trigger_refresh_metrics()
            RETURNS TRIGGER AS $$
            DECLARE
                rec RECORD;
                d DATE;
                start_d DATE;
                end_d DATE;
            BEGIN
                -- Determine range to refresh
                IF (TG_OP = 'DELETE') THEN
                    rec := OLD;
                ELSE
                    rec := NEW;
                END IF;

                start_d := rec.start_date;
                end_d := rec.end_date;

                -- Loop through every day in the allocation range and refresh metrics
                -- Optimization: For long ranges, this might be slow, but for allocations it's usually acceptable
                -- Alternatively, we could just mark them dirty, but user asked for "real-time via triggers".
                
                FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d);
                END LOOP;

                IF (TG_OP = 'UPDATE') THEN
                     -- Also refresh OLD range if it was different
                    start_d := OLD.start_date;
                    end_d := OLD.end_date;
                     FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                        PERFORM analytics.refresh_daily_metrics(d);
                    END LOOP;
                END IF;

                RETURN NULL; -- After trigger, return value doesn't matter
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 6. Bind Trigger to Allocations
        console.log('Binding trigger to core.allocations...');
        await client.query(`DROP TRIGGER IF EXISTS trg_refresh_metrics ON core.allocations`);
        await client.query(`
            CREATE TRIGGER trg_refresh_metrics
            AFTER INSERT OR UPDATE OR DELETE ON core.allocations
            FOR EACH ROW EXECUTE FUNCTION analytics.trigger_refresh_metrics();
        `);

        // 7. Initial Population (Backfill for last 1 year and next 1 year)
        console.log('Backfilling data (previous 30 days to next 90 days)...');
        // Doing a smaller range for speed during this migration
        await client.query(`
            DO $$
            DECLARE
                d DATE;
            BEGIN
                FOR d IN SELECT generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '90 days', '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d);
                END LOOP;
            END $$;
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        client.release();
        // We persist the connection pool in shared, so we need to forcibly close it or just exit
        process.exit(0);
    }
}

runMigration();
