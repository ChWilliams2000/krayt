# Engagement Prompts

Sample prompts for each engagement stage. All servers are loaded at startup via
`~/.gemini/settings.json` — you do not launch them individually.

Launch for any stage:
```bash
# Ensure current scope is set before launching
cp engagements/brave/scope.json engagements/current/scope.json

export GEMINI_API_KEY=$(grep ^GEMINI_API_KEY .env | cut -d= -f2)
gemini --model gemini-2.0-flash
```

To switch models across the whole project at once:
```bash
bash scripts/set-model.sh gemini-2.0-flash   # free tier default
bash scripts/set-model.sh gemini-2.5-pro     # paid tier
```

**Free tier note (1,500 requests/day, 1M tokens/day):**
- All stages complete on free tier — larger programs may split across days
- llmrecon is the most request-intensive stage; run it as its own session
- `LLM_MAX_PAYLOADS_PER_TIER` defaults to 4 on free tier to conserve requests
- Quota resets daily — resume with the context recap tip at the bottom

---

## Brave Software — HackerOne (`brave`)

Engagement ID: `brave`
Scope file: `engagements/brave/scope.json`
Program URL: https://hackerone.com/brave

### Program-specific rules — read before starting

- **Current releases only.** Check https://brave.com/latest/ before testing
  anything browser-side. Older releases are not in scope.
- **GitHub repos are explicitly in scope.** `github.com/brave` and
  `github.com/brave-intls` — non-archived, non-deprecated, non-forked only.
- **Chromium issues are almost always out of scope.** Only report a Chromium
  bug if Brave is fixing it directly.
- **One report per underlying bug.** Do not file separate reports for different
  exploitation paths of the same root cause.
- **PoC is mandatory.** Scanner output alone is not a valid report.
- **AI-generated reports without human validation may get you banned.**
  Validate every finding yourself before filing.
- **LLM bounties are doubled** (as of Nov 26 2025) — but system prompt
  leakage alone is OUT OF SCOPE. Only data leakage, data destruction/modification,
  or unauthorized actions on behalf of the user qualify.
- **Out-of-scope domains to avoid entirely:**
  community.brave.com, support.brave.com, survey-admin.brave.com, status.brave.com
- **Rate limit:** No explicit number — stay at 3 req/s max.

---

### Stage 1 — OSINT + Passive Recon (`osint` + `intel`)

```
Engagement: brave
Stage: 1 of 7 — OSINT + Passive Recon
Scope file: engagements/current/scope.json is loaded.
In-scope root domains: brave.com, basicattentiontoken.org, bravesoftware.com,
brave.software, brave.io and all their subdomains.
Priority web targets: search.brave.com, api-dashboard.search.brave.com,
account.brave.com, talk.brave.com, creators.basicattentiontoken.org,
subscriptions.bsg.brave.com

Complete ALL of the following steps before moving to Stage 2.
Run passive recon only — no direct target contact this stage.

Step 1: Fetch robots.txt and sitemap from each priority target:
  https://brave.com, https://search.brave.com, https://account.brave.com,
  https://talk.brave.com, https://creators.basicattentiontoken.org

Step 2: Pull Wayback Machine URLs for each of the five priority domains above.
  Filter static assets. Save URL lists.

Step 3: Generate Google dork queries for brave.com — output them for manual
  execution. Cover: exposed files, login panels, error messages, API endpoints,
  subdomains.

Step 4: Search psbdmp for "brave.com" and "basicattentiontoken.org".

Step 5: enumerate_github_org for "brave" and "brave-intls". List all
  non-archived public repos with language, star count, last push date.
  Flag repos pushed to within the last 60 days as high priority for Stage 4.

Step 6: crt_sh_lookup for brave.com, basicattentiontoken.org, bravesoftware.com.
  Add any new subdomains to the working list.

Step 7: whois_lookup on brave.com.

Step 8: asn_lookup for "Brave Software".

When all 8 steps are done:
- Summarise all findings
- List any repos flagged as recently pushed
- List any paste exposure hits
- Send Discord notification: "Stage 1 complete. [X] subdomains from crt.sh,
  [Y] GitHub repos found ([Z] recently pushed). Engagement: brave."
```

---

### Stage 2 — Subdomain Enumeration + DNS (`recon`)

