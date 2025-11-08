#!/bin/bash

# WCAGAI v3.0 Stress Test Runner
# This script runs comprehensive stress tests across different configurations

set -e

echo "🚀 WCAGAI v3.0 Stress Test Runner"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
DURATION=${1:-300}  # Default 5 minutes
CONCURRENCY=${2:-5} # Default 5 concurrent scans
VERTICAL=${3:-all}  # Default all verticals

echo "Configuration:"
echo "  Duration: ${DURATION}s ($((DURATION / 60)) minutes)"
echo "  Concurrency: ${CONCURRENCY}"
echo "  Vertical: ${VERTICAL}"
echo ""

# Check if backend is running
echo "Checking backend health..."
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}✓${NC} Backend is healthy"
else
    echo -e "${RED}✗${NC} Backend is not running. Please start the backend first:"
    echo "  cd backend && npm start"
    exit 1
fi

echo ""
echo "Starting stress test..."
echo "Press Ctrl+C to stop the test early"
echo ""

# Run the stress test
cd "$(dirname "$0")"
node stress-test-config.js --duration=$DURATION --concurrency=$CONCURRENCY --vertical=$VERTICAL

# Capture exit code
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Stress test completed successfully"
else
    echo -e "${RED}✗${NC} Stress test failed"
fi

exit $EXIT_CODE
