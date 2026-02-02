-- Migration to add financial fields to core.employees
ALTER TABLE core.employees 
ADD COLUMN billable_rate NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN expense_rate NUMERIC(15, 2) DEFAULT 0;
