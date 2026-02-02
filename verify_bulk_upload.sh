#!/bin/bash
API_BASE="http://localhost:4001"
TOKEN=$(curl -s -X POST $API_BASE/auth/login -H "Content-Type: application/json" -d '{"username":"admin", "password":"admin"}' | grep -oE '"accessToken":"[^"]+"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token"
  exit 1
fi

echo "--- Test 1: Missing Fields ---"
curl -s -X POST $API_BASE/employees/upload -H "Authorization: Bearer $TOKEN" -F "file=@/Users/sanjayrana/AILearning/Team_management/test_employees_invalid_fields.csv" | python3 -m json.tool

echo -e "\n--- Test 2: Duplicates ---"
curl -s -X POST $API_BASE/employees/upload -H "Authorization: Bearer $TOKEN" -F "file=@/Users/sanjayrana/AILearning/Team_management/test_employees_duplicates.csv" | python3 -m json.tool

echo -e "\n--- Test 3: Junk Data ---"
curl -s -X POST $API_BASE/employees/upload -H "Authorization: Bearer $TOKEN" -F "file=@/Users/sanjayrana/AILearning/Team_management/test_employees_junk.csv" | python3 -m json.tool

echo -e "\n--- Test 4: Valid Data ---"
curl -s -X POST $API_BASE/employees/upload -H "Authorization: Bearer $TOKEN" -F "file=@/Users/sanjayrana/AILearning/Team_management/test_employees_valid.csv" | python3 -m json.tool
