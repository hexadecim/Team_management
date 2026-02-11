-- Production Database Cleanup Script
-- This script removes all test data and keeps only the system admin user

-- Step 1: Delete all allocations
TRUNCATE TABLE core.allocations CASCADE;

-- Step 2: Delete all projects
DELETE FROM core.projects;

-- Step 3: Delete all employees
DELETE FROM core.employees;

-- Step 4: Delete all users except admin
DELETE FROM iam.users WHERE username != 'admin';

-- Step 5: Clear failed login attempts
TRUNCATE TABLE iam.failed_login_attempts;

-- Step 6: Clear audit logs (optional - comment out if you want to keep audit history)
-- TRUNCATE TABLE iam.audit_log;

-- Verify cleanup
SELECT 'Users remaining:' as info, COUNT(*) as count FROM iam.users;
SELECT 'Employees remaining:' as info, COUNT(*) as count FROM core.employees;
SELECT 'Projects remaining:' as info, COUNT(*) as count FROM core.projects;
SELECT 'Allocations remaining:' as info, COUNT(*) as count FROM core.allocations;

-- Display admin user details
SELECT username, role_names FROM iam.users WHERE username = 'admin';
