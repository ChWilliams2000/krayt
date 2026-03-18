import { appendFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const LOG_DIR = process.env.AUDIT_LOG_DIR || resolve(process.cwd(), "audit-logs");
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
const LOG_FILE = resolve(LOG_DIR, `engagement-${new Date().toISOString().split("T")[0]}.jsonl`);

function auditLog(entry) {
  appendFileSync(LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n");
}

export const audit = {
  allowed:  (tool, target, detail = {}) => auditLog({ event: "TOOL_ALLOWED", tool, target, ...detail }),
  blocked:  (tool, target, reason, detail = {}) => auditLog({ event: "TOOL_BLOCKED", tool, target, reason, ...detail }),
  error:    (tool, target, error) => auditLog({ event: "TOOL_ERROR", tool, target, error }),
  finding:  (tool, target, severity, detail) => auditLog({ event: "FINDING", tool, target, severity, ...detail }),
};