```
Engagement: brave
Stage: 2 of 7 — Subdomain Enumeration + DNS
Do NOT run probe_http or detect_waf this stage — those are Stage 3 steps.

Complete ALL of the following steps in order before moving to Stage 3.

Step 1: subfinder_enumerate on each root domain:
  brave.com, basicattentiontoken.org, bravesoftware.com, brave.software, brave.io

Step 2: amass_enumerate on each root domain (passive first, active if < 20 results).

Step 3: assetfinder_enumerate on each root domain.

Step 4: dns_zone_transfer on each root domain.

Step 5: Merge and deduplicate all subdomain results into one list.
  Remove out-of-scope domains: community.brave.com, support.brave.com,
  survey-admin.brave.com, status.brave.com

Step 6: dns_resolve_bulk on the full merged list. Discard dead hosts.
  If this fails or returns 0 results, note it and continue with
  whatever subdomains were found — do not skip ahead.

Step 7: ssl_tls_scan on all resolved HTTPS hosts. Feed any new SANs
  back through dns_resolve_bulk (Step 6 again for new names only).

Step 8: check_cdn on all resolved IPs. Flag CDN-hosted IPs clearly.

When all 8 steps are done:
- Output confirmed live in-scope hosts with IPs and CDN status
- Send Discord notification: "Stage 2 complete. [X] live hosts found,
  [Y] CDN-hosted. Engagement: brave."
```

---

### Stage 3 — HTTP Probing + Technology Fingerprinting (`recon` + `intel`)

```
Engagement: brave
Stage: 3 of 7 — HTTP Probing + Technology Fingerprinting
Working from the live non-CDN host list from Stage 2.

Process priority targets first:
  search.brave.com, api-dashboard.search.brave.com, account.brave.com,
  talk.brave.com, creators.basicattentiontoken.org, subscriptions.bsg.brave.com
Then process remaining non-CDN hosts.

Complete ALL of the following steps before moving to Stage 4.

Step 1: probe_http on all live non-CDN hosts.

Step 2: detect_waf on each live web target. Note vendor — this will
  inform scan rate choices in Stage 5.

Step 3: fingerprint_technologies on anything running interesting
  CMS, frameworks, or AI-adjacent stacks.

Step 4: internetdb_lookup on each resolved IP.

Step 5: ip_geolocation on each IP. Flag unexpected geography.

Step 6: port_scan_fast on live non-CDN hosts — top 100 ports.

Step 7: port_scan_deep on any interesting non-standard ports from Step 6.

If any target returns 403 or connection refused in Steps 1–3:
  Note it as "WAF/blocked — flag for manual review" and move on.
  Do not retry repeatedly.

When all 7 steps are done:
- Summarise: priority target stack, WAF coverage, interesting ports
- Flag any Cloudfront/WAF-blocked targets for manual follow-up
- Send Discord notification: "Stage 3 complete. [X] targets probed,
  [Y] WAF-protected, [Z] interesting ports. Engagement: brave."
```

---

### Stage 4 — Crawling + JS Analysis + Secret Scanning (`webapp` + `secrets`)

```
Engagement: brave
Stage: 4 of 7 — Crawling + JS Analysis + Secret Scanning
Working from the live target list from Stage 3.
Rate limit: 3 req/s max.

Process priority targets first:
  search.brave.com, account.brave.com, talk.brave.com,
  creators.basicattentiontoken.org, subscriptions.bsg.brave.com

For each target, complete these steps:

Step 1: crawl_katana (depth 3).
  If target returns 403 or Cloudfront block:
    Note "Cloudfront/WAF protected — crawl blocked, flag for manual"
    Skip remaining crawl steps for this target and move to the next.

Step 2: crawl_gospider. Note any S3 URLs or Cloudfront storage references.

Step 3: Merge crawl results. Flag API endpoints, auth flows, admin paths.

Step 4: extract_js_links on target (crawl=true).

Step 5: extract_js_endpoints on discovered JS file URLs.

Step 6 (GitHub — high priority for Brave):
  scan_repo_secrets on all repos flagged as recently pushed in Stage 1.
  Always scan these specifically:
    https://github.com/brave/brave-core
    https://github.com/brave/brave-browser

Step 7: github_dorking for orgs "brave" and "brave-intls".

Step 8: pattern_grep the crawled URL list with: xss, sqli, ssrf, redirect, idor.

If any valid credentials or API keys are found at any point:
  STOP that finding immediately.
  save_finding_note with repo/file location only.
  Do NOT use the credentials.
  Send Discord alert: severity=high, "Credentials found in [location]."

When all steps are done:
- Summarise: endpoint inventory, JS findings, GitHub hits
- List Cloudfront-blocked targets for manual follow-up
- Send Discord notification: "Stage 4 complete. [X] endpoints crawled,
  [Y] JS files analysed, [Z] GitHub repos scanned. Engagement: brave."
```

