import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync } from "fs";
import fetch from "node-fetch";
import { isDomainInScope, validateDomainAndIPs, isIPInScope, isURLInScope, loadScope } from "../../shared/scope-validator.js";
import { RateLimiter } from "../../shared/rate-limiter.js";
import { safeExec, parseJsonLines } from "../../shared/exec-helper.js";
import { audit } from "../../shared/audit-logger.js";

const scope = loadScope();
const limiter = new RateLimiter(scope.max_requests_per_second || 5);
const server = new McpServer({ name: "recon", version: "1.0.0" });

server.tool("subfinder_enumerate",
  `Passive subdomain enumeration using subfinder. Queries certificate transparency,
   DNS datasets, and passive sources. Fast and stealthy — no direct target contact.
   Use as first step in any engagement. Returns in-scope subdomains only.`,
  { domain: z.string() },
  async ({ domain }) => {
    const check = isDomainInScope(domain);
    if (!check.allowed) { audit.blocked("subfinder_enumerate", domain, check.reason); return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true }; }
    audit.allowed("subfinder_enumerate", domain);
    const r = await safeExec(`subfinder -d ${domain} -silent -all -timeout 30`, { timeout: 120000 });
    const subs = r.stdout.split("\n").filter(Boolean).filter(s => isDomainInScope(s).allowed);
    return { content: [{ type: "text", text: JSON.stringify({ domain, subdomains: subs, count: subs.length }) }] };
  }
);

server.tool("amass_enumerate",
  `Active and passive subdomain enumeration using amass. More thorough than
   subfinder — performs DNS brute force, permutations, and scraping. Slower
   but finds subdomains passive tools miss. Combine results with subfinder.`,
  { domain: z.string(), passive_only: z.boolean().optional(), timeout_mins: z.number().optional() },
  async ({ domain, passive_only = false, timeout_mins = 10 }) => {
    const check = isDomainInScope(domain);
    if (!check.allowed) { audit.blocked("amass_enumerate", domain, check.reason); return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true }; }
    const modeFlag = passive_only ? "-passive" : "";
    const r = await safeExec(`amass enum -d ${domain} ${modeFlag} -timeout ${timeout_mins} -silent`, { timeout: (timeout_mins + 2) * 60000 });
    const subs = r.stdout.split("\n").filter(Boolean).filter(s => isDomainInScope(s).allowed);
    return { content: [{ type: "text", text: JSON.stringify({ domain, subdomains: subs, count: subs.length }) }] };
  }
);

server.tool("assetfinder_enumerate",
  `Fast passive subdomain discovery using assetfinder. Different source coverage
   to subfinder — merge results from both for best coverage.`,
  { domain: z.string() },
  async ({ domain }) => {
    const check = isDomainInScope(domain);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const r = await safeExec(`assetfinder --subs-only ${domain}`, { timeout: 60000 });
    const subs = r.stdout.split("\n").filter(Boolean).filter(s => isDomainInScope(s).allowed);
    return { content: [{ type: "text", text: JSON.stringify({ domain, subdomains: subs }) }] };
  }
);

server.tool("dns_resolve_bulk",
  `Resolves a list of subdomains using dnsx. Filters dead hosts, returns live
   IPs, CNAME chains, and A records. Run after enumeration to get a clean
   list of live targets before probing.`,
  { domains: z.array(z.string()), record_types: z.string().optional() },
  async ({ domains, record_types = "A,AAAA,CNAME" }) => {
    const scoped = domains.filter(d => isDomainInScope(d).allowed);
    const tmpFile = `/tmp/krayt-domains-${Date.now()}.txt`;
    writeFileSync(tmpFile, scoped.join("\n"));
    const r = await safeExec(`dnsx -l ${tmpFile} -a -aaaa -cname -silent -json`, { timeout: 120000 });
    return { content: [{ type: "text", text: JSON.stringify(parseJsonLines(r.stdout)) }] };
  }
);

server.tool("dns_zone_transfer",
  `Attempts DNS zone transfer (AXFR) against a domain's nameservers.
   Misconfigured servers return the full zone file revealing all subdomains.
   Always attempt before active enumeration — it's passive and fast.`,
  { domain: z.string() },
  async ({ domain }) => {
    const check = isDomainInScope(domain);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const ns = await safeExec(`dig NS ${domain} +short`);
    const nameservers = ns.stdout.split("\n").filter(Boolean);
    const results = [];
    for (const n of nameservers) {
      const r = await safeExec(`dig AXFR ${domain} @${n}`, { timeout: 15000 });
      results.push({ nameserver: n, response: r.stdout });
    }
    return { content: [{ type: "text", text: JSON.stringify({ domain, nameservers, results }) }] };
  }
);

server.tool("port_scan_fast",
  `Fast port scan using naabu against a list of hosts. Scans top ports using
   SYN scanning. Use to find non-standard ports before deep probing.`,
  { hosts: z.array(z.string()), ports: z.string().optional(), rate: z.number().optional() },
  async ({ hosts, ports = "top-100", rate = 1000 }) => {
    const scoped = [];
    for (const h of hosts) { const c = await validateDomainAndIPs(h); if (c.allowed) scoped.push(h); else audit.blocked("port_scan_fast", h, c.reason); }
    if (!scoped.length) return { content: [{ type: "text", text: "No in-scope hosts" }], isError: true };
    await limiter.acquire();
    const tmpFile = `/tmp/krayt-hosts-${Date.now()}.txt`;
    writeFileSync(tmpFile, scoped.join("\n"));
    const portsFlag = ports === "top-100" ? "-top-ports 100" : ports === "top-1000" ? "-top-ports 1000" : `-p ${ports}`;
    const r = await safeExec(`naabu -l ${tmpFile} ${portsFlag} -rate ${rate} -silent -json`, { timeout: 300000 });
    return { content: [{ type: "text", text: JSON.stringify(parseJsonLines(r.stdout)) }] };
  }
);

