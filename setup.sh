#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Antigravity Second Brain — setup.sh
# Interactive setup: install deps, configure API key, register projects.
#
# Usage:
#   bash setup.sh          full interactive setup
#   bash setup.sh --reset  reconfigure everything from scratch
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_PY="$SCRIPT_DIR/src/brain_scan.py"
BRAIN_JSON="$SCRIPT_DIR/brain.json"

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "  ${GREEN}✅${RESET} $*"; }
warn()    { echo -e "  ${YELLOW}⚠️ ${RESET} $*"; }
error()   { echo -e "  ${RED}❌${RESET} $*"; }
section() { echo -e "\n${BOLD}$*${RESET}\n$(printf '%.0s─' {1..50})"; }
ask()     { echo -ne "  ${CYAN}?${RESET} $* "; }

# ── Detect shell rc file ──────────────────────────────────────────────────────
detect_shell_rc() {
  if [ -f "$HOME/.zshrc" ]; then echo "$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then echo "$HOME/.bashrc"
  elif [ -f "$HOME/.bash_profile" ]; then echo "$HOME/.bash_profile"
  else echo "$HOME/.bashrc"
  fi
}
SHELL_RC=$(detect_shell_rc)

# ── Header ────────────────────────────────────────────────────────────────────
clear
echo ""
echo -e "  ${BOLD}🧠 Antigravity Second Brain${RESET}  ${DIM}v2.0.0${RESET}"
echo -e "  ${DIM}Knowledge graph powered by Gemini AI${RESET}"
echo ""

# ── Step 1: Python ────────────────────────────────────────────────────────────
section "Step 1 — Python"
if ! command -v python3 &>/dev/null; then
  error "Python 3 not found."
  echo "     Install from: https://python.org"
  exit 1
fi
PY_VERSION=$(python3 --version | cut -d' ' -f2)
PY_MAJOR=$(echo "$PY_VERSION" | cut -d'.' -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d'.' -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 8 ]; }; then
  error "Python 3.8+ required. Found: $PY_VERSION"
  exit 1
fi
info "Python $PY_VERSION found"

PYTHON_BIN="python3"
PYTHON_CMD=("$PYTHON_BIN")
VENV_DIR="$SCRIPT_DIR/.venv"

# ── Step 2: Dependencies ──────────────────────────────────────────────────────
section "Step 2 — Dependencies"
echo -e "  ${DIM}Installing via requirements.txt...${RESET}"

