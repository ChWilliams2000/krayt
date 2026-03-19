#!/usr/bin/env node
import { readFileSync } from "fs";

const path   = process.argv[2];
const filter = process.argv[3];

if (!path) {
  console.error("Usage: node review-audit.js <logfile.jsonl> [event_filter]");
  console.error("");
  console.error("Event filters:");
  console.error("  FINDING              — all findings (all servers)");
  console.error("  TOOL_BLOCKED         — scope enforcement blocks");
  console.error("  TOOL_ALLOWED         — allowed tool calls");
  console.error("  TOOL_ERROR           — tool execution errors");
  console.error("  INJECTION            — all llmrecon events (shorthand)");
  console.error("  FINGERPRINT          — LLM surface fingerprint results");
  console.error("  CONTEXT_EXTRACT      — context extraction results");
  console.error("  PAYLOADS_GENERATED   — payload generation events");
  console.error("  INJECTION_EXECUTED   — individual payload executions");
  process.exit(1);
}

const entries = readFileSync(path, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(l => JSON.parse(l));

// INJECTION is a meta-filter grouping all llmrecon event types
const INJECTION_EVENTS = new Set([
  "FINGERPRINT", "CONTEXT_EXTRACT", "PAYLOADS_GENERATED",
  "INJECTION_EXECUTED", "FINDING",
]);

const filtered = !filter
  ? entries
  : filter === "INJECTION"
    ? entries.filter(e => INJECTION_EVENTS.has(e.event) && (
        e.tool === "llmrecon" ||
        ["fingerprint_llm_surface", "extract_llm_context", "generate_payloads",
         "execute_injection", "judge_injection_result", "run_injection_campaign",
         "capture_injection_evidence"].includes(e.tool)
      ))
    : entries.filter(e => e.event === filter);

const colors = {
  FINDING:            "\x1b[31m",
  TOOL_BLOCKED:       "\x1b[33m",
  TOOL_ALLOWED:       "\x1b[32m",
  TOOL_ERROR:         "\x1b[35m",
  FINGERPRINT:        "\x1b[36m",
  CONTEXT_EXTRACT:    "\x1b[36m",
  PAYLOADS_GENERATED: "\x1b[36m",
  INJECTION_EXECUTED: "\x1b[34m",
};

filtered.forEach(e => {
  console.log(`${colors[e.event] || "\x1b[0m"}[${e.timestamp}] ${e.event}\x1b[0m`);
  console.log(`  tool: ${e.tool}  target: ${e.target}`);
  if (e.reason)   console.log(`  reason: ${e.reason}`);
  if (e.severity) console.log(`  severity: ${e.severity}`);
  // llmrecon-specific fields
  if (e.score   !== undefined) console.log(`  score: ${e.score}  is_llm: ${e.is_llm}`);
  if (e.verdict)               console.log(`  verdict: ${e.verdict}`);
  if (e.payload_preview)       console.log(`  payload: ${e.payload_preview}`);
  console.log();
});

// ── Summary ──────────────────────────────────────────────────────────────────
const findings    = entries.filter(e => e.event === "FINDING");
const blocked     = entries.filter(e => e.event === "TOOL_BLOCKED");
const injections  = entries.filter(e => e.event === "INJECTION_EXECUTED");
const fingerprints = entries.filter(e => e.event === "FINGERPRINT");
const llmFindings = findings.filter(e =>
  ["fingerprint_llm_surface", "judge_injection_result",
   "run_injection_campaign", "capture_injection_evidence"].includes(e.tool)
);

console.log("─".repeat(50));
console.log(`Total: ${entries.length} | Findings: ${findings.length} | Blocked: ${blocked.length}`);

if (injections.length || fingerprints.length) {
  const confirmed = fingerprints.filter(e => e.is_llm).length;
  console.log(`LLM surfaces fingerprinted: ${fingerprints.length} (${confirmed} confirmed)`);
  console.log(`Payloads executed: ${injections.length} | Injection findings: ${llmFindings.length}`);
}

if (findings.length) {
  console.log("By severity:", findings.reduce((a, f) => {
    a[f.severity] = (a[f.severity] || 0) + 1;
    return a;
  }, {}));
}
