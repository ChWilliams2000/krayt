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

| Key | Source | Free Tier |
|-----|--------|-----------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key | 1M req/day (Flash) |
| `VIRUSTOTAL_API_KEY` | [virustotal.com](https://virustotal.com) → profile → API key | 500 req/day |
| `ABUSEIPDB_API_KEY` | [abuseipdb.com](https://abuseipdb.com) → Account → API | 1,000 checks/day |
| `URLSCAN_API_KEY` | [urlscan.io](https://urlscan.io) → Settings → API key | Generous free tier |
| `GITHUB_TOKEN` | GitHub → Settings → Developer Settings → Fine-grained PAT → Repository access: All repositories → Contents: read-only | Free |
| `DISCORD_WEBHOOK_URL` | Discord channel → Edit Channel → Integrations → Webhooks → New Webhook | Free |

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

## Running an Engagement
```bash
cd ~/Desktop/krayt
bash scripts/new-engagement.sh hackerone-programname
nano engagements/hackerone-programname/scope.json
node scripts/validate-scope.js engagements/hackerone-programname/scope.json
gemini --model gemini-2.0-flash
```

Use stage-based prompts from `brave-engagement-prompts.md` (or create program-specific versions).
Run one stage per session to stay within Gemini free tier daily quota limits.

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
gemini --model gemini-2.0-flash
# If still hitting limits, wait for daily reset at midnight Pacific
# Or add billing at aistudio.google.com
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

**nuclei templates outdated**
```bash
nuclei -update-templates
```

**gowitness screenshots blank**
```bash
sudo apt-get install -y chromium-browser
```
