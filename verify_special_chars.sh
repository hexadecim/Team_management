#!/bin/bash
API_BASE="http://localhost:4001"
# Login to get token
TOKEN=$(curl -s -X POST $API_BASE/auth/login -H "Content-Type: application/json" -d '{"username":"admin", "password":"admin"}' | grep -oE '"accessToken":"[^"]+"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token"
  exit 1
fi

echo "--- Testing Bulk Upload with Special Characters & Emails ---"
RESPONSE=$(curl -s -X POST $API_BASE/employees/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/Users/sanjayrana/AILearning/Team_management/test_employees_special_chars.csv")

echo "$RESPONSE" | python3 -m json.tool

# Verify results by fetching employees
echo -e "\n--- Verifying Created Employees ---"
curl -s -X GET $API_BASE/employees \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -E "firstName|lastName|email" | head -n 30
