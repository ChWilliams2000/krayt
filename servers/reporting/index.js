import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import fetch from "node-fetch";

const server = new McpServer({ name: "reporting", version: "1.0.0" });

async function callGemini(prompt) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || "";
}

server.tool("draft_hackerone_report",
  `Generates a HackerOne-formatted bug report draft from finding data. Produces
   title, severity justification, CVSS score, reproduction steps, impact, and
   remediation. Saves as markdown to the engagement reports directory.`,
  { engagement_id: z.string(), finding: z.object({ type: z.string(), severity: z.enum(["critical","high","medium","low","informational"]), target_url: z.string(), description: z.string(), reproduction_steps: z.string(), impact: z.string(), evidence_files: z.array(z.string()).optional() }) },
  async ({ engagement_id, finding }) => {
    const draft = await callGemini(`You are a professional bug bounty researcher writing a HackerOne vulnerability report.\n\nGenerate a complete professional report for:\nType: ${finding.type}\nSeverity: ${finding.severity}\nTarget: ${finding.target_url}\nDescription: ${finding.description}\nReproduction: ${finding.reproduction_steps}\nImpact: ${finding.impact}\n\nInclude sections: Title, Severity, Description, Steps to Reproduce, Impact, Remediation, CVSS Score. Be precise and professional.`);
    const dir = `./engagements/${engagement_id}/reports`;
    mkdirSync(dir, { recursive: true });
    const filePath = `${dir}/${finding.severity}-${finding.type.toLowerCase().replace(/\s/g,"-")}-${Date.now()}.md`;
    writeFileSync(filePath, draft + (finding.evidence_files?.length ? `\n## Evidence\n${finding.evidence_files.map(f=>`- ${f}`).join("\n")}` : ""));
    return { content: [{ type: "text", text: JSON.stringify({ saved: filePath, preview: draft.substring(0, 500) }) }] };
  }
);

server.tool("generate_engagement_summary",
  `Reads all finding files in an engagement and generates a summary:
   totals by severity, vulnerability types, targets tested, and timeline.`,
  { engagement_id: z.string() },
  async ({ engagement_id }) => {
    const dir = `./engagements/${engagement_id}/findings`;
    if (!existsSync(dir)) return { content: [{ type: "text", text: "No findings directory found" }] };
    const findings = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => { try { return JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); } catch { return null; } }).filter(Boolean);
    const summary = { engagement_id, total: findings.length, by_severity: findings.reduce((a,f) => { a[f.severity]=(a[f.severity]||0)+1; return a; }, {}), by_type: findings.reduce((a,f) => { a[f.finding_name]=(a[f.finding_name]||0)+1; return a; }, {}), targets: [...new Set(findings.map(f=>f.target))], date_range: { first: findings.map(f=>f.timestamp).sort()[0], last: findings.map(f=>f.timestamp).sort().reverse()[0] } };
    writeFileSync(`./engagements/${engagement_id}/summary.json`, JSON.stringify(summary, null, 2));
    return { content: [{ type: "text", text: JSON.stringify(summary) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
