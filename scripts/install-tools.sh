#!/bin/bash
# =============================================================================
# krayt — full tool installation for Ubuntu 24.04 LTS
# Run once on a fresh VM before running setup.sh
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

# =============================================================================
# 0. Preflight
# =============================================================================
hdr "Preflight checks"

if [ "$EUID" -eq 0 ]; then
  fail "Do not run as root. Run as your normal user — sudo will be called where needed."
  exit 1
fi

UBUNTU_VER=$(lsb_release -rs 2>/dev/null || echo "unknown")
if [[ "$UBUNTU_VER" != "24.04" ]]; then
  warn "Expected Ubuntu 24.04, detected: $UBUNTU_VER. Proceeding anyway."
else
  ok "Ubuntu 24.04 confirmed"
fi

# =============================================================================
# 1. System packages
# =============================================================================
hdr "System packages"

sudo apt-get update -qq
sudo apt-get install -y \
  git curl wget unzip build-essential pkg-config \
  python3 python3-pip python3-venv python3-dev \
  \
  nmap nikto whois dnsutils net-tools \
   libpcap-dev \
  testssl.sh \
  snapd \
  jq \
  ca-certificates gnupg lsb-release

ok "System packages installed"

# AWS CLI — official installer (apt package unreliable on 24.04)
if command -v aws &>/dev/null; then
  ok "aws-cli already installed"
else
  curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && sudo /tmp/aws/install \
    && ok "aws-cli (official installer)" \
    || warn "aws-cli install failed — skipping, not required for core functionality"
  rm -rf /tmp/awscliv2.zip /tmp/aws 2>/dev/null || true
fi

# =============================================================================
# 2. Go
# =============================================================================
hdr "Go language"

sudo apt-get install -y golang-go
GO_VERSION=$(go version 2>/dev/null | awk '{print $3}')
ok "Go installed: $GO_VERSION"

if ! grep -q "GOPATH" ~/.bashrc; then
  echo '' >> ~/.bashrc
  echo '# Go' >> ~/.bashrc
  echo 'export GOPATH=$HOME/go' >> ~/.bashrc
  echo 'export PATH=$PATH:$GOPATH/bin' >> ~/.bashrc
fi
export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin
ok "GOPATH configured"

# =============================================================================
# 3. ProjectDiscovery suite
# =============================================================================
hdr "Go tools — ProjectDiscovery suite"

PD_TOOLS=(
  "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"
  "github.com/projectdiscovery/httpx/cmd/httpx@latest"
  "github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest"
  "github.com/projectdiscovery/katana/cmd/katana@latest"
  "github.com/projectdiscovery/dnsx/cmd/dnsx@latest"
  "github.com/projectdiscovery/naabu/v2/cmd/naabu@latest"
  "github.com/projectdiscovery/tlsx/cmd/tlsx@latest"
  "github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest"
  "github.com/projectdiscovery/interactsh/cmd/interactsh-client@latest"
  "github.com/projectdiscovery/asnmap/cmd/asnmap@latest"
)

for tool in "${PD_TOOLS[@]}"; do
  name=$(basename "$(echo "$tool" | cut -d@ -f1)")
  if go install "$tool" 2>/dev/null; then ok "$name"; else fail "$name"; fi
done

# =============================================================================
# 4. Misc Go tools
# =============================================================================
hdr "Go tools — misc"

MISC_TOOLS=(
  "github.com/tomnomnom/assetfinder@latest"
  "github.com/tomnomnom/gf@latest"
  "github.com/tomnomnom/anew@latest"
  "github.com/tomnomnom/qsreplace@latest"
  "github.com/tomnomnom/httprobe@latest"
  "github.com/lc/subjs@latest"
  "github.com/hakluke/hakrawler@latest"
  "github.com/hahwul/dalfox/v2@latest"
  "github.com/sensepost/gowitness@latest"
  "github.com/ffuf/ffuf/v2@latest"
  "github.com/dwisiswant0/crlfuzz@latest"
  "github.com/assetnote/kiterunner/cmd/kr@latest"
  "github.com/d3mondev/puredns/v2@latest"
  "github.com/BishopFox/jsluice/cmd/jsluice@latest"
)

for tool in "${MISC_TOOLS[@]}"; do
  name=$(basename "$(echo "$tool" | cut -d@ -f1)")
  if go install "$tool" 2>/dev/null; then ok "$name"; else fail "$name"; fi
done

# =============================================================================
# 5. Amass via snap
# =============================================================================
hdr "Amass"

if command -v amass &>/dev/null; then
  ok "amass already installed"
else
  sudo snap install amass 2>/dev/null && ok "amass (snap)" || fail "amass — try: sudo snap install amass"
fi

# =============================================================================
# 6. Feroxbuster
# =============================================================================
hdr "Feroxbuster"

if command -v feroxbuster &>/dev/null; then
  ok "feroxbuster already installed"
