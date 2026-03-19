<div align="center">

![krayt banner](docs/images/banner.svg)

**Agentic bug bounty framework powered by Gemini CLI and MCP servers.**
Autonomous recon, scope-enforced scanning, prompt injection testing, and evidence collection for HackerOne.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Ubuntu 24.04](https://img.shields.io/badge/Ubuntu-24.04_LTS-E95420?style=flat-square&logo=ubuntu&logoColor=white)](docs/setup-guide.md)
[![Gemini CLI](https://img.shields.io/badge/Gemini-CLI-4285F4?style=flat-square&logo=google&logoColor=white)](https://github.com/google-gemini/gemini-cli)
[![MCP](https://img.shields.io/badge/MCP-10_servers-0ea5e9?style=flat-square)](servers/)
[![Free Tooling](https://img.shields.io/badge/tooling-free_%2F_open--source-22c55e?style=flat-square)](#api-keys)

</div>

---

## Overview

**krayt** wraps your offensive security tooling as [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers and lets Gemini CLI orchestrate multi-step bug bounty workflows autonomously — deciding what to run next based on what it finds, while staying within your defined program scope at every step.

A single prompt drives a full engagement loop:
```
Run recon against example.com, find live web services, scan for vulnerabilities,
test for LLM-powered endpoints and prompt injection, capture evidence on every
finding, and draft HackerOne reports.
```

Every tool call is scope-validated in code before execution, rate-limited per program rules, and written to a JSONL audit log.

---

## Quick Start
```bash
git clone https://github.com/youruser/krayt
cd krayt
bash scripts/install-tools.sh
source ~/.bashrc
bash scripts/setup.sh
cp .env.example .env && nano .env
cp config/settings.example.json ~/.gemini/settings.json && nano ~/.gemini/settings.json
export GEMINI_API_KEY=$(grep ^GEMINI_API_KEY .env | cut -d= -f2)
bash scripts/new-engagement.sh hackerone-programname
nano engagements/hackerone-programname/scope.json
node scripts/validate-scope.js engagements/hackerone-programname/scope.json
gemini --model gemini-2.0-flash
```

---

## MCP Servers

| Server | Key Tools |
|--------|-----------|
| `recon` | subfinder, amass, httpx, naabu, nmap, dnsx, tlsx, cdncheck, wafw00f, whatweb |
| `intel` | Shodan InternetDB, ip-api geolocation, URLScan, VirusTotal, AbuseIPDB, WHOIS, ASN, crt.sh |
| `webapp` | katana, gospider, ffuf, feroxbuster, nuclei, dalfox, sqlmap, corsy, smuggler, ssrf, redirect |
| `api` | arjun, kiterunner, graphw00f, jwt-tool, nikto, testssl.sh, interactsh |
| `secrets` | trufflehog, gitleaks, jsluice, LinkFinder, subjs, gf, GitHub Search |
| `osint` | Wayback Machine, GitHub org enum, psbdmp, reverse IP, Google dorks, robots/sitemap |
| `evidence` | gowitness, HTTP capture, finding notes |
| `reporting` | HackerOne report drafts, engagement summary |
| `notify` | Discord webhook |
| `llmrecon` | LLM surface fingerprinting, context extraction, payload generation, injection execution, judge scoring |

---

## API Keys

| Key | Source |
|-----|--------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) — required for `llmrecon` and `reporting` |
| `VIRUSTOTAL_API_KEY` | [virustotal.com](https://virustotal.com) |
| `ABUSEIPDB_API_KEY` | [abuseipdb.com](https://abuseipdb.com) |
| `URLSCAN_API_KEY` | [urlscan.io](https://urlscan.io) |
| `GITHUB_TOKEN` | GitHub → Settings → Developer Settings → Fine-grained PAT |
| `DISCORD_WEBHOOK_URL` | Discord channel → Integrations → Webhooks |

Shodan InternetDB and ip-api are used for IP enrichment — both require no key.

---

## Model Selection

krayt is model-agnostic. Pass any model available to your API key at session launch:

```bash
gemini --model gemini-2.0-flash   # default — works on free tier
gemini --model gemini-2.5-pro     # higher reasoning — requires paid tier
```

The `llmrecon` server's judge model is configured independently via `LLM_JUDGE_MODEL` in `~/.gemini/settings.json` — a separate API call that does not inherit the `--model` flag. Default is `gemini-2.0-flash`.

To update all model references across the project at once:

```bash
bash scripts/set-model.sh gemini-2.0-flash   # free tier
bash scripts/set-model.sh gemini-2.5-pro     # paid tier
```

See [docs/setup-guide.md](docs/setup-guide.md) for full model configuration details.

---

## Scope Enforcement

Defined in `engagements/PROGRAM/scope.json`, enforced in code at the tool layer:
```json
{
  "engagement": "Acme Corp — HackerOne",
  "in_scope": { "domains": ["acme.com", "*.acme.com"] },
  "out_of_scope": { "domains": ["careers.acme.com"] },
  "max_requests_per_second": 5,
  "forbidden_test_types": ["dos", "brute-force", "social_engineering"]
}
```

Every tool validates domain wildcards, resolves DNS to catch CDN IPs, enforces rate limits, and blocks forbidden nuclei tags and sqlmap levels. Blocked calls are logged and the agent moves on.

---

## Token Usage

Run one stage per Gemini CLI session to manage token consumption across a full engagement. Launch with:
```bash
export GEMINI_API_KEY=$(grep ^GEMINI_API_KEY .env | cut -d= -f2)
gemini --model MODEL_NAME
```

---

## Audit Log
```bash
# Review all findings
node scripts/review-audit.js audit-logs/engagement-$(date +%Y-%m-%d).jsonl FINDING

# Review scope blocks
node scripts/review-audit.js audit-logs/engagement-$(date +%Y-%m-%d).jsonl TOOL_BLOCKED

# Review all llmrecon activity
node scripts/review-audit.js audit-logs/engagement-$(date +%Y-%m-%d).jsonl INJECTION
```

---

## Legal

For authorized security research only. Only use against programs where you have explicit permission. Always operate within the program's rules of engagement as defined in `scope.json`.
