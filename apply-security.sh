#!/bin/bash
# Apply Zero Trust Security Schema to Database

echo "Applying Zero Trust security schema..."

# Apply security schema
psql -U sanjayrana -d team_management -f init_security.sql

if [ $? -eq 0 ]; then
    echo "✓ Security schema applied successfully"
else
    echo "✗ Failed to apply security schema"
    exit 1
fi

# Migrate passwords to bcrypt hashes
echo "Migrating passwords to bcrypt hashes..."
psql -U sanjayrana -d team_management -f migrate_passwords.sql

if [ $? -eq 0 ]; then
    echo "✓ Passwords migrated successfully"
else
    echo "✗ Failed to migrate passwords"
    exit 1
fi

echo ""
echo "✓ Zero Trust security schema applied successfully!"
echo ""
echo "Security features enabled:"
echo "  - Audit logging for all operations"
echo "  - Session management"
echo "  - Refresh token support"
echo "  - Failed login tracking"
echo "  - Bcrypt password hashing"
echo ""
