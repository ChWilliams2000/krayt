import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync } from "fs";
import { isURLInScope, loadScope } from "../../shared/scope-validator.js";
import { RateLimiter } from "../../shared/rate-limiter.js";
import { safeExec, parseJsonLines } from "../../shared/exec-helper.js";
import { audit } from "../../shared/audit-logger.js";

const scope = loadScope();
const limiter = new RateLimiter(scope.max_requests_per_second || 5);
const server = new McpServer({ name: "webapp", version: "1.0.0" });

server.tool("crawl_katana",
  `Crawls a web application using katana. Parses HTML, JS, forms, and API
   endpoints. Use before fuzzing to build a complete URL inventory.`,
  { url: z.string(), depth: z.number().optional(), headless: z.boolean().optional(), concurrency: z.number().optional() },
  async ({ url, depth = 3, headless = false, concurrency = 10 }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`katana -u ${url} -d ${depth} -c ${concurrency} ${headless ? "-headless" : ""} -silent -jc -kf all -json`, { timeout: 300000 });
    return { content: [{ type: "text", text: JSON.stringify({ base: url, endpoints: parseJsonLines(r.stdout), count: parseJsonLines(r.stdout).length }) }] };
  }
);

server.tool("crawl_gospider",
  `Crawls using gospider. Different coverage to katana — also extracts emails,
   S3 buckets, and Cloudfront URLs. Run both and merge results.`,
  { url: z.string(), depth: z.number().optional(), concurrent: z.number().optional() },
  async ({ url, depth = 3, concurrent = 5 }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`gospider -s ${url} -d ${depth} -c ${concurrent} --json --quiet`, { timeout: 180000 });
    return { content: [{ type: "text", text: r.stdout.substring(0, 50000) }] };
  }
);

server.tool("fuzz_directories_ffuf",
  `Directory and file discovery using ffuf. Fast, supports multiple wordlists,
   filters by status/size. Use on every live web target.`,
  { url: z.string(), wordlist: z.string().optional(), extensions: z.string().optional(), filter_codes: z.string().optional(), rate: z.number().optional() },
  async ({ url, wordlist, extensions, filter_codes = "404", rate }) => {
    const check = isURLInScope(url.replace("FUZZ", "test"));
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const wl = wordlist || "/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt";
    const extFlag = extensions ? `-e .${extensions.split(",").join(",.")}` : "";
    const filterFlag = filter_codes ? `-fc ${filter_codes}` : "";
    const rateFlag = `-rate ${rate || scope.max_requests_per_second * 10}`;
    const targetUrl = url.includes("FUZZ") ? url : `${url}/FUZZ`;
    await limiter.acquire();
    const r = await safeExec(`ffuf -u ${targetUrl} -w ${wl} ${extFlag} ${filterFlag} ${rateFlag} -json -s`, { timeout: 600000 });
    try { return { content: [{ type: "text", text: JSON.stringify(JSON.parse(r.stdout).results || []) }] }; }
    catch { return { content: [{ type: "text", text: r.stdout.substring(0, 20000) }] }; }
  }
);

server.tool("fuzz_recursive_feroxbuster",
  `Recursive content discovery using feroxbuster. Automatically recurses into
   discovered directories. Better than ffuf for deep path discovery.`,
  { url: z.string(), wordlist: z.string().optional(), depth: z.number().optional(), extensions: z.string().optional() },
  async ({ url, wordlist, depth = 4, extensions }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const wl = wordlist || "/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt";
    await limiter.acquire();
    const r = await safeExec(`feroxbuster -u ${url} -w ${wl} -d ${depth} ${extensions ? `-x ${extensions}` : ""} --json --silent --rate-limit ${scope.max_requests_per_second * 5}`, { timeout: 600000 });
    return { content: [{ type: "text", text: JSON.stringify(parseJsonLines(r.stdout).filter(l => l.type === "response")) }] };
  }
);

