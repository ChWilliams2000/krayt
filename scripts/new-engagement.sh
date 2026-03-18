#!/bin/bash
PROGRAM="${1:?Usage: $0 PROGRAM_NAME}"
DIR="./engagements/${PROGRAM}"
mkdir -p "${DIR}"/{screenshots,evidence,findings,reports}
cp scope/scope.example.json "${DIR}/scope.json"
# Update current symlink
rm -f ./engagements/current/scope.json
cp "${DIR}/scope.json" ./engagements/current/scope.json
echo "Engagement created: ${DIR}"
echo "Next: fill in ${DIR}/scope.json then run:"
echo "  node scripts/validate-scope.js ${DIR}/scope.json"
