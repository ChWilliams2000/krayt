#!/bin/bash
# =============================================================================
# krayt — repo setup
# Run from the repo root after install-tools.sh
# =============================================================================
set -e
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
hdr()  { echo -e "\n${CYAN}── $1 ──────────────────────────${NC}"; }
if [ ! -f "GEMINI.md" ]; then
  echo -e "${RED}Run from the krayt repo root directory.${NC}"
  exit 1
fi
# =============================================================================
# Node deps
# =============================================================================
hdr "Installing Node dependencies"
(cd shared && npm install --silent) && ok "shared (node-fetch, ip-range-check, minimatch)"
for server in servers/recon servers/intel servers/webapp servers/api \
              servers/secrets servers/osint servers/evidence \
              servers/reporting servers/notify servers/llmrecon; do
  (cd "$server" && npm install --silent) && ok "$server"
done
# =============================================================================
# Runtime directories
# =============================================================================
hdr "Runtime directories"
mkdir -p audit-logs engagements/current
touch audit-logs/.gitkeep engagements/.gitkeep
ok "audit-logs/ and engagements/ ready"
# =============================================================================
# Config check
# =============================================================================
hdr "Configuration"
if [ -f ~/.gemini/settings.json ]; then ok "~/.gemini/settings.json exists"
else
  warn "~/.gemini/settings.json not found"
  mkdir -p ~/.gemini
  echo "  → cp config/settings.example.json ~/.gemini/settings.json"
fi
if [ -f .env ]; then ok ".env exists"
else warn ".env not found — cp .env.example .env"; fi
# =============================================================================
# Binary spot-check
# =============================================================================
hdr "Binary spot-check"
CRITICAL=(subfinder httpx nuclei ffuf gowitness dalfox gf amass gemini)
ALL_OK=true
for bin in "${CRITICAL[@]}"; do
  if command -v "$bin" &>/dev/null; then ok "$bin"
  else fail "$bin — not found (run scripts/install-tools.sh)"; ALL_OK=false; fi
done
VENV="$HOME/bounty-venv"
if [ -d "$VENV" ]; then ok "Python venv"
else warn "Python venv missing — run scripts/install-tools.sh"; fi
for tool in LinkFinder Corsy smuggler SSRFmap OpenRedireX; do
  if [ -d "/opt/tools/$tool" ]; then ok "/opt/tools/$tool"
  else warn "/opt/tools/$tool missing — run scripts/install-tools.sh"; fi
done
# =============================================================================
# llmrecon API key check
# =============================================================================
hdr "llmrecon check"
if [ -f .env ] && grep -q "^GEMINI_API_KEY=.\+" .env 2>/dev/null; then
  ok "GEMINI_API_KEY present — llmrecon server ready"
else
  warn "GEMINI_API_KEY not set in .env — llmrecon and reporting servers will not function"
  echo "  → Get a free key at https://aistudio.google.com"
  echo "  → Add to .env: GEMINI_API_KEY=your_key_here"
fi
# =============================================================================
# Done
# =============================================================================
echo ""
if $ALL_OK; then
  echo -e "${GREEN}Setup complete.${NC}"
  echo ""
  echo "Verify API keys:"
  echo "  bash scripts/check-keys.sh"
  echo ""
  echo "Start an engagement:"
  echo "  bash scripts/new-engagement.sh PROGRAM_NAME"
else
  echo -e "${YELLOW}Setup complete with warnings — address missing tools first.${NC}"
  echo ""
  echo "Verify API keys once tools are resolved:"
  echo "  bash scripts/check-keys.sh"
fi