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
> - Node 18+ required for Gemini CLI — script upgrades via NodeSource if needed.

---

## API Keys

| Key | Source | Free Tier |
|-----|--------|-----------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) | 1M req/day (Flash) |
| `CENSYS_API_ID/SECRET` | [censys.io/register](https://censys.io/register) — Research account | 250 queries/mo |
| `FOFA_EMAIL/KEY` | [fofa.info](https://en.fofa.info) | 10k results/mo |
| `VIRUSTOTAL_API_KEY` | [virustotal.com](https://virustotal.com) | 500 req/day |
| `ABUSEIPDB_API_KEY` | [abuseipdb.com](https://abuseipdb.com) | 1,000 checks/day |
| `URLSCAN_API_KEY` | [urlscan.io](https://urlscan.io) | Generous free tier |
| `GITHUB_TOKEN` | GitHub → Settings → Developer Settings → PAT (Fine-grained) | Free |
| `SLACK_WEBHOOK_URL` | [api.slack.com/apps](https://api.slack.com/apps) | Free |
| `DISCORD_WEBHOOK_URL` | Discord channel → Integrations → Webhooks | Free |
| `NTFY_TOPIC` | [ntfy.sh](https://ntfy.sh) — pick a random string | Free |

Register Censys first — research account approval can take 1-2 days.

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

**Gemini CLI can't connect to an MCP server**
```bash
# Test a server directly to see startup errors
node servers/recon/index.js
# Check paths in ~/.gemini/settings.json are correct
```

**nuclei templates outdated**
```bash
nuclei -update-templates
```

**gowitness screenshots blank**
```bash
sudo apt-get install -y chromium-browser
```
