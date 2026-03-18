import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync } from "fs";

const execRaw = promisify(exec);

export async function safeExec(cmd, opts = {}) {
  const timeout = opts.timeout || 120000;
  try {
    const { stdout, stderr } = await execRaw(cmd, { timeout, ...opts });
    return { ok: true, stdout: stdout.trim(), stderr: stderr?.trim() };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.trim() || "",
      stderr: err.stderr?.trim() || "",
      error: err.message,
    };
  }
}

export function parseJsonLines(output) {
  return output
    .split("\n")
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return { raw: line }; } });
}

export function writeTempFile(content, suffix = ".txt") {
  const path = `/tmp/krayt-${Date.now()}${suffix}`;
  writeFileSync(path, content);
  return path;
}
