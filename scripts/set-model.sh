#!/bin/bash
# =============================================================================
# krayt — update all model references across the project
# Usage: bash scripts/set-model.sh MODEL_NAME
# Example: bash scripts/set-model.sh gemini-2.0-flash   # free tier
#          bash scripts/set-model.sh gemini-2.5-pro     # paid tier
#          bash scripts/set-model.sh gemini-2.5-flash   # any supported model
#
# Updates:
#   - config/settings.example.json   (LLM_JUDGE_MODEL env var)
#   - ~/.gemini/settings.json        (LLM_JUDGE_MODEL env var, if present)
#   - shared/llm-client.js           (fallback default in llmCall)
#   - servers/llmrecon/index.js      (fallback default in CONFIG)
#   - docs/setup-guide.md            (example snippet)
#   - docs/engagement-prompts.md     (launch instructions)
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

MODEL="${1}"

if [ -z "$MODEL" ]; then
  echo -e "${RED}Usage: bash scripts/set-model.sh MODEL_NAME${NC}"
  echo ""
  echo "Examples:"
  echo "  bash scripts/set-model.sh gemini-2.0-flash   # free tier"
  echo "  bash scripts/set-model.sh gemini-2.5-pro     # paid tier"
  echo "  bash scripts/set-model.sh gemini-2.5-flash   # any supported model"
  exit 1
fi

# Validate model name looks reasonable
if [[ ! "$MODEL" =~ ^gemini- ]]; then
  warn "Model name '$MODEL' does not start with 'gemini-' — proceeding anyway"
fi

echo ""
echo -e "${CYAN}Setting model to: ${GREEN}${MODEL}${NC}"

# Detect current model from settings.example.json
CURRENT=$(grep '"LLM_JUDGE_MODEL"' config/settings.example.json \
  | head -1 \
  | sed 's/.*"LLM_JUDGE_MODEL": "\([^"]*\)".*/\1/')

if [ -z "$CURRENT" ]; then
  CURRENT="gemini-2.0-flash"
fi

echo -e "  Current model: ${YELLOW}${CURRENT}${NC}"

if [ "$CURRENT" = "$MODEL" ]; then
  echo -e "  ${YELLOW}Already set to ${MODEL} — nothing to do.${NC}"
  exit 0
fi

# =============================================================================
# 1. config/settings.example.json
# =============================================================================
hdr "config/settings.example.json"

if [ -f "config/settings.example.json" ]; then
  sed -i "s/\"LLM_JUDGE_MODEL\": \"${CURRENT}\"/\"LLM_JUDGE_MODEL\": \"${MODEL}\"/" \
    config/settings.example.json \
    && ok "LLM_JUDGE_MODEL → ${MODEL}" \
    || fail "Failed to update settings.example.json"
else
  warn "config/settings.example.json not found — skipping"
fi

# =============================================================================
# 2. ~/.gemini/settings.json (live config)
# =============================================================================
hdr "~/.gemini/settings.json"

LIVE_SETTINGS="$HOME/.gemini/settings.json"
if [ -f "$LIVE_SETTINGS" ]; then
  if grep -q "LLM_JUDGE_MODEL" "$LIVE_SETTINGS"; then
    sed -i "s/\"LLM_JUDGE_MODEL\": \"[^\"]*\"/\"LLM_JUDGE_MODEL\": \"${MODEL}\"/" \
      "$LIVE_SETTINGS" \
      && ok "LLM_JUDGE_MODEL → ${MODEL}" \
      || fail "Failed to update ~/.gemini/settings.json"
  else
    warn "LLM_JUDGE_MODEL not found in ~/.gemini/settings.json — add it manually under llmrecon env"
  fi
else
  warn "~/.gemini/settings.json not found — skipping (run setup.sh first)"
fi

# =============================================================================
# 3. shared/llm-client.js
# =============================================================================
hdr "shared/llm-client.js"

if [ -f "shared/llm-client.js" ]; then
  sed -i "s/{ model = \"${CURRENT}\", temperature/{ model = \"${MODEL}\", temperature/" \
    shared/llm-client.js \
    && ok "llmCall default → ${MODEL}" \
    || fail "Failed to update shared/llm-client.js"
else
  warn "shared/llm-client.js not found — skipping"
fi

# =============================================================================
# 4. servers/llmrecon/index.js
# =============================================================================
hdr "servers/llmrecon/index.js"

if [ -f "servers/llmrecon/index.js" ]; then
  sed -i "s/process.env.LLM_JUDGE_MODEL[[:space:]]*||[[:space:]]*\"${CURRENT}\"/process.env.LLM_JUDGE_MODEL || \"${MODEL}\"/" \
    servers/llmrecon/index.js \
    && ok "CONFIG.judge_model default → ${MODEL}" \
    || fail "Failed to update servers/llmrecon/index.js"
else
  warn "servers/llmrecon/index.js not found — skipping"
fi

# =============================================================================
# 5. docs/setup-guide.md
# =============================================================================
hdr "docs/setup-guide.md"

if [ -f "docs/setup-guide.md" ]; then
  sed -i "s/\"LLM_JUDGE_MODEL\": \"${CURRENT}\"/\"LLM_JUDGE_MODEL\": \"${MODEL}\"/" \
    docs/setup-guide.md \
    && ok "Example snippet → ${MODEL}" \
    || fail "Failed to update docs/setup-guide.md"
else
  warn "docs/setup-guide.md not found — skipping"
fi

# =============================================================================
# 6. docs/engagement-prompts.md
# =============================================================================
hdr "docs/engagement-prompts.md"

if [ -f "docs/engagement-prompts.md" ]; then
  sed -i "s/gemini --model ${CURRENT}/gemini --model ${MODEL}/g" \
    docs/engagement-prompts.md \
    && ok "Launch instructions → ${MODEL}" \
    || fail "Failed to update docs/engagement-prompts.md"
else
  warn "docs/engagement-prompts.md not found — skipping"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}Model updated: ${CURRENT} → ${MODEL}${NC}"
echo ""
echo "Changes take effect immediately for:"
echo "  - llmrecon server (reads LLM_JUDGE_MODEL from settings.json at startup)"
echo "  - shared/llm-client.js fallback default"
echo ""
echo "To apply to a running Gemini CLI session, restart it:"
echo "  gemini --model ${MODEL}"
