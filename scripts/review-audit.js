#!/usr/bin/env node
import { readFileSync } from "fs";
const path = process.argv[2];
const filter = process.argv[3];
if (!path) { console.error("Usage: node review-audit.js <logfile.jsonl> [event_filter]"); process.exit(1); }
const entries = readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
const filtered = filter ? entries.filter(e => e.event === filter) : entries;
const colors = { FINDING: "\x1b[31m", TOOL_BLOCKED: "\x1b[33m", TOOL_ALLOWED: "\x1b[32m", TOOL_ERROR: "\x1b[35m" };
filtered.forEach(e => {
  console.log(`${colors[e.event]||"\x1b[0m"}[${e.timestamp}] ${e.event}\x1b[0m`);
  console.log(`  tool: ${e.tool}  target: ${e.target}`);
  if (e.reason) console.log(`  reason: ${e.reason}`);
  if (e.severity) console.log(`  severity: ${e.severity}`);
  console.log();
});
const findings = entries.filter(e => e.event === "FINDING");
const blocked = entries.filter(e => e.event === "TOOL_BLOCKED");
console.log("─".repeat(50));
console.log(`Total: ${entries.length} | Findings: ${findings.length} | Blocked: ${blocked.length}`);
if (findings.length) console.log("By severity:", findings.reduce((a,f) => { a[f.severity]=(a[f.severity]||0)+1; return a; }, {}));
