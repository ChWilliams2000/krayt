import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { isDomainInScope } from "../../shared/scope-validator.js";
import { safeExec } from "../../shared/exec-helper.js";
import { audit } from "../../shared/audit-logger.js";

const server = new McpServer({ name: "osint", version: "1.0.0" });

server.tool("wayback_urls",
  `Queries Wayback Machine for all historically archived URLs for a domain.
   Returns unique URLs including old endpoints and legacy params.`,
  { domain: z.string(), filter_static: z.boolean().optional() },
  async ({ domain, filter_static = true }) => {
    const check = isDomainInScope(domain);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const res = await fetch(`https://web.archive.org/cdx/search/cdx?url=*.${domain}/*&output=json&fl=original&collapse=urlkey&limit=5000`);
    let urls = (await res.json() || []).slice(1).map(r => r[0]);
    if (filter_static) urls = urls.filter(u => !/\.(png|jpg|jpeg|gif|svg|ico|css|woff|woff2|ttf|eot|map)(\?|$)/i.test(u));
    return { content: [{ type: "text", text: JSON.stringify({ domain, urls, count: urls.length }) }] };
  }
);

server.tool("enumerate_github_org",
  `Lists all public repositories for a GitHub organization. Use to identify
   repos to scan for secrets and internal tooling.`,
  { org: z.string() },
  async ({ org }) => {
    const results = [];
    let page = 1;
    while (results.length < 200) {
      const res = await fetch(`https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&type=public`, { headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" } });
      const repos = await res.json();
      if (!Array.isArray(repos) || !repos.length) break;
      results.push(...repos.map(r => ({ name: r.full_name, description: r.description, language: r.language, stars: r.stargazers_count, last_push: r.pushed_at, topics: r.topics })));
      page++;
    }
    return { content: [{ type: "text", text: JSON.stringify({ org, repos: results, count: results.length }) }] };
  }
);

server.tool("search_pastebin",
  `Searches psbdmp.ws for target domain mentions in public pastes.
   Leaked credentials appear in pastes frequently. Fully passive.`,
  { query: z.string() },
  async ({ query }) => {
    const res = await fetch(`https://psbdmp.ws/api/v3/search/${encodeURIComponent(query)}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json()) }] };
  }
);

server.tool("reverse_ip_lookup",
  `Finds all domains hosted on an IP using HackerTarget. Shared hosting
   targets often have related domains on the same IP.`,
  { ip: z.string() },
  async ({ ip }) => {
    const res = await fetch(`https://api.hackertarget.com/reverseiplookup/?q=${ip}`);
    const domains = (await res.text()).trim().split("\n").filter(Boolean);
    return { content: [{ type: "text", text: JSON.stringify({ ip, domains, count: domains.length }) }] };
  }
);

server.tool("google_dork",
  `Generates Google dork queries for manual execution. Returns queries for
   exposed files, login panels, error messages, config files, and subdomains.
   Copy into browser — does not execute to avoid Google rate limiting.`,
  { domain: z.string(), dork_types: z.array(z.string()).optional() },
  async ({ domain, dork_types = ["all"] }) => {
    const all = dork_types.includes("all");
    const dorks = [];
    if (all || dork_types.includes("exposed_files")) dorks.push(`site:${domain} ext:env OR ext:log OR ext:sql OR ext:bak`, `site:${domain} ext:xml OR ext:json OR ext:yaml inurl:config`);
    if (all || dork_types.includes("login_panels")) dorks.push(`site:${domain} inurl:admin OR inurl:login OR inurl:dashboard`, `site:${domain} intitle:"admin" OR intitle:"login"`);
    if (all || dork_types.includes("error_messages")) dorks.push(`site:${domain} "SQL syntax" OR "stack trace" OR "Fatal error:"`, `site:${domain} "Warning:" OR "Uncaught exception"`);
    if (all || dork_types.includes("api_endpoints")) dorks.push(`site:${domain} inurl:api OR inurl:v1 OR inurl:v2 OR inurl:graphql`, `site:${domain} inurl:swagger OR inurl:openapi OR inurl:api-docs`);
    if (all || dork_types.includes("subdomains")) dorks.push(`site:*.${domain} -www`);
    return { content: [{ type: "text", text: JSON.stringify({ domain, dorks }) }] };
  }
);

server.tool("fetch_robots_sitemap",
  `Fetches robots.txt and sitemap.xml. robots.txt often reveals hidden paths
   and admin panels. Sitemap reveals the full URL structure.`,
  { base_url: z.string() },
  async ({ base_url }) => {
    const results = {};
    for (const path of ["/robots.txt", "/sitemap.xml", "/sitemap_index.xml"]) {
      try { const res = await fetch(`${base_url}${path}`); results[path] = { status: res.status, body: (await res.text()).substring(0, 5000) }; }
      catch (e) { results[path] = { error: e.message }; }
    }
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
