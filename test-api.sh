#!/bin/bash

# Test script for Solana Transaction Analyzer API

echo "Testing Solana Transaction Analyzer API"
echo "========================================"
echo ""

# Sample transaction hashes (replace with real ones from your Excel file)
TX_HASHES='["5kP5g3h8M2vx1Y7KmZqN4R3pL9wX2tQ6uV8jC1nE4oD7fS9rT0mA3bH6iW5eY4xZ2"]'

echo "1. Testing API endpoint with sample transaction..."
echo ""

# Make the API call
curl -X POST http://localhost:3001/api/process \
  -H "Content-Type: application/json" \
  -d "{\"txHashes\": $TX_HASHES}" \
  --no-buffer

echo ""
echo ""
echo "Test complete!"
