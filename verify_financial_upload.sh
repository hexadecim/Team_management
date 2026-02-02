#!/bin/bash
# verify_financial_upload.sh
# Verifies bulk upload with financial fields and project validation

echo "=== Testing Bulk Upload with Financial Fields and Project Validation ==="

# 1. Attempt upload with test_financial_upload.csv
# This should partially fail/return errors because of the 'Non Existent Project' row
echo "1. Uploading test_financial_upload.csv..."
RESPONSE=$(curl -s -X POST http://localhost:4001/employees/upload \
  -H "Authorization: Bearer $1" \
  -F "file=@test_financial_upload.csv")

echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "Project \"Non Existent Project\" does not exist"; then
    echo "✅ Project validation working: Successfully caught invalid project name."
else
    echo "❌ Project validation FAILED: Did not catch invalid project name."
fi

# 2. Fix CSV and upload valid data
echo "2. Fixing CSV and uploading valid data..."
cat > test_financial_valid.csv <<EOF
First Name,Last Name,Email,Skill,Project,Billable Rate,Expense Rate
Financial,Valid1,valid1@test.com,DevOps,Q2 2026 Initiative,180.00,90.00
Financial,Valid2,valid2@test.com,Testing,Q4 2025 Planning,120,60
EOF

RESPONSE=$(curl -s -X POST http://localhost:4001/employees/upload \
  -H "Authorization: Bearer $1" \
  -F "file=@test_financial_valid.csv")

echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "Successfully uploaded 2 employees"; then
    echo "✅ Valid upload working."
else
    echo "❌ Valid upload FAILED."
fi

# 3. Verify data in database
echo "3. Verifying data in database..."
PGPASSWORD=passadmin123 psql -h localhost -U sanjayrana -d team_management -c "SELECT first_name, last_name, email, current_project, billable_rate, expense_rate FROM core.employees WHERE first_name = 'Financial'"

echo "=== Verification Complete ==="
