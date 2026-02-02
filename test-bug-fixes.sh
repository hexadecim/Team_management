#!/bin/bash

echo "=== Testing Bug Fixes ==="
echo ""

# Wait for rate limit to clear
echo "Waiting 30 seconds for rate limit to clear..."
sleep 30

# Test 1: Login and get token
echo "Test 1: Admin Login"
TOKEN=$(curl -s -X POST http://localhost:4001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r '.accessToken')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "✅ Login successful"
else
  echo "❌ Login failed"
  exit 1
fi

echo ""

# Test 2: Create Project (Bug Fix #2)
echo "Test 2: Create Project (Testing Bug Fix #2 - Schema Mismatch)"
RESPONSE=$(curl -s -X POST http://localhost:4001/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Project Alpha"}')

echo "Response: $RESPONSE"

PROJECT_ID=$(echo $RESPONSE | jq -r '.id')
if [ "$PROJECT_ID" != "null" ] && [ -n "$PROJECT_ID" ]; then
  echo "✅ Project created successfully! ID: $PROJECT_ID"
else
  echo "❌ Project creation failed"
  echo "$RESPONSE" | jq '.'
fi

echo ""

# Test 3: List Projects
echo "Test 3: List Projects"
PROJECTS=$(curl -s -X GET http://localhost:4001/projects \
  -H "Authorization: Bearer $TOKEN")

echo "Projects: $PROJECTS" | jq '.'

echo ""
echo "=== Bug Fix Verification Complete ==="
