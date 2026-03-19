#!/usr/bin/env node
import { readFileSync } from "fs";
const path = process.argv[2];
if (!path) { console.error("Usage: node validate-scope.js <scope.json>"); process.exit(1); }
try {
  const scope = JSON.parse(readFileSync(path, "utf8"));
  const errors = [];
  if (!scope.engagement) errors.push("Missing: engagement name");
  if (!scope.program_url) errors.push("Missing: program_url");
  if (!scope.in_scope?.domains?.length) errors.push("Missing: in_scope.domains");
  if (!scope.max_requests_per_second) errors.push("Missing: max_requests_per_second");
  if (!scope.allowed_test_types?.length) errors.push("Missing: allowed_test_types");
  if (errors.length) { errors.forEach(e => console.error(`  ✗ ${e}`)); process.exit(1); }
  console.log("✓ Scope valid");
  console.log(`  Engagement: ${scope.engagement}`);
  console.log(`  Domains: ${scope.in_scope.domains.join(", ")}`);
  console.log(`  Rate limit: ${scope.max_requests_per_second} req/s`);
  if (scope.out_of_scope?.domains?.length) console.log(`  Excluded: ${scope.out_of_scope.domains.join(", ")}`);
} catch (e) { console.error(`Failed to parse: ${e.message}`); process.exit(1); }
