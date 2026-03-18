import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { isDomainInScope, isIPInScope, loadScope } from "../../shared/scope-validator.js";
import { RateLimiter } from "../../shared/rate-limiter.js";
import { safeExec } from "../../shared/exec-helper.js";
import { audit } from "../../shared/audit-logger.js";

const scope = loadScope();
const limiter = new RateLimiter(scope.max_requests_per_second || 5);
const server = new McpServer({ name: "intel", version: "1.0.0" });

server.tool("internetdb_lookup",
  `Queries Shodan's free InternetDB API for an IP. Returns open ports, hostnames,
   CVEs, and tags. No API key required. Rate limit: ~1 req/sec.`,
  { ip: z.string() },
  async ({ ip }) => {
    const check = isIPInScope(ip);
    if (check.allowed === false) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const res = await fetch(`https://internetdb.shodan.io/${ip}`);
    if (res.status === 404) return { content: [{ type: "text", text: JSON.stringify({ ip, found: false }) }] };
    return { content: [{ type: "text", text: JSON.stringify(await res.json()) }] };
  }
);

server.tool("ip_geolocation",
  `Queries ip-api.com for geolocation and network info for an IP. Returns
   country, region, city, ISP, org, ASN, and reverse DNS. Completely free,
   no API key required. Use to enrich any IP discovered during recon.`,
  { ip: z.string() },
  async ({ ip }) => {
    const check = isIPInScope(ip);
    if (check.allowed === false) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,reverse,mobile,proxy,hosting,query`
    );
    const data = await res.json();
    if (data.status === "fail") return { content: [{ type: "text", text: JSON.stringify({ ip, error: data.message }) }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }
);

server.tool("urlscan_lookup",
  `Queries urlscan.io for historical scans of a domain or URL. Returns page
   screenshots, loaded resources, outbound requests, and cookies. Fully passive.`,
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit = 10 }) => {
    const res = await fetch(
      `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(query)}&size=${limit}`,
      { headers: { "API-Key": process.env.URLSCAN_API_KEY || "" } }
    );
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify((data.results || []).map(r => ({
      url: r.page?.url, domain: r.page?.domain, ip: r.page?.ip,
      server: r.page?.server, screenshot: r.screenshot, date: r.task?.time,
    }))) }] };
  }
);

server.tool("whois_lookup",
  `WHOIS lookup for a domain or IP. Returns registrar, dates, nameservers,
   and registrant org. Useful for verifying target ownership.`,
  { target: z.string() },
  async ({ target }) => {
    const r = await safeExec(`whois ${target}`, { timeout: 15000 });
    return { content: [{ type: "text", text: r.stdout.substring(0, 3000) }] };
  }
);

server.tool("asn_lookup",
  `Looks up ASN and IP ranges for an org. Finds all infrastructure owned by
   a target — IPs in their ASN may be in scope even if not explicitly listed.`,
  { target: z.string() },
  async ({ target }) => {
    const res = await fetch(`https://api.bgpview.io/search?query_term=${encodeURIComponent(target)}`);
    return { content: [{ type: "text", text: JSON.stringify((await res.json())?.data) }] };
  }
);

server.tool("virustotal_lookup",
  `Enriches a URL, domain, IP, or hash against VirusTotal. Returns detection
   ratio, categories, and reputation score. Free tier: 4 req/min.`,
  { target: z.string(), type: z.enum(["url", "domain", "ip", "hash"]) },
  async ({ target, type }) => {
    const pathMap = { url: "urls", domain: "domains", ip: "ip_addresses", hash: "files" };
    const lookupTarget = type === "url"
      ? Buffer.from(target).toString("base64").replace(/=+$/, "")
      : target;
    const res = await fetch(
      `https://www.virustotal.com/api/v3/${pathMap[type]}/${lookupTarget}`,
      { headers: { "x-apikey": process.env.VIRUSTOTAL_API_KEY } }
    );
    const attrs = (await res.json()).data?.attributes;
    return { content: [{ type: "text", text: JSON.stringify({
      target, type,
      malicious: attrs?.last_analysis_stats?.malicious,
      suspicious: attrs?.last_analysis_stats?.suspicious,
      reputation: attrs?.reputation,
      categories: attrs?.categories,
    }) }] };
  }
);

server.tool("abuseipdb_check",
  `Checks an IP against AbuseIPDB for reported malicious activity. Returns
   abuse confidence score (0-100) and report count.`,
  { ip: z.string(), days: z.number().optional() },
  async ({ ip, days = 90 }) => {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=${days}`,
      { headers: { Key: process.env.ABUSEIPDB_API_KEY, Accept: "application/json" } }
    );
    const d = (await res.json()).data;
    return { content: [{ type: "text", text: JSON.stringify({
      ip,
      abuseConfidenceScore: d.abuseConfidenceScore,
      totalReports: d.totalReports,
      lastReportedAt: d.lastReportedAt,
      isp: d.isp,
      countryCode: d.countryCode,
    }) }] };
  }
);

server.tool("crt_sh_lookup",
  `Queries certificate transparency logs via crt.sh for a domain. Reveals
   subdomains, internal hostnames, and historical infrastructure. Fully passive.`,
  { domain: z.string() },
  async ({ domain }) => {
    const check = isDomainInScope(domain);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const res = await fetch(`https://crt.sh/?q=%.${domain}&output=json`);
    const data = await res.json();
    const domains = [...new Set(
      data.flatMap(e => [e.common_name, ...(e.name_value?.split("\n") || [])])
        .filter(Boolean)
        .filter(d => isDomainInScope(d).allowed)
    )];
    return { content: [{ type: "text", text: JSON.stringify({ domain, found: domains, count: domains.length }) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