else
  FEROX_URL=$(curl -s https://api.github.com/repos/epi052/feroxbuster/releases/latest \
    | jq -r '.assets[] | select(.name | test("x86_64-linux-feroxbuster.zip")) | .browser_download_url')
  if [ -n "$FEROX_URL" ]; then
    wget -q "$FEROX_URL" -O /tmp/feroxbuster.zip
    unzip -q /tmp/feroxbuster.zip feroxbuster -d /tmp
    sudo mv /tmp/feroxbuster /usr/local/bin/feroxbuster
    sudo chmod +x /usr/local/bin/feroxbuster
    rm /tmp/feroxbuster.zip
    ok "feroxbuster"
  else
    fail "feroxbuster — could not fetch release URL"
  fi
fi

# =============================================================================
# 7. Python venv + tools
# =============================================================================
hdr "Python venv + tools"

VENV="$HOME/bounty-venv"

if [ ! -d "$VENV" ]; then
  python3 -m venv "$VENV"
  ok "Created venv at $VENV"
else
  ok "venv already exists"
fi

source "$VENV/bin/activate"

if ! grep -q "bounty-venv" ~/.bashrc; then
  echo '' >> ~/.bashrc
  echo '# krayt python venv' >> ~/.bashrc
  echo "source $VENV/bin/activate" >> ~/.bashrc
fi

pip install -q --upgrade pip

PYTHON_TOOLS=(trufflehog sqlmap arjun graphw00f theHarvester wafw00f)
for tool in "${PYTHON_TOOLS[@]}"; do
  if pip install -q "$tool"; then ok "$tool"; else fail "$tool"; fi
done

# =============================================================================
# 8. Cloned tools
# =============================================================================
hdr "Cloned tools (/opt/tools)"

sudo mkdir -p /opt/tools

declare -A CLONES=(
  ["LinkFinder"]="https://github.com/GerbenJavado/LinkFinder.git"
  ["Corsy"]="https://github.com/s0md3v/Corsy.git"
  ["smuggler"]="https://github.com/defparam/smuggler.git"
  ["SSRFmap"]="https://github.com/swisskyrepo/SSRFmap.git"
  ["OpenRedireX"]="https://github.com/devanshbatham/OpenRedireX.git"
  ["clairvoyance"]="https://github.com/nikitastupin/clairvoyance.git"
)

for name in "${!CLONES[@]}"; do
  dir="/opt/tools/$name"
  if [ -d "$dir" ]; then ok "$name (already cloned)"
  elif sudo git clone -q "${CLONES[$name]}" "$dir" 2>/dev/null; then ok "$name"
  else fail "$name"; fi
done

sudo chown -R "$USER:$USER" /opt/tools

for req in /opt/tools/*/requirements.txt; do
  pip install -q -r "$req" 2>/dev/null || true
done
ok "Python deps for cloned tools"

# gf patterns
if [ ! -d "$HOME/.gf" ]; then
  git clone -q https://github.com/1ndianl33t/Gf-Patterns.git /tmp/gf-patterns 2>/dev/null
  mkdir -p "$HOME/.gf"
  cp /tmp/gf-patterns/*.json "$HOME/.gf/" 2>/dev/null || true
  ok "gf patterns"
else
  ok "gf patterns (already installed)"
fi

# =============================================================================
# 9. SecLists
# =============================================================================
hdr "SecLists"

if [ -d /usr/share/seclists ]; then
  ok "SecLists already installed"
else
  echo "  Cloning SecLists (~500 MB)..."
  sudo git clone -q --depth 1 https://github.com/danielmiessler/SecLists.git /usr/share/seclists
  ok "SecLists"
fi

# =============================================================================
# 10. Gemini CLI
# =============================================================================
hdr "Gemini CLI"

NODE_VER=$(node --version 2>/dev/null | cut -d. -f1 | tr -d 'v')
if [ "${NODE_VER:-0}" -lt 18 ]; then
  warn "Node too old, installing Node 20 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if npm install -g @google/gemini-cli 2>/dev/null; then ok "Gemini CLI"
else fail "Gemini CLI — try: sudo npm install -g @google/gemini-cli"; fi

# =============================================================================
# 11. Nuclei templates
# =============================================================================
hdr "Nuclei templates"

"$GOPATH/bin/nuclei" -update-templates -silent 2>/dev/null \
  && ok "Nuclei templates updated" \
  || warn "Run 'nuclei -update-templates' manually after setup"

# =============================================================================
# 12. Final binary check
# =============================================================================
hdr "Final check"

BINS=(
  subfinder amass httpx nuclei naabu dnsx katana tlsx cdncheck
  interactsh-client asnmap assetfinder gf anew qsreplace hakrawler
  dalfox gowitness ffuf feroxbuster crlfuzz nmap nikto whois
)

MISSING=()
for bin in "${BINS[@]}"; do
  if command -v "$bin" &>/dev/null; then ok "$bin"
  else fail "$bin — NOT FOUND"; MISSING+=("$bin"); fi
done

echo ""
if [ ${#MISSING[@]} -eq 0 ]; then
  echo -e "${GREEN}All tools installed.${NC}"
  echo ""
  echo "Next:"
  echo "  source ~/.bashrc"
  echo "  bash scripts/setup.sh"
else
  echo -e "${YELLOW}${#MISSING[@]} tool(s) missing — review output above.${NC}"
  echo "See docs/setup-guide.md for troubleshooting."
fi
