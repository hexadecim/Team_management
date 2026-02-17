const db = require('../packages/shared/db');

async function backfill() {
    console.log('Starting extended backfill for Financial Metrics (Apr 2025 onwards)...');

    try {
        await db.queryCore(`
            DO $$
            DECLARE
                d DATE;
                start_date DATE := '2025-04-01';
                end_date DATE := '2025-12-20'; 
            BEGIN
                FOR d IN SELECT generate_series(start_date, end_date, '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d);
                    PERFORM analytics.refresh_daily_financials(d);
                END LOOP;
            END $$;
        `);
        console.log('Extended backfill completed.');

        const res = await db.queryCore("SELECT COUNT(*) FROM analytics.daily_financials WHERE date >= '2025-04-01' AND date <= '2025-11-30'");
        console.log('Verification count (Apr-Nov):', res.rows[0].count);
    } catch (error) {
        console.error('Backfill failed:', error);
    } finally {
        process.exit(0);
    }
}

backfill();