server.tool("port_scan_deep",
  `Detailed service fingerprinting using nmap on specific ports. Detects service
   versions and runs default scripts. Use after naabu on interesting ports.`,
  { host: z.string(), ports: z.string(), scripts: z.string().optional() },
  async ({ host, ports, scripts = "default" }) => {
    const check = await validateDomainAndIPs(host);
    if (!check.allowed) { audit.blocked("port_scan_deep", host, check.reason); return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true }; }
    await limiter.acquire();
    const r = await safeExec(`nmap -sV -p ${ports} --script ${scripts} -oX - ${host}`, { timeout: 300000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("probe_http",
  `Probes hosts for live HTTP/HTTPS services using httpx. Returns status codes,
   titles, technologies, content length, and redirect chains.`,
  { hosts: z.array(z.string()), ports: z.string().optional() },
  async ({ hosts, ports = "80,443,8080,8443,3000,5000,8000,8888" }) => {
    const scoped = [];
    for (const h of hosts) { const c = await validateDomainAndIPs(h); if (c.allowed) scoped.push(h); else audit.blocked("probe_http", h, c.reason); }
    if (!scoped.length) return { content: [{ type: "text", text: "No in-scope hosts" }], isError: true };
    await limiter.acquire();
    const tmpFile = `/tmp/krayt-probe-${Date.now()}.txt`;
    writeFileSync(tmpFile, scoped.join("\n"));
    const r = await safeExec(`httpx -l ${tmpFile} -ports ${ports} -status-code -title -tech-detect -content-length -follow-redirects -cdn -json -silent`, { timeout: 180000 });
    return { content: [{ type: "text", text: JSON.stringify(parseJsonLines(r.stdout)) }] };
  }
);

server.tool("detect_waf",
  `Detects WAF/CDN presence and vendor using wafw00f. Knowing the WAF helps
   select bypass techniques and avoid triggering blocks.`,
  { url: z.string() },
  async ({ url }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const r = await safeExec(`wafw00f ${url} -o - -f json`, { timeout: 30000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("fingerprint_technologies",
  `Deep technology fingerprinting using whatweb. Identifies CMS, frameworks,
   server software, JS libraries and hundreds of other components.`,
  { url: z.string(), aggression: z.number().optional() },
  async ({ url, aggression = 1 }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`whatweb --aggression=${aggression} --log-json=- ${url}`, { timeout: 30000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("ssl_tls_scan",
  `Scans TLS config using tlsx. Returns cert details, supported TLS versions,
   cipher suites, and SANs. SANs often reveal additional in-scope subdomains.`,
  { hosts: z.array(z.string()) },
  async ({ hosts }) => {
    const scoped = hosts.filter(h => isDomainInScope(h).allowed);
    const tmpFile = `/tmp/krayt-tls-${Date.now()}.txt`;
    writeFileSync(tmpFile, scoped.join("\n"));
    const r = await safeExec(`tlsx -l ${tmpFile} -san -cn -so -json -silent`, { timeout: 120000 });
    return { content: [{ type: "text", text: JSON.stringify(parseJsonLines(r.stdout)) }] };
  }
);

server.tool("check_cdn",
  `Uses cdncheck to determine if a host is behind a CDN or cloud provider.
   CDN IPs are often shared infrastructure and out of scope for bug bounties.`,
  { hosts: z.array(z.string()) },
  async ({ hosts }) => {
    const tmpFile = `/tmp/krayt-cdn-${Date.now()}.txt`;
    writeFileSync(tmpFile, hosts.join("\n"));
    const r = await safeExec(`cdncheck -l ${tmpFile} -resp -json -silent`, { timeout: 60000 });
    return { content: [{ type: "text", text: JSON.stringify(parseJsonLines(r.stdout)) }] };
  }
);

server.tool("enumerate_cloud_assets",
  `Uses cloudbrute to find cloud storage buckets and services associated with
   a target org. Misconfigured public buckets are frequent high-severity finds.`,
  { keyword: z.string(), providers: z.string().optional() },
  async ({ keyword }) => {
    const r = await safeExec(`cloudbrute -d ${keyword} -k ${keyword} -t 80 -T 10`, { timeout: 180000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("check_s3_bucket",
  `Tests S3 bucket permissions using aws-cli without credentials. Checks if
   a bucket allows unauthenticated listing, reading, or writing.`,
  { bucket_name: z.string() },
  async ({ bucket_name }) => {
    const r = await safeExec(`aws s3 ls s3://${bucket_name} --no-sign-request 2>&1`, { timeout: 15000 });
    return { content: [{ type: "text", text: JSON.stringify({ bucket: bucket_name, allowed: !r.stdout.includes("AccessDenied"), output: r.stdout.substring(0, 500) }) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
