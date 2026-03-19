# Setup Guide

## VM Specs

| | Value |
|---|---|
| **OS** | Ubuntu 24.04 LTS |
| **CPU** | 4 cores (2 processors × 2 cores in VMware) |
| **RAM** | 8192 MB |
| **Disk** | 80 GB SSD |
| **Network** | NAT |

> **Ubuntu 24.04 notes:**
> - Use a Python venv for all pip installs — 24.04 enforces externally-managed Python. `install-tools.sh` handles this automatically.
> - Amass installs via snap on 24.04.
> - testssl.sh is available via apt on 24.04.
> - Node 20 required for Gemini CLI — installed via NodeSource by `install-tools.sh`.
> - AWS CLI installed via official installer, not apt.

---

## API Keys

| Key | Source |
|-----|--------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key — required for `llmrecon` and `reporting` |
| `VIRUSTOTAL_API_KEY` | [virustotal.com](https://virustotal.com) → profile → API key |
| `ABUSEIPDB_API_KEY` | [abuseipdb.com](https://abuseipdb.com) → Account → API |
| `URLSCAN_API_KEY` | [urlscan.io](https://urlscan.io) → Settings → API key |
| `GITHUB_TOKEN` | GitHub → Settings → Developer Settings → Fine-grained PAT → Repository access: All repositories → Contents: read-only |
| `DISCORD_WEBHOOK_URL` | Discord channel → Edit Channel → Integrations → Webhooks → New Webhook |

No Censys account needed — ip-api.com handles IP geolocation and enrichment with no key required.
No FOFA account needed for core functionality.

---

## Environment Setup
```bash
cp .env.example .env
nano .env

mkdir -p ~/.gemini
cp config/settings.example.json ~/.gemini/settings.json
nano ~/.gemini/settings.json
```

Add to `~/.bashrc` so the API key is always exported:
```bash
echo 'export GEMINI_API_KEY=$(grep ^GEMINI_API_KEY ~/Desktop/krayt/.env | cut -d= -f2)' >> ~/.bashrc
source ~/.bashrc
```

---

## Model Selection

krayt is model-agnostic. Pass any model available to your API key at session launch:

```bash
gemini --model gemini-2.0-flash   # fast, efficient
gemini --model gemini-2.5-pro     # higher reasoning
gemini --model MODEL_NAME         # any supported model
```

The `llmrecon` server's judge model is configured separately in `~/.gemini/settings.json` via `LLM_JUDGE_MODEL`. This lets you run a lightweight orchestration model while using a more capable judge, or match them — set both to whatever fits your use case:

```json
"llmrecon": {
  "env": {
    "LLM_JUDGE_MODEL": "gemini-2.0-flash"  // run scripts/set-model.sh to change
  }
}
```

---

## llmrecon Server

`llmrecon` is the only krayt server that makes direct Gemini API calls — for context extraction, payload generation, and injection judging. It has no additional CLI tool dependencies beyond what `install-tools.sh` already installs.

**Requirements:**
- `GEMINI_API_KEY` must be set in `.env` and in the `llmrecon` env block in `~/.gemini/settings.json`
- Node 18+ (already enforced by `install-tools.sh`)
- `@google/generative-ai` npm package — installed globally by `install-tools.sh` and locally by `setup.sh`

**Per-engagement configuration** (optional — add to `engagements/PROGRAM/scope.json`):
```json
"llmrecon": {
  "fingerprint_threshold": 0.55,
  "tiers": ["universal", "context_adapted"],
  "max_payloads_per_tier": 8,
  "stop_on_success": true
}
```

**Environment variables** (set in `~/.gemini/settings.json` under the `llmrecon` server env block):

| Variable | Default | Description |
|---|---|---|
| `LLM_FINGERPRINT_THRESHOLD` | `0.60` | Minimum confidence score to treat an endpoint as a confirmed LLM surface |
| `LLM_MAX_PAYLOADS_PER_TIER` | `4` | Number of LLM-generated payloads per tier (universal payloads are hardcoded) |
| `LLM_PROBE_TIMEOUT_MS` | `15000` | Per-probe HTTP timeout in milliseconds |
| `LLM_JUDGE_MODEL` | `gemini-2.0-flash` | Gemini model used by llmrecon for context extraction, payload generation, and judging. Independent of the orchestration model — separate API call. Run `scripts/set-model.sh MODEL_NAME` to update all references at once. |
| `EVIDENCE_DIR` | `./evidence` | Directory where injection evidence JSON files are saved |

**Token usage note:** Each injection campaign makes multiple Gemini API calls — context extraction (1 call), payload generation (1–2 calls depending on tiers), and one judge call per payload executed. On a target with 8 context-adapted payloads plus 6 universal payloads, expect roughly 16–18 API calls per confirmed surface. Run LLM surface testing as its own stage on targets with multiple text-input endpoints.

---

## Running an Engagement
```bash
cd ~/Desktop/krayt
bash scripts/new-engagement.sh hackerone-programname
nano engagements/hackerone-programname/scope.json
node scripts/validate-scope.js engagements/hackerone-programname/scope.json
gemini --model MODEL_NAME
```

Sample prompts for each stage are in [docs/engagement-prompts.md](../docs/engagement-prompts.md).

Run one stage per session to manage token consumption across a full engagement. Suggested stage order:

1. OSINT + passive recon
2. Subdomain enumeration and DNS resolution
3. Technology fingerprinting and crawling
4. Vulnerability scanning
5. LLM surface testing (`llmrecon`) — run after crawling so endpoint inventory is complete
6. Evidence capture and report drafting

---

## Troubleshooting

**`go: command not found` after install**
```bash
source ~/.bashrc
```

**`pip install` fails with "externally managed environment"**
```bash
source ~/bounty-venv/bin/activate
pip install <package>
```

**`amass: command not found`**
```bash
sudo snap install amass
export PATH=$PATH:/snap/bin
```

**Gemini CLI quota exhausted**
```bash
# Check which model you are using
gemini --model MODEL_NAME
# Wait for daily reset or adjust your quota at aistudio.google.com
```

**GEMINI_API_KEY not picked up**
```bash
export GEMINI_API_KEY=$(grep ^GEMINI_API_KEY .env | cut -d= -f2)
echo $GEMINI_API_KEY   # verify it printed
```

**Gemini CLI can't connect to an MCP server**
```bash
# Test the server directly
SCOPE_FILE=./engagements/current/scope.json node servers/recon/index.js
# Check settings.json paths are correct
cat ~/.gemini/settings.json | python3 -m json.tool
```

**`llmrecon` server fails to start**
```bash
# Verify the package installed correctly
cd servers/llmrecon && npm install
# Test the server directly
GEMINI_API_KEY=$GEMINI_API_KEY \
SCOPE_FILE=./engagements/current/scope.json \
EVIDENCE_DIR=./engagements/current/evidence \
node servers/llmrecon/index.js
```

**`llmrecon` fingerprint scores are all low**

Low scores usually mean the `input_field` parameter doesn't match what the endpoint expects. Common field names to try: `message`, `query`, `prompt`, `input`, `text`, `userMessage`. Check the endpoint's request format in browser devtools or via the `execute_injection` tool with a test payload before running `run_injection_campaign`.

**`llmrecon` judge always returns INCONCLUSIVE**

The endpoint may require authentication or session state. Pass session cookies or tokens via the `extra_headers` parameter as a JSON string:
```
extra_headers: "{\"Cookie\": \"session=abc123\", \"Authorization\": \"Bearer token\"}"
```

**`llmJSON parse failed` error in llmrecon**

The judge or payload generator returned malformed JSON. This occasionally happens if the model response includes extra explanation text. Re-run the failing tool — the low temperature setting (0.1) on `llmJSON` makes this rare but not impossible.

**nuclei `-json` flag error (`flag provided but not defined: -json`)**

Newer versions of nuclei renamed the JSON output flag. Edit `servers/webapp/index.js`
and replace `-json` with `-j` in the `nuclei_scan` tool's safeExec call:
```bash
# Find the line
grep -n "json" servers/webapp/index.js

# The nuclei command should use -j not -json
# Change: nuclei -u ${target} ... -silent -json -timeout 30
# To:     nuclei -u ${target} ... -silent -j -timeout 30
```

**nuclei templates outdated**
```bash
nuclei -update-templates
```

**gowitness screenshots blank**
```bash
sudo apt-get install -y chromium-browser
```