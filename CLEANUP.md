# Production Cleanup Guide

## Overview
This guide documents the cleanup process to prepare the Team Management application for production deployment by removing test data and development files.

## Database Cleanup

### What Gets Removed
- All test employees
- All test projects  
- All test allocations
- All users except the system admin
- Failed login attempts
- (Optional) Audit logs

### What Gets Kept
- System admin user (username: `admin`)
- Database schema and structure
- All roles and permissions

### How to Execute

```bash
# Run the cleanup script
psql -U sanjayrana -d team_management -f psscripts/cleanup-database.sql
```

Or manually execute the SQL commands:

```sql
-- Delete all allocations
TRUNCATE TABLE core.allocations CASCADE;

-- Delete all projects
DELETE FROM core.projects;

-- Delete all employees
DELETE FROM core.employees;

-- Delete all users except admin
DELETE FROM iam.users WHERE username != 'admin';

-- Clear failed login attempts
TRUNCATE TABLE iam.failed_login_attempts;
```

### Verification

After running the cleanup, verify:

```sql
-- Check remaining data
SELECT 'Users' as table_name, COUNT(*) as count FROM iam.users
UNION ALL
SELECT 'Employees', COUNT(*) FROM core.employees
UNION ALL
SELECT 'Projects', COUNT(*) FROM core.projects
UNION ALL
SELECT 'Allocations', COUNT(*) FROM core.allocations;

-- Verify admin user
SELECT username, roles FROM iam.users WHERE username = 'admin';
```

Expected results:
- Users: 1 (admin only)
- Employees: 0
- Projects: 0
- Allocations: 0

---

## File Cleanup

### Files Removed

#### Log Files
- `all-services.log`
- `apps/analytics-service/analytics-service.log`
- `apps/event-bus/event-bus.log`
- `apps/resource-service/resource-service.log`
- `apps/web/vite.log`
- `apps/web/web.log`

#### Test Files
- `test_employees_special_chars.csv`
- `test_financial_upload.csv`
- `test_financial_valid.csv`
- `test_personas.js`
- `test_success.json`

#### Test Scripts
- `verify_bulk_upload.sh`
- `verify_financial_upload.sh`
- `verify_project_lifecycle.js`
- `verify_special_chars.sh`
- `test-bug-fixes.sh`
- `reproduce_upload_error.js`

#### Migration Scripts (one-time use)
- `add_project_to_users.sql`
- `migrate_allocation_validation.sql`
- `migrate_employee_email.sql`
- `migrate_financial_fields.sql`
- `migrate_passwords.sql`
- `migrate_project_dates.sql`

#### Development Scripts
- `apply-security.sh`
- `authenticate`
- `bulk_upload_results.txt`

### Files Kept

#### Essential Configuration
- `.env` (production values)
- `.env.example` (template)
- `docker-compose.yml`
- `package.json` files

#### Documentation
- `README.md`
- `DOCKER.md`
- `SECURITY.md`
- `DESIGN.md`
- `DEPLOYMENT.md`

#### Database Initialization
- `init.sql` (schema creation)
- `init_security.sql` (security setup)

#### Utility Scripts
- `scripts/unlock-accounts.sql`
- `scripts/cleanup-database.sql` (this cleanup script)
- `start-all.sh` (for starting services)

---

## Updated .gitignore

The `.gitignore` file has been updated to prevent test and development files from being committed:

```gitignore
# Test files
test_*.csv
test_*.js
test_*.json
verify_*.sh
reproduce_*.js
bulk_upload_results.txt

# Log files
*.log
*.log.*
```

---

## Post-Cleanup Checklist

After running the cleanup:

- [ ] Verify admin user can log in
- [ ] Test basic application functionality
- [ ] Verify no broken file references
- [ ] Update environment variables for production
- [ ] Change admin password
- [ ] Update JWT_SECRET in .env
- [ ] Review and update database connection settings
- [ ] Test Docker build and deployment
- [ ] Backup clean database state

---

## Production Deployment Notes

### Security Checklist
1. **Change default admin password** immediately after deployment
2. **Update JWT_SECRET** to a strong, random value
3. **Update database password** to a strong value
4. **Enable HTTPS** with proper SSL/TLS certificates
5. **Configure firewall** to restrict database access
6. **Review audit log settings** in production

### Environment Variables
Ensure these are set correctly in production `.env`:

```bash
# Database
DB_USER=<production-db-user>
DB_PASSWORD=<strong-password>
DB_NAME=team_management

# JWT
JWT_SECRET=<strong-random-secret>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Session
SESSION_TIMEOUT_MINUTES=30
```

### First Production Login

Default credentials (CHANGE IMMEDIATELY):
- Username: `admin`
- Password: `admin123`

After first login:
1. Go to Administration → User Management
2. Click on admin user
3. Change password to a strong password
4. Update roles/permissions as needed

---

## Rollback

If you need to restore test data:

1. Restore from a backup taken before cleanup:
   ```bash
   psql -U sanjayrana -d team_management < backup_before_cleanup.sql
   ```

2. Or manually re-create test data through the application UI

---

## Summary

✅ **Database Cleaned:**
- Removed all test users (kept admin only)
- Removed all test employees
- Removed all test projects
- Removed all test allocations
- Cleared failed login attempts

✅ **Files Removed:**
- Log files (6 files)
- Test CSV files (3 files)
- Test scripts (6 files)
- Migration scripts (6 files)
- Development artifacts (3 files)

✅ **Configuration Updated:**
- Updated `.gitignore` to exclude test/dev files
- Created cleanup documentation

**Total files removed:** ~24 files

The application is now ready for production deployment with a clean database containing only the system admin user.
