-- Trigger Function to Update Daily Metrics
-- This function is called whenever there is a change in the core.allocations table.
-- It recalculates the Billable vs. Bench counts for the current day.

CREATE OR REPLACE FUNCTION update_daily_metrics() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO analytics.daily_metrics (
        date, 
        total_count, 
        billable_count, 
        bench_count, 
        updated_at
    )
    SELECT 
        CURRENT_DATE,
        -- Total Employees
        (SELECT COUNT(*) FROM core.employees),
        
        -- Billable Count: Employees with ACTIVE allocations covering TODAY
        (SELECT COUNT(DISTINCT employee_id) 
         FROM core.allocations 
         WHERE start_date <= CURRENT_DATE 
           AND end_date >= CURRENT_DATE),
           
        -- Bench Count: Total - Billable
        (SELECT COUNT(*) FROM core.employees) - 
        (SELECT COUNT(DISTINCT employee_id) 
         FROM core.allocations 
         WHERE start_date <= CURRENT_DATE 
           AND end_date >= CURRENT_DATE),
           
        NOW()
    ON CONFLICT (date) 
    DO UPDATE SET 
        total_count = EXCLUDED.total_count, 
        billable_count = EXCLUDED.billable_count, 
        bench_count = EXCLUDED.bench_count, 
        updated_at = NOW();
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger Definition
DROP TRIGGER IF EXISTS trg_update_daily_metrics_alloc ON core.allocations;

CREATE TRIGGER trg_update_daily_metrics_alloc
AFTER INSERT OR UPDATE OR DELETE ON core.allocations
FOR EACH STATEMENT
EXECUTE FUNCTION update_daily_metrics();
