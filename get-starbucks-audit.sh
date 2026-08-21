#!/usr/bin/env bash
# Fetch and format the Starbucks analysis result for audit
curl -sS "http://localhost:3002/api/business?id=cmsudr6q101ckvdasr8hljx5f" | jq . > /tmp/starbucks-analysis.json 2>&1
echo "Result saved to /tmp/starbucks-analysis.json"
cat /tmp/starbucks-analysis.json | jq '.scores[0], .diagnoses[0], .strategies[0]' | head -100
