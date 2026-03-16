#!/usr/bin/env bash
# One-click setup for interactive-video skill.
# Detects platform, installs missing dependencies, verifies everything works.
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
step() { echo -e "\n${YELLOW}[$1]${NC} $2"; }

echo ""
echo "Interactive Video Skill — Setup"
echo "================================"

# ── 1. Detect platform ──
step 1 "Detecting platform"
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Darwin) PLATFORM="macos"; ok "macOS ($ARCH)" ;;
  Linux)  PLATFORM="linux"; ok "Linux ($ARCH)" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows"; ok "Windows (via $OS)" ;;
  *) fail "Unknown platform: $OS"; exit 1 ;;
esac

# ── 2. Check Node.js ──
step 2 "Checking Node.js"
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    fail "Node.js $NODE_VER is too old (need 18+)"
    echo "  Update from: https://nodejs.org/"
    exit 1
  fi
  ok "Node.js $NODE_VER"
else
  fail "Node.js not found"
  echo "  Install from: https://nodejs.org/"
  if [ "$PLATFORM" = "macos" ]; then
    echo "  Or: brew install node"
  elif [ "$PLATFORM" = "linux" ]; then
    echo "  Or: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs"
  fi
  exit 1
fi

# ── 3. Check/install edge-tts ──
step 3 "Checking edge-tts"
if command -v edge-tts &>/dev/null; then
  EDGE_VER=$(edge-tts --version 2>/dev/null || echo "installed")
  ok "edge-tts ($EDGE_VER)"
else
  warn "edge-tts not found — installing..."

  # Try pipx first (cleanest), then pip with --user, then pip with --break-system-packages
  if command -v pipx &>/dev/null; then
    pipx install edge-tts && ok "Installed via pipx"
  elif command -v pip3 &>/dev/null; then
    pip3 install --user edge-tts 2>/dev/null && ok "Installed via pip3 --user" || {
      # Last resort: install pipx first
      if [ "$PLATFORM" = "macos" ] && command -v brew &>/dev/null; then
        brew install pipx && pipx install edge-tts && ok "Installed via brew+pipx"
      elif [ "$PLATFORM" = "linux" ]; then
        sudo apt-get install -y pipx 2>/dev/null && pipx install edge-tts && ok "Installed via apt+pipx" || {
          fail "Could not install edge-tts. Please install manually: pipx install edge-tts"
          exit 1
        }
      else
        fail "Could not install edge-tts. Please install manually: pipx install edge-tts"
        exit 1
      fi
    }
  elif command -v pip &>/dev/null; then
    pip install --user edge-tts && ok "Installed via pip --user"
  else
    fail "No pip/pipx found. Install Python first, then: pipx install edge-tts"
    exit 1
  fi

  # Verify it's now available
  if ! command -v edge-tts &>/dev/null; then
    # Check common pipx/pip user paths
    for p in "$HOME/.local/bin" $HOME/Library/Python/3.*/bin; do
      if ls $p/edge-tts 2>/dev/null; then
        warn "edge-tts installed but not in PATH. Add to your shell config:"
        echo "  export PATH=\"$p:\$PATH\""
        break
      fi
    done
    fail "edge-tts installed but not found in PATH"
    exit 1
  fi
fi

# ── 4. Check npx (comes with Node) ──
step 4 "Checking npx"
if command -v npx &>/dev/null; then
  ok "npx available"
else
  fail "npx not found (should come with Node.js). Reinstall Node."
  exit 1
fi

# ── 5. Quick smoke test — audio generation ──
step 5 "Smoke test (audio)"
TMPFILE=$(mktemp /tmp/iv-test-XXXXXX.mp3)
edge-tts --text "Setup complete" --voice en-US-AriaNeural --write-media "$TMPFILE" 2>/dev/null
if [ -f "$TMPFILE" ] && [ -s "$TMPFILE" ]; then
  ok "TTS generates audio successfully"
  rm -f "$TMPFILE"
else
  fail "TTS smoke test failed"
  rm -f "$TMPFILE"
  exit 1
fi

# ── 6. Smoke test — voice listing parser ──
step 6 "Smoke test (voice list parser)"
VOICE_COUNT=$(edge-tts --list-voices 2>/dev/null | grep -c "Neural" || echo "0")
if [ "$VOICE_COUNT" -gt 100 ]; then
  ok "Voice list parsed: $VOICE_COUNT voices available"
else
  warn "Voice list may have changed format ($VOICE_COUNT voices detected)"
  warn "Voice previews in the configurator may not work."
  warn "Please report this issue — include output of: edge-tts --list-voices | head -5"
fi

echo ""
echo -e "${GREEN}Setup complete!${NC} Run: /interactive-video <source>"
echo ""
