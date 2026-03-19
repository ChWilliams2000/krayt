#!/bin/bash
# =============================================================================
# krayt — API key validation check
# Run from the krayt repo root: bash scripts/check-keys.sh
# =============================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
hdr()  { echo -e "\n${CYAN}── $1 ──────────────────────────${NC}"; }

if [ ! -f .env ]; then
  echo -e "${RED}.env not found — run from krayt repo root${NC}"
  exit 1
fi

source .env 2>/dev/null || true

hdr "GEMINI_API_KEY"
if [ -z "$GEMINI_API_KEY" ]; then
  fail "Not set in .env"
else
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}")
  if [ "$STATUS" = "200" ]; then
    ok "Valid (HTTP 200)"
  elif [ "$STATUS" = "400" ]; then
    fail "Invalid key (HTTP 400)"
  elif [ "$STATUS" = "403" ]; then
    fail "Forbidden — key may be disabled or quota exhausted (HTTP 403)"
  else
    warn "Unexpected status: HTTP $STATUS"
  fi
fi

hdr "VIRUSTOTAL_API_KEY"
if [ -z "$VIRUSTOTAL_API_KEY" ]; then
  warn "Not set — intel server will skip VirusTotal lookups"
else
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-apikey: ${VIRUSTOTAL_API_KEY}" \
    "https://www.virustotal.com/api/v3/domains/example.com")
  if [ "$STATUS" = "200" ]; then
    ok "Valid (HTTP 200)"
  elif [ "$STATUS" = "401" ]; then
    fail "Invalid key (HTTP 401)"
  elif [ "$STATUS" = "429" ]; then
    warn "Rate limited — key is valid but quota hit (HTTP 429)"
  else
    warn "Unexpected status: HTTP $STATUS"
  fi
fi

hdr "ABUSEIPDB_API_KEY"
if [ -z "$ABUSEIPDB_API_KEY" ]; then
  warn "Not set — intel server will skip AbuseIPDB checks"
else
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Key: ${ABUSEIPDB_API_KEY}" \
    -H "Accept: application/json" \
    "https://api.abuseipdb.com/api/v2/check?ipAddress=8.8.8.8&maxAgeInDays=90")
  if [ "$STATUS" = "200" ]; then
    ok "Valid (HTTP 200)"
  elif [ "$STATUS" = "401" ]; then
    fail "Invalid key (HTTP 401)"
  elif [ "$STATUS" = "429" ]; then
    warn "Rate limited — key is valid but daily quota hit (HTTP 429)"
  else
    warn "Unexpected status: HTTP $STATUS"
  fi
fi

hdr "URLSCAN_API_KEY"
if [ -z "$URLSCAN_API_KEY" ]; then
  warn "Not set — intel server will skip URLScan lookups"
else
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "API-Key: ${URLSCAN_API_KEY}" \
    "https://urlscan.io/api/v1/search/?q=domain:example.com&size=1")
  if [ "$STATUS" = "200" ]; then
    ok "Valid (HTTP 200)"
  elif [ "$STATUS" = "400" ]; then
    fail "Invalid key (HTTP 400)"
  elif [ "$STATUS" = "429" ]; then
    warn "Rate limited — key is valid but quota hit (HTTP 429)"
  else
    warn "Unexpected status: HTTP $STATUS"
  fi
fi

hdr "GITHUB_TOKEN"
if [ -z "$GITHUB_TOKEN" ]; then
  warn "Not set — secrets and osint servers will skip GitHub operations"
else
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/user")
  if [ "$STATUS" = "200" ]; then
    SCOPES=$(curl -sI \
      -H "Authorization: token ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/user" | grep -i "x-oauth-scopes" | tr -d '\r')
    ok "Valid (HTTP 200) — $SCOPES"
  elif [ "$STATUS" = "401" ]; then
    fail "Invalid or expired token (HTTP 401)"
  else
    warn "Unexpected status: HTTP $STATUS"
  fi
fi

hdr "DISCORD_WEBHOOK_URL"
if [ -z "$DISCORD_WEBHOOK_URL" ]; then
  warn "Not set — notify server will skip Discord alerts (non-critical)"
else
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$DISCORD_WEBHOOK_URL")
  if [ "$STATUS" = "200" ]; then
    ok "Webhook reachable (HTTP 200)"
  elif [ "$STATUS" = "401" ]; then
    fail "Invalid webhook URL (HTTP 401)"
  elif [ "$STATUS" = "404" ]; then
    fail "Webhook not found — may have been deleted (HTTP 404)"
  else
    warn "Unexpected status: HTTP $STATUS"
  fi
fi

hdr "No-key services (passive check)"
# Shodan InternetDB — no key required
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://internetdb.shodan.io/8.8.8.8")
[ "$STATUS" = "200" ] && ok "Shodan InternetDB reachable" || warn "Shodan InternetDB: HTTP $STATUS"

# ip-api — no key required
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://ip-api.com/json/8.8.8.8")
[ "$STATUS" = "200" ] && ok "ip-api reachable" || warn "ip-api: HTTP $STATUS"

# crt.sh — no key required
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://crt.sh/?q=google.com&output=json")
[ "$STATUS" = "200" ] && ok "crt.sh reachable" || warn "crt.sh: HTTP $STATUS"

# Wayback Machine — no key required
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://web.archive.org/cdx/search/cdx?url=brave.com&limit=1&output=json")
[ "$STATUS" = "200" ] && ok "Wayback Machine reachable" || warn "Wayback Machine: HTTP $STATUS"

echo ""
echo -e "${CYAN}Key check complete.${NC}"
echo "Warnings (⚠) mean optional keys are missing — core functionality still works."
echo "Failures (✗) mean a key is set but invalid — update it in .env and re-run setup."
