-- Quick script to unlock all user accounts
-- Run this in psql or any PostgreSQL client

-- Clear all failed login attempts
TRUNCATE TABLE iam.failed_login_attempts;

-- Verify the table is empty
SELECT COUNT(*) as remaining_lockouts FROM iam.failed_login_attempts;

-- You should see: remaining_lockouts = 0
