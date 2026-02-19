const { db } = require('@team-mgmt/shared');

async function runMigration() {
    console.log('Starting migration: Fix Missing Triggers');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Re-define Functions (merged from 002)
        console.log('Re-defining refresh_daily_metrics...');
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

        console.log('Re-defining refresh_daily_financials...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.refresh_daily_financials(target_date DATE)
            RETURNS VOID AS $$
            DECLARE
                v_burn_amount NUMERIC;
            BEGIN
                SELECT COALESCE(SUM(e.expense_rate), 0) * 160 INTO v_burn_amount
                FROM core.employees e
                WHERE NOT EXISTS (
                    SELECT 1 FROM core.allocations a
                    WHERE a.employee_id = e.id
                    AND a.start_date <= target_date AND a.end_date >= target_date
                );

                INSERT INTO analytics.daily_financials (date, total_burn_amount, updated_at)
                VALUES (target_date, v_burn_amount, NOW())
                ON CONFLICT (date) DO UPDATE SET
                    total_burn_amount = EXCLUDED.total_burn_amount,
                    updated_at = NOW();
            END;
            $$ LANGUAGE plpgsql;
        `);

        console.log('Re-defining trigger_refresh_metrics...');
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
                    PERFORM analytics.refresh_daily_financials(d);
                END LOOP;

                IF (TG_OP = 'UPDATE') THEN
                    start_d := OLD.start_date;
                    end_d := OLD.end_date;
                     FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                        PERFORM analytics.refresh_daily_metrics(d);
                        PERFORM analytics.refresh_daily_financials(d);
                    END LOOP;
                END IF;

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        console.log('Re-defining trigger_refresh_financials_emp...');
        await client.query(`
            CREATE OR REPLACE FUNCTION analytics.trigger_refresh_financials_emp()
            RETURNS TRIGGER AS $$
            DECLARE
                d DATE;
                start_d DATE := CURRENT_DATE - INTERVAL '30 days';
                end_d DATE := CURRENT_DATE + INTERVAL '90 days';
            BEGIN
                IF (TG_OP = 'UPDATE' AND OLD.expense_rate = NEW.expense_rate) THEN
                    RETURN NULL;
                END IF;

                FOR d IN SELECT generate_series(start_d, end_d, '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d); 
                    PERFORM analytics.refresh_daily_financials(d);
                END LOOP;

                RETURN NULL;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 2. Re-apply Triggers
        console.log('Re-applying triggers...');

        await client.query(`DROP TRIGGER IF EXISTS trg_refresh_metrics ON core.allocations`);
        await client.query(`
            CREATE TRIGGER trg_refresh_metrics
            AFTER INSERT OR UPDATE OR DELETE ON core.allocations
            FOR EACH ROW EXECUTE FUNCTION analytics.trigger_refresh_metrics();
        `);

        await client.query(`DROP TRIGGER IF EXISTS trg_refresh_financials_emp ON core.employees`);
        await client.query(`
            CREATE TRIGGER trg_refresh_financials_emp
            AFTER INSERT OR UPDATE OR DELETE ON core.employees
            FOR EACH ROW EXECUTE FUNCTION analytics.trigger_refresh_financials_emp();
        `);

        // 3. Backfill
        console.log('Backfilling data (last 90 days to next 90 days)...');
        await client.query(`
            DO $$
            DECLARE
                d DATE;
            BEGIN
                FOR d IN SELECT generate_series(CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE + INTERVAL '90 days', '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d);
                    PERFORM analytics.refresh_daily_financials(d);
                END LOOP;
            END $$;
        `);

        await client.query('COMMIT');
        console.log('Migration fix completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration fix failed:', err);
        throw err;
    } finally {
        client.release();
        process.exit(0);
    }
}

runMigration();
