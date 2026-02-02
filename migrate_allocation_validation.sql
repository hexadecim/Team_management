-- Migration: Update allocation validation to check per-month instead of total
-- This replaces the check_allocation_limit function to validate that allocations
-- don't exceed 100% for any individual month

DROP TRIGGER IF EXISTS trg_check_allocation_limit ON core.allocations;
DROP FUNCTION IF EXISTS check_allocation_limit();

-- Trigger Function for Allocation Limit Check (Per Month)
CREATE OR REPLACE FUNCTION check_allocation_limit() RETURNS TRIGGER AS $$
DECLARE
    month_date DATE;
    month_sum INTEGER;
BEGIN
    -- Validate that start_date and end_date are provided
    IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date are required'
        USING ERRCODE = 'data_exception';
    END IF;

    -- Loop through each month covered by the allocation period
    FOR month_date IN 
        SELECT generate_series(
            DATE_TRUNC('month', NEW.start_date),
            DATE_TRUNC('month', NEW.end_date),
            '1 month'::interval
        )::DATE
    LOOP
        -- Calculate the sum of allocations for this employee in this specific month
        -- excluding the current allocation being inserted/updated
        SELECT COALESCE(SUM(percentage), 0) INTO month_sum
        FROM core.allocations
        WHERE employee_id = NEW.employee_id
          AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          -- Check if the allocation overlaps with the current month
          AND start_date <= (month_date + INTERVAL '1 month - 1 day')::DATE
          AND end_date >= month_date;

        -- Check if adding the new allocation would exceed 100% for this month
        IF (month_sum + NEW.percentage) > 100 THEN
            RAISE EXCEPTION 'Total allocation cannot exceed 100%% for month %',
                TO_CHAR(month_date, 'YYYY-MM')
            USING ERRCODE = 'data_exception';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_allocation_limit
BEFORE INSERT OR UPDATE ON core.allocations
FOR EACH ROW
EXECUTE FUNCTION check_allocation_limit();
