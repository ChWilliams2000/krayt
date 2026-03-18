import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { isURLInScope, isDomainInScope, loadScope } from "../../shared/scope-validator.js";
import { RateLimiter } from "../../shared/rate-limiter.js";
import { safeExec } from "../../shared/exec-helper.js";
import { audit } from "../../shared/audit-logger.js";

const scope = loadScope();
const limiter = new RateLimiter(scope.max_requests_per_second || 5);
const server = new McpServer({ name: "api", version: "1.0.0" });

server.tool("discover_api_parameters",
  `Discovers hidden GET/POST parameters using arjun. Finds undocumented params
   that may have weaker validation or different access controls.`,
  { url: z.string(), method: z.enum(["GET", "POST", "JSON"]).optional(), wordlist: z.string().optional() },
  async ({ url, method = "GET", wordlist }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const r = await safeExec(`arjun -u ${url} ${method === "JSON" ? "--json" : `-m ${method}`} ${wordlist ? `-w ${wordlist}` : ""} --quiet`, { timeout: 180000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("fuzz_api_routes",
  `Discovers API endpoints using kiterunner with API-specific wordlists.
   Replays full HTTP requests with correct methods and content-types — much
   better hit rate than ffuf on REST APIs.`,
  { url: z.string(), wordlist: z.string().optional(), headers: z.record(z.string()).optional() },
  async ({ url, wordlist, headers }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    await limiter.acquire();
    const wl = wordlist || "/opt/tools/kiterunner/routes-large.kite";
    const headerFlags = headers ? Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(" ") : "";
    const r = await safeExec(`kr scan ${url} -w ${wl} ${headerFlags} --json --quiet`, { timeout: 300000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("probe_graphql",
  `Fingerprints GraphQL endpoint and attempts introspection schema retrieval.
   Uses graphw00f to identify the engine, then dumps the full schema.`,
  { url: z.string(), headers: z.record(z.string()).optional() },
  async ({ url, headers }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const gw = await safeExec(`python3 /opt/tools/graphw00f/main.py -d -t ${url}`, { timeout: 30000 });
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(headers || {}) }, body: JSON.stringify({ query: `{ __schema { types { name fields { name } } } }` }) });
    const introspection = await res.json().catch(() => ({ error: "parse failed" }));
    return { content: [{ type: "text", text: JSON.stringify({ engine: gw.stdout, introspection }) }] };
  }
);

server.tool("analyze_jwt",
  `Analyzes a JWT token for vulnerabilities: alg:none, algorithm confusion,
   weak secrets, missing claims, and kid injection.`,
  { token: z.string(), public_key: z.string().optional() },
  async ({ token, public_key }) => {
    const r = await safeExec(`python3 /opt/tools/jwt_tool/jwt_tool.py ${token} ${public_key ? `-pk ${public_key}` : ""} -M at 2>&1`, { timeout: 30000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("test_oauth_flow",
  `Analyzes an OAuth 2.0 authorization URL for common vulnerabilities: missing
   state, no PKCE, implicit flow, and redirect_uri bypass variants.`,
  { auth_url: z.string(), client_id: z.string().optional(), redirect_uri: z.string().optional() },
  async ({ auth_url, redirect_uri }) => {
    const check = isURLInScope(auth_url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const params = Object.fromEntries(new URL(auth_url).searchParams);
    const findings = [];
    if (!params.state) findings.push({ issue: "Missing state parameter", severity: "medium" });
    if (!params.code_challenge) findings.push({ issue: "Missing PKCE", severity: "low" });
    if (params.response_type === "token") findings.push({ issue: "Implicit flow in use", severity: "medium" });
    if (redirect_uri && !redirect_uri.startsWith("https://")) findings.push({ issue: "Non-HTTPS redirect_uri", severity: "high" });
    if (redirect_uri) findings.push({ issue: "Test these redirect_uri bypasses manually", variants: [`${redirect_uri}.attacker.com`, `${redirect_uri}@attacker.com`] });
    return { content: [{ type: "text", text: JSON.stringify({ auth_url, params, findings }) }] };
  }
);

server.tool("test_ssl_tls",
  `Full TLS/SSL audit using testssl.sh. Checks weak protocols, weak ciphers,
   BEAST, POODLE, Heartbleed, DROWN, and certificate issues.`,
  { host: z.string() },
  async ({ host }) => {
    const domain = host.split(":")[0];
    const check = isDomainInScope(domain);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const r = await safeExec(`testssl.sh --json --quiet --parallel ${host}`, { timeout: 300000 });
    return { content: [{ type: "text", text: r.stdout.substring(0, 30000) }] };
  }
);

server.tool("setup_oob_listener",
  `Starts an interactsh-client session for out-of-band detection. Returns a
   unique callback URL for use in SSRF, XXE, and blind XSS tests.`,
  {},
  async () => {
    const r = await safeExec(`interactsh-client -json -o /tmp/interactsh-${Date.now()}.json & sleep 3 && cat /tmp/interactsh-*.json 2>/dev/null | head -1`, { timeout: 10000 });
    return { content: [{ type: "text", text: r.stdout }] };
  }
);

server.tool("nikto_scan",
  `Web server vulnerability scan using nikto. Checks for dangerous files,
   outdated software, and misconfigurations.`,
  { url: z.string(), tuning: z.string().optional() },
  async ({ url, tuning = "123456789" }) => {
    const check = isURLInScope(url);
    if (!check.allowed) return { content: [{ type: "text", text: `BLOCKED: ${check.reason}` }], isError: true };
    const safeTuning = tuning.replace(/0/g, "");
    await limiter.acquire();
    const r = await safeExec(`nikto -h ${url} -Tuning ${safeTuning} -Format json -nointeractive 2>&1`, { timeout: 300000 });
    return { content: [{ type: "text", text: r.stdout.substring(0, 20000) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
