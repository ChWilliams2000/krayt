import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdirSync, writeFileSync } from "fs";
import fetch from "node-fetch";
import { isURLInScope } from "../../shared/scope-validator.js";
import { safeExec } from "../../shared/exec-helper.js";
import { audit } from "../../shared/audit-logger.js";

const server = new McpServer({ name: "evidence", version: "1.0.0" });

function engDir(engagementId, sub) {
  const dir = `./engagements/${engagementId}/${sub}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

server.tool("screenshot_url",
  `Takes a screenshot of a URL using gowitness. Saves to engagement evidence
   directory. Call immediately after finding a vulnerability.`,
  { url: z.string(), engagement_id: z.string(), label: z.string().optional() },
  async ({ url, engagement_id, label = "screenshot" }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const dir = engDir(engagement_id, "screenshots");
    const filename = `${label}-${Date.now()}.png`;
    const r = await safeExec(`gowitness single --url "${url}" --screenshot-path ${dir} --screenshot-filename ${filename} --quiet`, { timeout: 30000 });
    audit.allowed("screenshot_url", url, { saved: `${dir}/${filename}` });
    return { content: [{ type: "text", text: JSON.stringify({ url, saved: `${dir}/${filename}`, ok: r.ok }) }] };
  }
);

server.tool("screenshot_bulk",
  `Screenshots multiple URLs in parallel using gowitness bulk mode.`,
  { urls: z.array(z.string()), engagement_id: z.string(), concurrency: z.number().optional() },
  async ({ urls, engagement_id, concurrency = 3 }) => {
    const scoped = urls.filter(u => isURLInScope(u).allowed);
    const listFile = `/tmp/krayt-gowitness-${Date.now()}.txt`;
    writeFileSync(listFile, scoped.join("\n"));
    const dir = engDir(engagement_id, "screenshots");
    const r = await safeExec(`gowitness file -f ${listFile} --screenshot-path ${dir} --threads ${concurrency} --quiet`, { timeout: 300000 });
    return { content: [{ type: "text", text: JSON.stringify({ count: scoped.length, dir, ok: r.ok }) }] };
  }
);

server.tool("capture_http_exchange",
  `Makes an HTTP request and saves the full raw request/response to a file
   formatted for direct copy-paste into HackerOne reports.`,
  { url: z.string(), method: z.string().optional(), headers: z.record(z.string()).optional(), body: z.string().optional(), engagement_id: z.string(), finding_name: z.string() },
  async ({ url, method = "GET", headers = {}, body, engagement_id, finding_name }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const res = await fetch(url, { method, headers, body });
    const responseBody = await res.text();
    const dir = engDir(engagement_id, "evidence");
    const filePath = `${dir}/${finding_name}-${Date.now()}.txt`;
    const parsed = new URL(url);
    writeFileSync(filePath, `=== REQUEST ===\n${method} ${parsed.pathname}${parsed.search} HTTP/1.1\nHost: ${parsed.hostname}\n${Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join("\n")}\n\n${body||""}\n\n=== RESPONSE ===\nHTTP/1.1 ${res.status} ${res.statusText}\n${[...res.headers.entries()].map(([k,v])=>`${k}: ${v}`).join("\n")}\n\n${responseBody.substring(0,15000)}\n\n=== METADATA ===\nURL: ${url}\nTimestamp: ${new Date().toISOString()}\nEngagement: ${engagement_id}\nFinding: ${finding_name}\n`);
    audit.finding("capture_http_exchange", url, "info", { file: filePath, finding: finding_name });
    return { content: [{ type: "text", text: JSON.stringify({ saved: filePath, status: res.status }) }] };
  }
);

server.tool("save_finding_note",
  `Saves a structured finding note to the engagement directory. Use for findings
   without an HTTP exchange (DNS issues, S3 buckets, OSINT discoveries).`,
  { engagement_id: z.string(), finding_name: z.string(), severity: z.enum(["critical","high","medium","low","info"]), target: z.string(), description: z.string(), reproduction_steps: z.string(), impact: z.string(), evidence: z.string().optional() },
  async ({ engagement_id, finding_name, severity, target, description, reproduction_steps, impact, evidence }) => {
    const dir = engDir(engagement_id, "findings");
    const filePath = `${dir}/${severity}-${finding_name}-${Date.now()}.json`;
    writeFileSync(filePath, JSON.stringify({ finding_name, severity, target, description, reproduction_steps, impact, evidence, timestamp: new Date().toISOString() }, null, 2));
    audit.finding("save_finding_note", target, severity, { file: filePath });
    return { content: [{ type: "text", text: JSON.stringify({ saved: filePath }) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
