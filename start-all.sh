#!/bin/bash
# Use absolute paths to avoid confusion
BASE_DIR="/Users/sanjayrana/AILearning/Team Management"

echo "Starting Event Bus..."
cd "$BASE_DIR/apps/event-bus" && npm start > event-bus.log 2>&1 &
BUS_PID=$!

sleep 2

echo "Starting Resource Service..."
cd "$BASE_DIR/apps/resource-service" && npm start > resource-service.log 2>&1 &
RESOURCE_PID=$!

echo "Starting Analytics Service..."
cd "$BASE_DIR/apps/analytics-service" && npm start > analytics-service.log 2>&1 &
ANALYTICS_PID=$!

echo "Starting Web Frontend..."
cd "$BASE_DIR/apps/web" && npm run dev > web.log 2>&1 &
WEB_PID=$!

echo "Ecosystem starting..."
echo "PIDs: Bus=$BUS_PID, Res=$RESOURCE_PID, Ana=$ANALYTICS_PID, Web=$WEB_PID"

# Function to kill all processes on exit
cleanup() {
  echo "Stopping all services..."
  kill $BUS_PID $RESOURCE_PID $ANALYTICS_PID $WEB_PID
  exit
}

trap cleanup SIGINT SIGTERM

# Keep script running and tail logs
tail -f "$BASE_DIR/apps/web/web.log"
