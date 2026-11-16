#!/usr/bin/env bash
set -euo pipefail

# The installer https://www.lazyweb.com/install.sh served before setup took
# --email, kept so a test can run it against the current setup. Its leading
# documentation comment is left out, and its experiment token and journey ID
# are placeholders. The rest is unchanged.

REPO="${LAZYWEB_SKILL_REPO:-https://github.com/aboul3ata/lazyweb-skill}"
TARGET="${LAZYWEB_SKILL_DIR:-$HOME/.lazyweb/repos/lazyweb-skill}"

if ! command -v git >/dev/null 2>&1; then
  printf '%s\n' "Lazyweb installer requires git." >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"

if [ -d "$TARGET/.git" ]; then
  # Match remote main from any branch/divergence (escapes the branch trap).
  git -C "$TARGET" fetch --depth 1 origin main
  git -C "$TARGET" checkout -q -B main FETCH_HEAD
  git -C "$TARGET" reset --hard FETCH_HEAD
else
  rm -rf "$TARGET"
  git clone --depth 1 "$REPO" "$TARGET"
fi

export LAZYWEB_MCP_URL="${LAZYWEB_MCP_URL:-https://www.lazyweb.com/mcp}"
export LAZYWEB_INSTALL_TOKEN_URL="${LAZYWEB_INSTALL_TOKEN_URL:-https://www.lazyweb.com/api/mcp/install-token?install_channel=curl}"
export LAZYWEB_MCP_WELCOME_URL="${LAZYWEB_MCP_WELCOME_URL:-https://www.lazyweb.com/api/mcp/welcome-message}"

attribution_args=()
if [ "$#" -gt 0 ]; then
  attribution_args+=(--install-attribution)
fi

"$TARGET/setup" --host auto   --install-experiment-token "placeholder-experiment-token" \
  --journey-id "00000000-0000-4000-8000-000000000000" \
  "${attribution_args[@]}" "$@"

if command -v curl >/dev/null 2>&1; then
  printf '\n%s\n' "Lazyweb welcome message:"
  if [ -n "${LAZYWEB_MCP_TOKEN:-}" ]; then
    curl -fsSL -H "Authorization: Bearer ${LAZYWEB_MCP_TOKEN}" "$LAZYWEB_MCP_WELCOME_URL" || true
  else
    curl -fsSL "$LAZYWEB_MCP_WELCOME_URL" || true
  fi
  printf '\n'
fi