---

### Stage 5 — Vulnerability Scanning (`webapp` + `api`)

```
Engagement: brave
Stage: 5 of 7 — Vulnerability Scanning
Working from the crawl inventory and parameter list from Stage 4.
Rate limit: 3 req/s max across all tools.

Priority targets first:
  search.brave.com, account.brave.com, talk.brave.com,
  creators.basicattentiontoken.org, subscriptions.bsg.brave.com

Step 1: nuclei_scan on each target, severity=medium,high,critical.
  Use -j flag for JSON output (NOT -json — newer nuclei renamed this flag).
  Do not use tags: dos, fuzz, brute-force, intrusive.
  Suggested tags: xss, sqli, ssrf, misconfig, exposure, rce

Step 2: For endpoints with form inputs or URL parameters:
  - scan_xss_dalfox on xss-flagged params
    (Note: self-XSS and URL-bar javascript: are out of scope for Brave)
  - scan_sqli on sqli-flagged params (level=2, risk=1 — never exceed level 3)
  - scan_cors on all API endpoints
  - scan_ssrf on URL-accepting params (use interactsh callback from setup_oob_listener)
  - scan_open_redirect on redirect params
    (Note: redirect continuation URL vulns are out of scope for Brave)

Step 3: For API surfaces (search.brave.com has a public API — prioritise this):
  - fuzz_api_routes on API base paths
  - discover_api_parameters on key endpoints
  - probe_graphql on any /graphql endpoints
  - test_ssl_tls on all HTTPS hosts
  - analyze_jwt on any JWT tokens found in responses
  - test_oauth_flow on OAuth URLs (account.brave.com uses OAuth)

Step 4: For targets with visible proxy/load balancer headers:
  - scan_http_smuggling

Step 5: For any S3 or cloud storage bucket names found in Stage 4:
  - check_s3_bucket on each name
  - enumerate_cloud_assets for keyword "brave"

For each confirmed finding immediately:
  screenshot_url, capture_http_exchange, save_finding_note
  Send Discord alert with severity and target URL.

Do not file anything that is:
  - A known Chromium issue
  - Self-XSS or URL-bar javascript:
  - A redirect continuation URL vuln
  - Scanner output without a manual PoC

When all steps are done:
- Summarise findings with severity counts
- Send Discord notification: "Stage 5 complete. [X] findings captured
  ([Y] critical, [Z] high, [W] medium). Engagement: brave."
```

---

### Stage 6 — LLM Surface Testing (`llmrecon`)

```
Engagement: brave
Stage: 6 of 7 — LLM Surface Testing
Working from the crawl inventory from Stage 4.

IMPORTANT — Brave's LLM scope is strict AND bounties are doubled:
IN SCOPE (2x bounty): prompt injection causing data leakage, data destruction/
  modification, or unauthorized actions performed on behalf of the user.
OUT OF SCOPE: system prompt leakage alone, jailbreaks, safety bypasses,
  hallucinations, harmful content generation, theoretical impact only.

Known Brave AI surfaces to prioritise:
  - search.brave.com — Leo AI assistant integrated into Brave Search
  - Any /leo, /ai, /assistant, /chat endpoints from the crawl inventory
  - Any summarisation or AI-generated answer features

For each text-input endpoint:

Step 1: fingerprint_llm_surface. Note score and signals.

Step 2: For confirmed surfaces (score >= 0.60):
  run_injection_campaign with tiers: universal + context_adapted

  Handle judge verdicts for Brave specifically:
  - FULL_SUCCESS on data_leakage or unauthorized_action:
      capture_injection_evidence immediately
      send_alert: severity=high or critical, include payload summary
      This qualifies for DOUBLED bounty
  - FULL_SUCCESS on system_prompt_extraction only:
      Note for reference — OUT OF SCOPE for Brave — do NOT file a report
  - FULL_SUCCESS on role_override with no data/action impact:
      Note for reference — OUT OF SCOPE for Brave — do NOT file a report
  - PARTIAL_SUCCESS:
      capture_injection_evidence
      Flag for manual review to assess whether impact meets Brave's bar
  - INTERESTING:
      Note URL and response for manual review, continue

Step 3: For any score between 0.30 and 0.60:
  Note the URL and signals — add to manual review list.

When done:
- Summarise confirmed LLM surfaces, verdicts, and what qualifies for filing
- Send Discord notification: "Stage 6 complete. [X] LLM surfaces found,
  [Y] qualifying findings captured. Engagement: brave."
```

---

### Stage 7 — Evidence + Reporting (`evidence` + `reporting` + `notify`)

