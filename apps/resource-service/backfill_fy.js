const { db } = require('@team-mgmt/shared');

async function runBackfill() {
    console.log('Starting Fiscal Year Backfill (2025-04-01 to 2026-03-31)');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // Target range: Current Fiscal Year
        const startDate = '2025-04-01';
        const endDate = '2026-03-31';

        console.log(`Backfilling from ${startDate} to ${endDate}...`);

        await client.query(`
            DO $$
            DECLARE
                d DATE;
                v_start_date DATE := '${startDate}';
                v_end_date DATE := '${endDate}';
            BEGIN
                FOR d IN SELECT generate_series(v_start_date, v_end_date, '1 day'::interval) LOOP
                    PERFORM analytics.refresh_daily_metrics(d);
                    PERFORM analytics.refresh_daily_financials(d);
                END LOOP;
            END $$;
        `);

        await client.query('COMMIT');
        console.log('Backfill completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Backfill failed:', err);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

runBackfill();
