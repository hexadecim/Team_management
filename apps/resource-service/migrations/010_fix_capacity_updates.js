require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { db } = require('@team-mgmt/shared');

async function runMigration() {
    console.log('Starting migration: Fix Capacity Updates and Sync current_project (DEBUG MODE)');
    const client = await db.getClient();

    try {
        const dbName = await client.query('SELECT current_database()');
        console.log(`Attached to database: ${dbName.rows[0].current_database}`);

        // await client.query('BEGIN');
        await client.query('SET search_path TO core, analytics, public');

        // 1. Drop conflicting triggers and functions
        console.log('Cleaning up old triggers...');
        await client.query(`DROP TRIGGER IF EXISTS trg_update_daily_metrics_alloc ON core.allocations`);
        await client.query(`DROP TRIGGER IF EXISTS trg_update_metrics_on_employee_change ON core.employees`);
        await client.query(`DROP TRIGGER IF EXISTS trg_refresh_metrics ON core.allocations`);
        await client.query(`DROP TRIGGER IF EXISTS trg_sync_current_project ON core.allocations`);

        // 2. Define or Update Refresh Function for Metrics
        console.log('Defining analytics.refresh_daily_metrics...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.refresh_daily_metrics(target_date DATE)
            RETURNS VOID AS $$
            DECLARE
                v_total_count INTEGER;
                v_billable_count INTEGER;
                v_bench_count INTEGER;
            BEGIN
                -- 1. Total Employees
                SELECT COUNT(*) INTO v_total_count FROM core.employees;
                
                -- 2. Billable Employees (Active allocation to billable project on target_date)
                SELECT COUNT(DISTINCT a.employee_id) INTO v_billable_count
                FROM core.allocations a
                JOIN core.projects p ON a.project_id = p.id
                WHERE a.start_date <= target_date AND a.end_date >= target_date
                AND p.type = 'billable';

                -- 3. Bench Employees (No active allocations on target_date)
                SELECT COUNT(*) INTO v_bench_count
                FROM core.employees e
                WHERE NOT EXISTS (
                    SELECT 1 FROM core.allocations a
                    WHERE a.employee_id = e.id
                    AND a.start_date <= target_date AND a.end_date >= target_date
                );

                -- UPSERT into daily_metrics
                INSERT INTO analytics.daily_metrics (
                    date, total_count, billable_count, bench_count, updated_at
                ) VALUES (
                    target_date, v_total_count, v_billable_count, v_bench_count, NOW()
                )
                ON CONFLICT (date) DO UPDATE SET
                    total_count = EXCLUDED.total_count,
                    billable_count = EXCLUDED.billable_count,
                    bench_count = EXCLUDED.bench_count,
                    updated_at = NOW();    
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 3. Define Trigger Function for Allocation Changes (Metrics Range Refresh)
        console.log('Defining analytics.trigger_refresh_metrics...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.trigger_refresh_metrics()
            RETURNS TRIGGER AS $$
            DECLARE
                rec RECORD;
                d DATE;
                start_d DATE;
                end_d DATE;
            BEGIN
                IF (TG_OP = 'DELETE') THEN
                    rec := OLD;
                ELSE
                    rec := NEW;
                END IF;

                start_d := rec.start_date;
                end_d := rec.end_date;

                -- Refresh every day in the affected range
                FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d);
                END LOOP;

                -- If it's an update, also refresh the OLD range in case it shifted
                IF (TG_OP = 'UPDATE') THEN
                    IF (OLD.start_date != NEW.start_date OR OLD.end_date != NEW.end_date) THEN
                        start_d := OLD.start_date;
                        end_d := OLD.end_date;
                        FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                            PERFORM analytics.refresh_daily_metrics(d);
                        END LOOP;
                    END IF;
                END IF;

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 4. Define Synchronization Function for current_project
        console.log('Defining core.sync_employee_current_project...');
        await client.query(`
            CREATE OR REPLACE FUNCTION core.sync_employee_current_project()
            RETURNS TRIGGER AS $$
            DECLARE
                v_emp_id UUID;
                v_projects TEXT;
            BEGIN
                IF (TG_OP = 'DELETE') THEN v_emp_id := OLD.employee_id;
                ELSE v_emp_id := NEW.employee_id;
                END IF;

                -- Aggregate current active projects for the employee
                SELECT STRING_AGG(DISTINCT p.name, ', ') INTO v_projects
                FROM core.allocations a
                JOIN core.projects p ON a.project_id = p.id
                WHERE a.employee_id = v_emp_id
                AND a.start_date <= CURRENT_DATE AND a.end_date >= CURRENT_DATE;

                -- Update the employee record
                UPDATE core.employees 
                SET current_project = COALESCE(v_projects, '')
                WHERE id = v_emp_id;

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 5. Apply Triggers to core.allocations
        console.log('Applying triggers to core.allocations...');
        await client.query(`
            CREATE TRIGGER trg_refresh_metrics
            AFTER INSERT OR UPDATE OR DELETE ON core.allocations
            FOR EACH ROW EXECUTE FUNCTION analytics.trigger_refresh_metrics();
        `);

        await client.query(`
            CREATE TRIGGER trg_sync_current_project
            AFTER INSERT OR UPDATE OR DELETE ON core.allocations
            FOR EACH ROW EXECUTE FUNCTION core.sync_employee_current_project();
        `);

        // 6. Backfill Metrics (90 days window)
        console.log('Backfilling metrics (today - 30 to today + 60)...');
        await client.query(`
            DO $$
            DECLARE
                d DATE;
            BEGIN
                FOR d IN SELECT generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '60 days', '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d);
                END LOOP;
            END $$;
        `);

        // 7. Initial sync for current_project
        console.log('Performing initial current_project sync for all employees...');
        await client.query(`
            UPDATE core.employees e
            SET current_project = COALESCE((
                SELECT STRING_AGG(DISTINCT p.name, ', ')
                FROM core.allocations a
                JOIN core.projects p ON a.project_id = p.id
                WHERE a.employee_id = e.id
                AND a.start_date <= CURRENT_DATE AND a.end_date >= CURRENT_DATE
            ), '');
        `);

        // await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (err) {
        // await client.query('ROLLBACK');
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

runMigration();
