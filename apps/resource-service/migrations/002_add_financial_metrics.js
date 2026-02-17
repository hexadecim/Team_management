const db = require('../../../packages/shared/db');

async function runMigration() {
    console.log('Starting migration: Add Financial Metrics');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 0. Ensure 'type' column exists in core.projects (Missing in some envs)
        console.log("Checking for 'type' column in core.projects...");
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'core' 
            AND table_name = 'projects' 
            AND column_name = 'type'
        `);
        if (res.rowCount === 0) {
            console.log("Adding missing 'type' column to core.projects...");
            await client.query(`
                ALTER TABLE core.projects 
                ADD COLUMN type VARCHAR(20) DEFAULT 'billable' CHECK (type IN ('billable', 'internal'));
            `);
        }

        // 1. Create daily_financials table
        console.log('Creating analytics.daily_financials table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS analytics.daily_financials (
                date DATE PRIMARY KEY,
                total_burn_amount NUMERIC DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_date FOREIGN KEY (date) REFERENCES analytics.daily_metrics(date) ON DELETE CASCADE
            );
        `);

        // 1b. Ensure refresh_daily_metrics exists (Missing in some envs)
        console.log('Ensuring refresh_daily_metrics function exists...');
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
                
                -- 2. Billable Employees
                SELECT COUNT(DISTINCT a.employee_id) INTO v_billable_count
                FROM core.allocations a
                JOIN core.projects p ON a.project_id = p.id
                WHERE a.start_date <= target_date AND a.end_date >= target_date
                AND p.type = 'billable';

                -- 3. Bench Employees
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

        // 2. Create function to calculate daily financials
        console.log('Creating refresh_daily_financials function...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.refresh_daily_financials(target_date DATE)
            RETURNS VOID AS $$
            DECLARE
                v_burn_amount NUMERIC;
            BEGIN
                -- Calculate Bench Burn: Sum of (expense_rate * 160) for unallocated employees
                -- Note: expense_rate is hourly. 160 is std monthly hours.
                -- We assume burn rate is a "Monthly Equivalent" rate for that day's status.
                
                SELECT COALESCE(SUM(e.expense_rate), 0) * 160 INTO v_burn_amount
                FROM core.employees e
                WHERE NOT EXISTS (
                    SELECT 1 FROM core.allocations a
                    WHERE a.employee_id = e.id
                    AND a.start_date <= target_date AND a.end_date >= target_date
                );

                -- UPSERT
                INSERT INTO analytics.daily_financials (date, total_burn_amount, updated_at)
                VALUES (target_date, v_burn_amount, NOW())
                ON CONFLICT (date) DO UPDATE SET
                    total_burn_amount = EXCLUDED.total_burn_amount,
                    updated_at = NOW();
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 3. Update existing allocation trigger to also refresh financials
        // We redefine the function logic to include the new call
        console.log('Updating trigger_refresh_metrics function...');
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

                FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d);
                    PERFORM analytics.refresh_daily_financials(d); -- ADDED THIS
                END LOOP;

                IF (TG_OP = 'UPDATE') THEN
                    start_d := OLD.start_date;
                    end_d := OLD.end_date;
                     FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                        PERFORM analytics.refresh_daily_metrics(d);
                        PERFORM analytics.refresh_daily_financials(d); -- ADDED THIS
                    END LOOP;
                END IF;

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 4. Create NEW trigger function for Employee changes
        console.log('Creating trigger_refresh_financials_emp function...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.trigger_refresh_financials_emp()
            RETURNS TRIGGER AS $$
            DECLARE
                d DATE;
                -- We limit the scope to "Active" window usually, but for simplicity let's refresh
                -- from TODAY to +90 days. Changing past history might not be desired, 
                -- but changing expense rate technically changes past burn reports if we want them live.
                -- For now, let's update from 30 days ago to 90 days ahead to keep reports reasonably accurate.
                start_d DATE := CURRENT_DATE - INTERVAL '30 days';
                end_d DATE := CURRENT_DATE + INTERVAL '90 days';
            BEGIN
                -- If it's just an update to unrelated fields, skip
                IF (TG_OP = 'UPDATE' AND OLD.expense_rate = NEW.expense_rate) THEN
                    RETURN NULL;
                END IF;

                -- Refresh financials for the window
                FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                    -- We also need to ensure daily_metrics exists for the FK constraint
                    PERFORM analytics.refresh_daily_metrics(d); 
                    PERFORM analytics.refresh_daily_financials(d);
                END LOOP;

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 5. Bind Trigger to Employees
        console.log('Binding trigger to core.employees...');
        await client.query(`DROP TRIGGER IF EXISTS trg_refresh_financials_emp ON core.employees`);
        await client.query(`
            CREATE TRIGGER trg_refresh_financials_emp
            AFTER INSERT OR UPDATE OR DELETE ON core.employees
            FOR EACH ROW EXECUTE FUNCTION analytics.trigger_refresh_financials_emp();
        `);

        // 6. Backfill
        console.log('Backfilling financial data...');
        await client.query(`
            DO $$
            DECLARE
                d DATE;
            BEGIN
                FOR d IN SELECT generate_series(CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '90 days', '1 day'::interval) LOOP
                    -- Ensure parent record exists first
                    PERFORM analytics.refresh_daily_metrics(d);
                    PERFORM analytics.refresh_daily_financials(d);
                END LOOP;
            END $$;
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
        throw err;
    } finally {
        client.release();
        process.exit(0);
    }
}

runMigration();
