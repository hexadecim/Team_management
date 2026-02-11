-- Migration: Add Project Financial Analysis Tables and Fields
-- Date: 2026-02-11
-- Description: Adds planned_budget and average_working_hours to projects table,
--              creates financial calculation tables for independent reporting

-- Step 1: Add new columns to core.projects table
ALTER TABLE core.projects 
ADD COLUMN IF NOT EXISTS planned_budget DECIMAL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS average_working_hours DECIMAL DEFAULT 160;

-- Step 2: Create system configuration table for global defaults
CREATE TABLE IF NOT EXISTS core.system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default working hours configuration
INSERT INTO core.system_config (key, value, description) VALUES
('default_working_hours_monthly', '160', 'Default average working hours per month for financial calculations')
ON CONFLICT (key) DO NOTHING;

-- Step 3: Create project_financials table for aggregated metrics
CREATE TABLE IF NOT EXISTS core.project_financials (
    project_id UUID PRIMARY KEY REFERENCES core.projects(id) ON DELETE CASCADE,
    planned_budget DECIMAL DEFAULT 0,
    total_projected_billing DECIMAL DEFAULT 0,
    total_projected_expense DECIMAL DEFAULT 0,
    total_projected_profit DECIMAL DEFAULT 0,
    budget_variance DECIMAL DEFAULT 0,
    last_calculated_at TIMESTAMP DEFAULT NOW()
);

-- Step 4: Create monthly billing projections table
CREATE TABLE IF NOT EXISTS core.project_billing_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES core.projects(id) ON DELETE CASCADE,
    month_year DATE NOT NULL, -- First day of month
    projected_billing DECIMAL DEFAULT 0,
    cumulative_billing DECIMAL DEFAULT 0,
    UNIQUE(project_id, month_year)
);

-- Step 5: Create monthly expense projections table
CREATE TABLE IF NOT EXISTS core.project_expenses_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES core.projects(id) ON DELETE CASCADE,
    month_year DATE NOT NULL, -- First day of month
    projected_expense DECIMAL DEFAULT 0,
    cumulative_expense DECIMAL DEFAULT 0,
    UNIQUE(project_id, month_year)
);

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_billing_monthly_project ON core.project_billing_monthly(project_id, month_year);
CREATE INDEX IF NOT EXISTS idx_expenses_monthly_project ON core.project_expenses_monthly(project_id, month_year);

-- Step 7: Initialize project_financials for existing projects
INSERT INTO core.project_financials (project_id, planned_budget)
SELECT id, 0 FROM core.projects
ON CONFLICT (project_id) DO NOTHING;

-- Migration complete
-- Note: Financial calculations will need to be triggered via the API
-- after this migration to populate the monthly tables
