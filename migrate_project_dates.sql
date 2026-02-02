-- Migration: Add project dates and change tracking
-- This migration adds start_date, end_date, and original_end_date to projects
-- and creates a history table to track all date changes for analytics

-- Step 1: Add date columns to core.projects
ALTER TABLE core.projects 
ADD COLUMN start_date DATE,
ADD COLUMN end_date DATE,
ADD COLUMN original_end_date DATE;

-- Step 2: Add constraint to ensure end_date >= start_date
ALTER TABLE core.projects
ADD CONSTRAINT chk_project_dates CHECK (end_date >= start_date);

-- Step 3: Create project_date_history table for tracking changes
CREATE TABLE core.project_date_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES core.projects(id) ON DELETE CASCADE,
    field_changed VARCHAR(20) NOT NULL CHECK (field_changed IN ('start_date', 'end_date')),
    old_value DATE,
    new_value DATE NOT NULL,
    changed_by VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT
);

-- Step 4: Create index for faster queries
CREATE INDEX idx_project_date_history_project_id ON core.project_date_history(project_id);
CREATE INDEX idx_project_date_history_changed_at ON core.project_date_history(changed_at DESC);

-- Step 5: Create trigger function to log date changes
CREATE OR REPLACE FUNCTION log_project_date_change() RETURNS TRIGGER AS $$
BEGIN
    -- Log start_date changes
    IF (TG_OP = 'UPDATE' AND OLD.start_date IS DISTINCT FROM NEW.start_date) THEN
        INSERT INTO core.project_date_history (
            project_id, field_changed, old_value, new_value, changed_by, reason
        ) VALUES (
            NEW.id, 'start_date', OLD.start_date, NEW.start_date, 
            COALESCE(current_setting('app.current_user', true), 'system'),
            COALESCE(current_setting('app.change_reason', true), NULL)
        );
    END IF;

    -- Log end_date changes
    IF (TG_OP = 'UPDATE' AND OLD.end_date IS DISTINCT FROM NEW.end_date) THEN
        INSERT INTO core.project_date_history (
            project_id, field_changed, old_value, new_value, changed_by, reason
        ) VALUES (
            NEW.id, 'end_date', OLD.end_date, NEW.end_date,
            COALESCE(current_setting('app.current_user', true), 'system'),
            COALESCE(current_setting('app.change_reason', true), NULL)
        );
    END IF;

    -- Set original_end_date on first insert if not already set
    IF (TG_OP = 'INSERT' AND NEW.original_end_date IS NULL AND NEW.end_date IS NOT NULL) THEN
        NEW.original_end_date := NEW.end_date;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger on projects table
CREATE TRIGGER trg_log_project_date_change
BEFORE INSERT OR UPDATE ON core.projects
FOR EACH ROW
EXECUTE FUNCTION log_project_date_change();

-- Step 7: Create view for deviation analytics
CREATE OR REPLACE VIEW core.project_deviation_analytics AS
SELECT 
    p.id,
    p.name,
    p.start_date,
    p.end_date,
    p.original_end_date,
    CASE 
        WHEN p.end_date IS NOT NULL AND p.original_end_date IS NOT NULL 
        THEN p.end_date - p.original_end_date
        ELSE 0
    END as days_delayed,
    (SELECT COUNT(*) FROM core.project_date_history h WHERE h.project_id = p.id) as change_count,
    CASE
        WHEN p.end_date < CURRENT_DATE THEN 'overdue'
        WHEN p.end_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'at_risk'
        ELSE 'on_track'
    END as status
FROM core.projects p
WHERE p.start_date IS NOT NULL AND p.end_date IS NOT NULL;

-- Step 8: Update existing projects to have NULL dates (they can be filled in later)
-- No action needed - new columns default to NULL

COMMENT ON TABLE core.project_date_history IS 'Tracks all changes to project start_date and end_date for analytics and audit purposes';
COMMENT ON VIEW core.project_deviation_analytics IS 'Provides deviation metrics for project timeline analysis';
