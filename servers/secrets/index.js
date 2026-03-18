import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync, readFileSync, existsSync } from "fs";
import fetch from "node-fetch";
import { isURLInScope } from "../../shared/scope-validator.js";
import { safeExec, parseJsonLines } from "../../shared/exec-helper.js";
import { audit } from "../../shared/audit-logger.js";

const server = new McpServer({ name: "secrets", version: "1.0.0" });

server.tool("scan_repo_secrets",
  `Scans a git repository for secrets in code and full commit history using
   trufflehog. Detects AWS keys, GitHub tokens, private keys, and hundreds
   of other secret types. Runs directly against the remote URL.`,
  { repo_url: z.string(), since_commit: z.string().optional() },
  async ({ repo_url, since_commit }) => {
    const r = await safeExec(`trufflehog git ${repo_url} ${since_commit ? `--since-commit ${since_commit}` : ""} --json --no-verification 2>/dev/null`, { timeout: 300000 });
    const findings = parseJsonLines(r.stdout);
    findings.forEach(f => audit.finding("scan_repo_secrets", repo_url, "high", { detector: f.DetectorName }));
    return { content: [{ type: "text", text: JSON.stringify({ repo_url, findings, count: findings.length }) }] };
  }
);

server.tool("scan_local_path",
  `Scans a local directory for secrets using gitleaks. Use on downloaded
   JS bundles or cloned repos.`,
  { path: z.string(), report_path: z.string().optional() },
  async ({ path, report_path }) => {
    const reportFile = report_path || `/tmp/krayt-gitleaks-${Date.now()}.json`;
    await safeExec(`gitleaks detect --source ${path} --report-path ${reportFile} --report-format json --no-git 2>&1`, { timeout: 120000 });
    const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, "utf8")) : [];
    return { content: [{ type: "text", text: JSON.stringify({ path, findings: report, count: report.length }) }] };
  }
);

server.tool("extract_js_endpoints",
  `Downloads and analyzes JavaScript files for API endpoints and secrets using
   jsluice. Understands JS AST — finds non-obvious string assignments.`,
  { js_urls: z.array(z.string()) },
  async ({ js_urls }) => {
    const results = [];
    for (const url of js_urls.filter(u => isURLInScope(u).allowed)) {
      const tmpFile = `/tmp/krayt-js-${Date.now()}.js`;
      await safeExec(`curl -sL "${url}" -o ${tmpFile}`, { timeout: 15000 });
      const r = await safeExec(`jsluice urls ${tmpFile} && jsluice secrets ${tmpFile}`, { timeout: 30000 });
      results.push({ url, findings: r.stdout.trim().split("\n").filter(Boolean) });
    }
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

server.tool("extract_js_links",
  `Extracts endpoints from JavaScript files using LinkFinder and subjs.
   Finds internal API endpoints, admin routes, and dev/staging URLs.`,
  { url: z.string(), crawl: z.boolean().optional() },
  async ({ url, crawl = true }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    let jsFiles = [url];
    if (crawl) { const r = await safeExec(`subjs -i ${url}`, { timeout: 30000 }); jsFiles = [...jsFiles, ...r.stdout.split("\n").filter(Boolean)]; }
    const allEndpoints = [];
    for (const jsFile of jsFiles.slice(0, 20)) {
      const r = await safeExec(`python3 /opt/tools/LinkFinder/linkfinder.py -i ${jsFile} -o cli 2>/dev/null`, { timeout: 30000 });
      allEndpoints.push(...r.stdout.split("\n").filter(Boolean));
    }
    return { content: [{ type: "text", text: JSON.stringify({ js_files: jsFiles, endpoints: [...new Set(allEndpoints)] }) }] };
  }
);

server.tool("github_dorking",
  `Searches GitHub for sensitive files related to a target org or domain.
   Common dork patterns: .env files, config files, API keys, internal hostnames.`,
  { org: z.string().optional(), domain: z.string().optional(), custom_query: z.string().optional() },
  async ({ org, domain, custom_query }) => {
    const dorks = custom_query ? [custom_query] : [
      org ? `org:${org} filename:.env` : `"${domain}" filename:.env`,
      org ? `org:${org} "api_key"` : `"${domain}" "api_key"`,
      org ? `org:${org} "secret_key"` : `"${domain}" "secret_key"`,
      org ? `org:${org} "aws_access_key_id"` : `"${domain}" "aws_access_key_id"`,
      org ? `org:${org} filename:config.json "password"` : `"${domain}" filename:config.json`,
    ];
    const results = [];
    for (const dork of dorks) {
      const res = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(dork)}&per_page=5`, { headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" } });
      const data = await res.json();
      results.push({ dork, total: data.total_count, items: (data.items || []).map(i => ({ repo: i.repository?.full_name, file: i.path, url: i.html_url })) });
      await new Promise(r => setTimeout(r, 2000));
    }
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

server.tool("pattern_grep",
  `Runs gf pattern matching against a URL file to find params commonly
   vulnerable to specific vuln classes: xss, sqli, ssrf, redirect, rce, lfi, ssti, idor.`,
  { input: z.string(), pattern: z.enum(["xss", "sqli", "ssrf", "redirect", "rce", "lfi", "ssti", "idor", "debug"]) },
  async ({ input, pattern }) => {
    const r = await safeExec(`cat ${input} | gf ${pattern}`, { timeout: 30000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