```
Engagement: brave
Stage: 7 of 7 — Evidence + Reporting

Step 1: For each confirmed finding not yet fully documented:
  - screenshot_url with a descriptive label
  - capture_http_exchange for the exact proving request
  - save_finding_note with full description, reproduction steps, impact
    (save_finding_note is required for generate_engagement_summary to work)

Step 2: Before drafting any report, verify each finding is NOT:
  - A known Chromium issue
  - Self-XSS or URL-bar javascript:
  - A redirect continuation URL vuln
  - An LLM finding where the only impact is system prompt leakage
  - Scanner output without a manual PoC

Step 3: For each valid finding:
  draft_hackerone_report with:
  - Clear reproduction steps a human can follow
  - Exact browser version if browser-side (from https://brave.com/latest/)
  - For GitHub: exact repo, file path, commit hash
  - For LLM: full payload, exact response, explanation of why this
    constitutes data leakage or unauthorized action

Step 4: generate_engagement_summary for engagement brave.
  (This reads from engagements/brave/findings/ — will be empty if
  save_finding_note was not called for each finding in earlier stages.)

Step 5: send_alert for each High and Critical finding.

Step 6: Send final session Discord notification:
  severity="info"
  message="Engagement brave session complete. [X] findings total:
  [Y] critical, [Z] high, [W] medium. Reports in engagements/brave/reports/.
  Manual review needed for: [list any blocked targets and partial LLM findings]."

Output: full findings list with severities, report file paths, and anything
flagged for manual follow-up.
```

---

### Brave-specific: GitHub-only Session

```
Engagement: brave
Focused GitHub secret scanning — can run any day independently.

In-scope: all non-archived, non-deprecated, non-forked repos under
github.com/brave and github.com/brave-intls.

Step 1: enumerate_github_org("brave") — full repo list with last push dates.
Step 2: enumerate_github_org("brave-intls") — full repo list.
Step 3: Flag repos pushed to within the last 60 days as priority.

Step 4: scan_repo_secrets on each priority repo (trufflehog full history):
  Always include: brave-core, brave-browser

Step 5: github_dorking for org "brave":
  filename:.env, "api_key", "secret_key", "aws_access_key_id",
  filename:config.json "password", "private_key", "access_token"

Step 6: github_dorking for org "brave-intls" with same patterns.

If any secrets found:
  STOP immediately.
  save_finding_note: repo URL, file path, secret type, commit hash.
  Do NOT use or validate the credential.
  draft_hackerone_report immediately.
  send_alert: severity=high, "Credentials found in [repo/file]."

When done: send Discord: "GitHub session complete. [X] repos scanned,
[Y] secrets found. Engagement: brave."
```

---

### Brave-specific: Network Privacy Session

```
Engagement: brave
Network privacy testing — requires manual Brave browser + proxy setup first.

Pre-requisites (manual):
  1. Install current Brave from https://brave.com/latest/
  2. Set up Burp Suite or mitmproxy to intercept all browser traffic
  3. Use a fresh Brave profile with Brave Rewards NOT opted in
  4. Note the exact Brave version number for the report

With proxy running, document any requests that:
  - Go to Brave Rewards endpoints for a user NOT opted into Rewards
  - Connect to third-party services (Google etc.) in background without user action
  - Leak IP or browsing activity from a Tor window
  - Use DNS without DNS-over-HTTPS on a DoH-supporting platform

For any such request:
  capture_http_exchange: full request and response
  save_finding_note: exact request, when it fires, what data leaks,
    why it is unexpected given user settings
  draft_hackerone_report immediately

Note: requests by websites not owned by Brave are out of scope.
Requests necessary for Brave to function properly are out of scope.

Send Discord when done: "Network privacy session complete. [X] unexpected
connections found. Engagement: brave."
```

---

## Resuming a Session

If you hit quota or need to continue in a new session:

```bash
cp engagements/brave/scope.json engagements/current/scope.json
export GEMINI_API_KEY=$(grep ^GEMINI_API_KEY .env | cut -d= -f2)
gemini --model gemini-2.0-flash
```

Then paste:

```
Resuming engagement brave against Brave Software (brave.com and related domains).

Completed stages: [list which stages are done]
Findings so far: [X] findings in engagements/brave/findings/
Priority targets: search.brave.com, account.brave.com, talk.brave.com,
  creators.basicattentiontoken.org, subscriptions.bsg.brave.com
Blocked/flagged for manual review: [list any Cloudfront-blocked targets]

Continue from Stage [N], Step [M].
```