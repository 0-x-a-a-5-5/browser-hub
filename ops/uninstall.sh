#!/usr/bin/env bash
# Remove everything install.sh put on this machine. Extensions loaded into Chrome profiles
# must be removed from chrome://extensions by hand.
set -euo pipefail
DEST="${BROWSER_HUB_HOME:-$HOME/.local/share/browser-hub}"
BIN="$HOME/.local/bin"
UNIT="$HOME/.config/systemd/user/browser-hub.service"

systemctl --user disable --now browser-hub.service 2>/dev/null || true
rm -f "$UNIT"
systemctl --user daemon-reload
for b in browser-hub browser-hub-mcp browserctl; do rm -f "$BIN/$b"; done
command -v claude >/dev/null && claude mcp remove --scope user browser-hub >/dev/null 2>&1 || true
[ -d "$DEST" ] && rm -rf "$DEST"
echo "removed service, commands, MCP registration and $DEST"
