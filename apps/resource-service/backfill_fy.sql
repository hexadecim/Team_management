DO $$
DECLARE
    d DATE;
    v_start_date DATE := '2025-04-01';
    v_end_date DATE := '2026-03-31';
BEGIN
    FOR d IN SELECT generate_series(v_start_date, v_end_date, '1 day'::interval) LOOP
        PERFORM analytics.refresh_daily_metrics(d);
        PERFORM analytics.refresh_daily_financials(d);
    END LOOP;
END $$;
