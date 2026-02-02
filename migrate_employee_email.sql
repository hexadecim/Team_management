-- Migration: Add email column to core.employees
ALTER TABLE core.employees ADD COLUMN IF NOT EXISTS email VARCHAR(100);