server.tool("nuclei_scan",
  `Runs nuclei vulnerability scanner against a target. Template-based detection
   of CVEs, misconfigs, exposed panels, default creds, and more.
   Forbidden tags (dos, fuzz, brute-force) are blocked automatically.`,
  { target: z.string(), tags: z.string().optional(), severity: z.string().optional(), templates: z.string().optional() },
  async ({ target, tags, severity = "medium,high,critical", templates }) => {
    const check = isURLInScope(target);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const FORBIDDEN = ["dos", "fuzz", "brute-force", "intrusive"];
    if (tags) { const bad = tags.split(",").filter(t => FORBIDDEN.includes(t.trim())); if (bad.length) return { content: [{ type: "text", text: `BLOCKED: Forbidden tags: ${bad.join(",")}` }], isError: true }; }
    await limiter.acquire();
    const r = await safeExec(`nuclei -u ${target} ${tags ? `-tags ${tags}` : ""} ${templates ? `-t ${templates}` : ""} -severity ${severity} -silent -json -timeout 30`, { timeout: 600000 });
    const findings = parseJsonLines(r.stdout);
    findings.forEach(f => audit.finding("nuclei_scan", target, f.info?.severity, { template_id: f["template-id"], name: f.info?.name, matched: f["matched-at"] }));
    return { content: [{ type: "text", text: JSON.stringify({ target, findings }) }] };
  }
);

server.tool("scan_xss_dalfox",
  `XSS detection using dalfox. Discovers parameters, tests reflected/DOM/stored
   XSS vectors, and confirms exploitability.`,
  { url: z.string(), params: z.string().optional(), blind_callback: z.string().optional() },
  async ({ url, params, blind_callback }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`dalfox url ${url} ${params ? `--param ${params}` : ""} ${blind_callback ? `--blind ${blind_callback}` : ""} --silence --json`, { timeout: 300000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("scan_sqli",
  `SQL injection detection using sqlmap. Level 2/risk 1 by default — safe for
   bug bounties. Never runs --os-shell or --file-write.`,
  { url: z.string(), data: z.string().optional(), params: z.string().optional(), level: z.number().optional(), headers: z.string().optional() },
  async ({ url, data, params, level = 2, headers }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    if (level > 3) return { content: [{ type: "text", text: "BLOCKED: Level > 3 not permitted in bug bounty scope" }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`sqlmap -u "${url}" ${data ? `--data="${data}"` : ""} ${params ? `-p ${params}` : ""} ${headers ? `--headers="${headers}"` : ""} --level=${level} --risk=1 --batch --technique=BEUSTQ --timeout=10 2>&1 | tail -50`, { timeout: 300000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("scan_cors",
  `Tests CORS misconfiguration using corsy. Detects wildcard origins, reflected
   origins, null origins, and trusted subdomain bypasses.`,
  { url: z.string(), headers: z.string().optional() },
  async ({ url, headers }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`python3 /opt/tools/Corsy/corsy.py -u ${url} ${headers ? `-H "${headers}"` : ""}`, { timeout: 60000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("scan_http_smuggling",
  `Tests for HTTP request smuggling using smuggler.py. Detects CL.TE and
   TE.CL variants. Frequently critical severity on HackerOne.`,
  { url: z.string() },
  async ({ url }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`python3 /opt/tools/smuggler/smuggler.py -u ${url} --quiet`, { timeout: 120000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("scan_ssrf",
  `Tests for SSRF vulnerabilities using SSRFmap.`,
  { url: z.string(), data: z.string().optional() },
  async ({ url, data }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`python3 /opt/tools/SSRFmap/ssrfmap.py -r ${url} ${data ? `--data "${data}"` : ""} -l /opt/tools/SSRFmap/data/payloads.txt`, { timeout: 120000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("scan_open_redirect",
  `Tests for open redirect vulnerabilities using OpenRedireX.`,
  { urls: z.array(z.string()) },
  async ({ urls }) => {
    const scoped = urls.filter(u => isURLInScope(u).allowed);
    const tmpFile = `/tmp/krayt-redirect-${Date.now()}.txt`;
    writeFileSync(tmpFile, scoped.join("\n"));
    const r = await safeExec(`python3 /opt/tools/OpenRedireX/openredirex.py -l ${tmpFile} -p /opt/tools/OpenRedireX/payloads.txt --quiet`, { timeout: 120000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