ensure_pip_for_python() {
  local py_bin="$1"
  if "$py_bin" -m pip --version >/dev/null 2>&1; then
    return 0
  fi

  warn "pip not found for $py_bin. Bootstrapping with ensurepip..."
  if "$py_bin" -m ensurepip --upgrade >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

install_venv_support_if_possible() {
  if ! command -v apt-get >/dev/null 2>&1; then
    return 1
  fi

  echo ""
  warn "Your system is missing Python venv support required by Debian/Ubuntu."
  ask "Install required OS packages now with sudo? (y/n):"
  read -r INSTALL_OS_PACKAGES

  if [ "$INSTALL_OS_PACKAGES" != "y" ] && [ "$INSTALL_OS_PACKAGES" != "Y" ]; then
    return 1
  fi

  if ! command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
    error "sudo is not available. Install manually: apt install python3-venv python3-pip"
    return 1
  fi

  local -a SUDO_CMD=()
  if [ "$(id -u)" -ne 0 ]; then
    SUDO_CMD=(sudo)
  fi

  info "Installing system packages (may ask for your password)..."
  "${SUDO_CMD[@]}" apt-get update >/dev/null

  if "${SUDO_CMD[@]}" apt-get install -y "python${PY_MAJOR}.${PY_MINOR}-venv" python3-pip >/dev/null 2>&1 \
     || "${SUDO_CMD[@]}" apt-get install -y python3-venv python3-pip >/dev/null 2>&1; then
    info "System packages installed"
    return 0
  fi

  error "Could not install required OS packages automatically."
  echo "     Try manually: sudo apt update && sudo apt install -y python3-venv python3-pip"
  return 1
}

# Resolve pip in a cross-platform way, including WSL where `pip` may be absent.
PIP_CMD=()
if python3 -m pip --version >/dev/null 2>&1; then
  PIP_CMD=(python3 -m pip)
elif command -v pip3 >/dev/null 2>&1; then
  PIP_CMD=(pip3)
elif command -v pip >/dev/null 2>&1; then
  PIP_CMD=(pip)
else
  error "pip is not available in this shell."
  echo "     Install with: sudo apt install python3-pip"
  echo "     Or run manually: python3 -m ensurepip --upgrade"
  exit 1
fi

if ! "${PIP_CMD[@]}" install -r "$SCRIPT_DIR/requirements.txt" --quiet --user 2>/dev/null; then
  warn "Failed with --user flag. Trying without..."
  if ! "${PIP_CMD[@]}" install -r "$SCRIPT_DIR/requirements.txt" --quiet; then
    warn "System Python is locked (PEP 668) or installation failed. Trying virtual environment..."
    if [ ! -d "$VENV_DIR" ]; then
      if ! python3 -m venv "$VENV_DIR"; then
        warn "Initial virtual environment creation failed."
        if install_venv_support_if_possible; then
          rm -rf "$VENV_DIR"
          if ! python3 -m venv "$VENV_DIR"; then
            error "Could not create virtual environment at $VENV_DIR"
            echo "     Run manually: sudo apt install python3-venv python3-pip"
            exit 1
          fi
        else
          error "Could not create virtual environment at $VENV_DIR"
          echo "     Install venv support: sudo apt install python3-venv python3-pip"
          exit 1
        fi
      fi
      info "Virtual environment created at $VENV_DIR"
    else
      info "Using existing virtual environment at $VENV_DIR"
    fi

    PYTHON_BIN="$VENV_DIR/bin/python"
    PYTHON_CMD=("$PYTHON_BIN")
    PIP_CMD=("$PYTHON_BIN" -m pip)

    if ! ensure_pip_for_python "$PYTHON_BIN"; then
      error "Virtual environment exists, but pip is unavailable."
      echo "     Remove and recreate: rm -rf $VENV_DIR && python3 -m venv $VENV_DIR"
      echo "     If it still fails, install: sudo apt install python3-venv python3-full"
      exit 1
    fi

    if ! "${PIP_CMD[@]}" install -r "$SCRIPT_DIR/requirements.txt" --quiet; then
      error "Could not install dependencies."
      echo "     Run manually: $PYTHON_BIN -m pip install -r $SCRIPT_DIR/requirements.txt"
      exit 1
    fi
  fi
fi
info "Dependencies installed"

# ── Step 3: brain.json ────────────────────────────────────────────────────────
section "Step 3 — Brain file"
if [ ! -f "$BRAIN_JSON" ]; then
  echo '{"nodes":[],"edges":[],"meta":{"version":"2.0.0","scans":0}}' > "$BRAIN_JSON"
  info "brain.json created at $BRAIN_JSON"
else
  info "brain.json already exists — keeping data"
fi

# ── Step 4: API Key ───────────────────────────────────────────────────────────
section "Step 4 — Gemini API Key"

if [ "${1:-}" = "--reset" ] || [ -z "${GEMINI_API_KEY:-}" ]; then
  if [ -n "${GEMINI_API_KEY:-}" ] && [ "${1:-}" != "--reset" ]; then
    info "GEMINI_API_KEY already configured"
  else
    echo -e "  Get your free key at: ${CYAN}https://aistudio.google.com${RESET}"
    echo -e "  ${DIM}Click 'Get API Key' → 'Create API Key'${RESET}"
    echo ""
    ask "Paste your GEMINI_API_KEY (or press Enter to skip):"
    read -r API_KEY_INPUT

    if [ -n "$API_KEY_INPUT" ]; then
      # basic format check
      if [[ ! "$API_KEY_INPUT" =~ ^AI[a-zA-Z0-9_\-]{20,}$ ]]; then
        warn "Unusual key format. Double-check you copied it correctly."
      fi
      # avoid duplicates in shell rc
      if grep -q "GEMINI_API_KEY" "$SHELL_RC" 2>/dev/null; then
        # update existing line
        sed -i.bak "s|export GEMINI_API_KEY=.*|export GEMINI_API_KEY=\"$API_KEY_INPUT\"|" "$SHELL_RC"
        rm -f "${SHELL_RC}.bak"
        info "GEMINI_API_KEY updated in $SHELL_RC"
      else
        { echo ""; echo "# Antigravity Second Brain"; echo "export GEMINI_API_KEY=\"$API_KEY_INPUT\""; } >> "$SHELL_RC"
        info "GEMINI_API_KEY saved to $SHELL_RC"
      fi
      export GEMINI_API_KEY="$API_KEY_INPUT"
    else
      warn "Skipped. Set it later with: export GEMINI_API_KEY='your-key'"
    fi
  fi
else
  info "GEMINI_API_KEY already configured"
fi

# ── Step 5: Shell alias ───────────────────────────────────────────────────────
section "Step 5 — Shell alias"
BRAIN_ALIAS="alias brain='\"$PYTHON_BIN\" \"$BRAIN_PY\"'"

if grep -q "alias brain=" "$SHELL_RC" 2>/dev/null; then
  # update existing alias to point to current path
  sed -i.bak "s|alias brain=.*|$BRAIN_ALIAS|" "$SHELL_RC"
  rm -f "${SHELL_RC}.bak"
  info "alias 'brain' updated in $SHELL_RC"
else
  { echo ""; echo "# Antigravity Second Brain"; echo "$BRAIN_ALIAS"; } >> "$SHELL_RC"
  info "alias 'brain' created in $SHELL_RC"
fi

# ── Step 6: Register projects ─────────────────────────────────────────────────
section "Step 6 — Register your projects"
echo -e "  ${DIM}Let's add your projects so you can use 'brain use <name>'${RESET}"
echo ""

register_project() {
  local name="$1"
  local path="$2"
  "${PYTHON_CMD[@]}" "$BRAIN_PY" register "$name" "$path" --output "$BRAIN_JSON" 2>/dev/null \
    && info "Registered: $name → $path" \
    || warn "Could not register $name (path may not exist)"
}

# auto-detect projects in common folders
AUTO_DETECTED=()
for base in "$HOME/projects" "$HOME/projetos" "$HOME/dev" "$HOME/code" "$HOME/workspace"; do
  if [ -d "$base" ]; then
    while IFS= read -r dir; do
      AUTO_DETECTED+=("$dir")
    done < <(find "$base" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | head -20)
  fi
done

if [ ${#AUTO_DETECTED[@]} -gt 0 ]; then
  echo -e "  ${DIM}Found these folders — select which to register:${RESET}"
  echo ""
  for i in "${!AUTO_DETECTED[@]}"; do
    echo -e "    ${CYAN}[$((i+1))]${RESET} ${AUTO_DETECTED[$i]}"
  done
  echo -e "    ${CYAN}[a]${RESET} Register all"
  echo -e "    ${CYAN}[s]${RESET} Skip / enter path manually"
  echo ""
  ask "Your choice (numbers separated by space, or a/s):"
  read -r CHOICE

  if [ "$CHOICE" = "a" ]; then
    for dir in "${AUTO_DETECTED[@]}"; do
      name=$(basename "$dir")
      register_project "$name" "$dir"
    done
  elif [ "$CHOICE" = "s" ]; then
    :  # fall through to manual
  else
    for num in $CHOICE; do
      idx=$((num - 1))
      if [ "$idx" -ge 0 ] && [ "$idx" -lt "${#AUTO_DETECTED[@]}" ]; then
        dir="${AUTO_DETECTED[$idx]}"
        name=$(basename "$dir")
        register_project "$name" "$dir"
      fi
    done
  fi
fi

# manual project entry
echo ""
ask "Add a project manually? Enter path (or press Enter to skip):"
read -r MANUAL_PATH
if [ -n "$MANUAL_PATH" ] && [ -d "$MANUAL_PATH" ]; then
  ask "Project name:"
  read -r MANUAL_NAME
  if [ -n "$MANUAL_NAME" ]; then
    register_project "$MANUAL_NAME" "$MANUAL_PATH"
  fi
fi

# ── Step 7: First scan (optional) ─────────────────────────────────────────────
section "Step 7 — First scan"
PROJECTS_JSON="$SCRIPT_DIR/projects.json"
if [ -f "$PROJECTS_JSON" ]; then
  PROJ_COUNT=$("${PYTHON_CMD[@]}" -c "import json; d=json.load(open('$PROJECTS_JSON')); print(len(d))" 2>/dev/null || echo "0")
  if [ "$PROJ_COUNT" -gt 0 ]; then
    ask "Run first scan now? (y/n):"
    read -r DO_SCAN
    if [ "$DO_SCAN" = "y" ] || [ "$DO_SCAN" = "Y" ]; then
      source "$SHELL_RC" 2>/dev/null || true
      "${PYTHON_CMD[@]}" "$BRAIN_PY" projects --output "$BRAIN_JSON"
      echo ""
      ask "Enter project name to scan (from list above):"
      read -r SCAN_NAME
      if [ -n "$SCAN_NAME" ]; then
        "${PYTHON_CMD[@]}" "$BRAIN_PY" use "$SCAN_NAME" --output "$BRAIN_JSON" \
          && info "First scan complete!" \
          || warn "Scan failed. Try later with: brain use $SCAN_NAME"
      fi
    fi
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  🎉 Setup complete!${RESET}"
echo ""
echo -e "  ${BOLD}Reload your terminal:${RESET}"
echo -e "    ${CYAN}source $SHELL_RC${RESET}"
echo ""
echo -e "  ${BOLD}Available commands:${RESET}"
echo -e "    ${CYAN}brain scan .${RESET}                        scan current folder"
echo -e "    ${CYAN}brain scan ~/my-project${RESET}             scan specific folder"
echo -e "    ${CYAN}brain watch ~/my-project${RESET}            auto-scan on file changes"
echo -e "    ${CYAN}brain use <name>${RESET}                    scan a registered project"
echo -e "    ${CYAN}brain projects${RESET}                      list registered projects"
echo -e "    ${CYAN}brain register <name> <path>${RESET}        register a new project"
echo -e "    ${CYAN}brain add 'Redis' 'Cache' 'tech'${RESET}    add a node manually"
echo -e "    ${CYAN}brain clear${RESET}                         reset brain.json"
echo ""
echo -e "  ${BOLD}Open the visual graph:${RESET}"
echo -e "    ${CYAN}open $SCRIPT_DIR/brain_viewer.html${RESET}  (macOS)"
echo -e "    ${CYAN}xdg-open $SCRIPT_DIR/brain_viewer.html${RESET}  (Linux)"
echo ""
echo -e "  ${DIM}Load the AGENT_PROMPT.md as system context in Antigravity${RESET}"
echo -e "  ${DIM}to enable automatic brain consultation on every prompt.${RESET}"
echo ""
