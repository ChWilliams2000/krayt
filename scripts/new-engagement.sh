#!/bin/bash
# =============================================================================
# krayt — create a new engagement directory and set as current
# Usage: bash scripts/new-engagement.sh PROGRAM_NAME
# =============================================================================
PROGRAM="${1:?Usage: $0 PROGRAM_NAME}"
DIR="./engagements/${PROGRAM}"

# Create engagement directory structure
mkdir -p "${DIR}"/{screenshots,evidence,findings,reports}

# Copy scope template
cp scope/scope.example.json "${DIR}/scope.json"

# Update current — all MCP servers read from engagements/current/scope.json
mkdir -p ./engagements/current
cp "${DIR}/scope.json" ./engagements/current/scope.json

echo ""
echo "Engagement created: ${DIR}"
echo "Current scope set:  engagements/current/scope.json → ${DIR}/scope.json"
echo ""
echo "Next steps:"
echo "  1. Fill in engagements/${PROGRAM}/scope.json with program details"
echo "  2. node scripts/validate-scope.js engagements/${PROGRAM}/scope.json"
echo "  3. cp engagements/${PROGRAM}/scope.json engagements/current/scope.json"
echo "  4. gemini --model gemini-2.0-flash"