#!/usr/bin/env bash
# Remove everything install.sh put on this machine. Extensions loaded into Chrome profiles
# must be removed from chrome://extensions by hand.
set -euo pipefail
DEST="${BROWSER_HUB_HOME:-$HOME/.local/share/browser-hub}"
BIN="$HOME/.local/bin"
UNIT_DIR="$HOME/.config/systemd/user"

for u in $(systemctl --user list-units --all --plain --no-legend 'browser-hub-tunnel@*' | awk '{print $1}'); do
  systemctl --user disable --now "$u" 2>/dev/null || true
done
systemctl --user disable --now browser-hub.service 2>/dev/null || true
rm -f "$UNIT_DIR/browser-hub.service" "$UNIT_DIR/browser-hub-tunnel@.service"
systemctl --user daemon-reload
for b in browser-hub browser-hub-mcp browserctl browser-hub-tunnel; do rm -f "$BIN/$b"; done
command -v claude >/dev/null && claude mcp remove --scope user browser-hub >/dev/null 2>&1 || true
[ -d "$DEST" ] && rm -rf "$DEST"
echo "removed services, tunnels, commands, MCP registration and $DEST"
