#!/usr/bin/env bash
set -e

echo "========================================"
echo "  Backend tests"
echo "========================================"
cd Backend
source .venv/bin/activate
python -m pytest tests/ -v
echo ""

echo "========================================"
echo "  Frontend tests"
echo "========================================"
cd ../frontend
npm run test
echo ""

echo "All tests passed."
