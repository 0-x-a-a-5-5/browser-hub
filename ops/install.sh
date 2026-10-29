#!/usr/bin/env bash
# Install (or update) Browser Hub on this machine.
#
#   ops/install.sh            deploy to ~/.local/share/browser-hub (override: BROWSER_HUB_HOME=/path)
#
# What it does, all idempotent:
#   1. copies hub/ extension/ docs/ README.md into the install dir (unless run from there already)
#   2. npm install --omit=dev inside it
#   3. symlinks browser-hub, browser-hub-mcp, browserctl into ~/.local/bin
#   4. installs + (re)starts the systemd user unit browser-hub.service
#   5. registers the MCP server with Claude Code (user scope) when `claude` is on PATH
# Loading the extension into each Chrome profile stays manual (Chrome offers no API for it).
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${BROWSER_HUB_HOME:-$HOME/.local/share/browser-hub}"
BIN="$HOME/.local/bin"
UNIT_DIR="$HOME/.config/systemd/user"

say() { printf '\033[1m%s\033[0m\n' "$*"; }

need_node() {
  command -v node >/dev/null || { echo "node >= 20 is required on PATH (system node, since the systemd unit cannot see nvm)"; exit 1; }
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || { echo "node >= 20 required, found $(node --version)"; exit 1; }
}

copy_tree() {  # copy_tree <src-root> <dest-root>: the runtime files only, no git/node_modules/tests
  mkdir -p "$2"
  if command -v rsync >/dev/null; then
    rsync -a --delete --exclude node_modules --exclude test --exclude .git "$1/hub" "$1/extension" "$1/docs" "$1/ops" "$1/README.md" "$2/"
  else
    rm -rf "$2/hub" "$2/extension" "$2/docs" "$2/ops"
    cp -a "$1/hub" "$1/extension" "$1/docs" "$1/ops" "$1/README.md" "$2/"
    rm -rf "$2/hub/node_modules" "$2/hub/test"
  fi
}

need_node

if [ "$SRC" = "$DEST" ]; then
  say "Installing in place from $DEST"
else
  say "Deploying $SRC -> $DEST"
  copy_tree "$SRC" "$DEST"
fi

say "Installing npm dependencies"
(cd "$DEST/hub" && npm install --omit=dev --no-fund --no-audit --loglevel=error)

say "Linking commands into $BIN"
mkdir -p "$BIN"
for b in browser-hub browser-hub-mcp browserctl; do
  ln -sfn "$DEST/hub/bin/$b" "$BIN/$b"
done
case ":$PATH:" in *":$BIN:"*) ;; *) echo "note: $BIN is not on your PATH; add it to use browserctl directly";; esac

say "Installing systemd user unit"
mkdir -p "$UNIT_DIR"
cp "$DEST/ops/systemd/browser-hub.service" "$UNIT_DIR/browser-hub.service"
systemctl --user daemon-reload
systemctl --user enable browser-hub.service >/dev/null
systemctl --user restart browser-hub.service
sleep 1
systemctl --user is-active --quiet browser-hub.service && echo "browser-hub.service is running on 127.0.0.1:${BROWSER_HUB_PORT:-8777}" \
  || { echo "browser-hub.service failed to start:"; journalctl --user -u browser-hub -n 10 --no-pager; exit 1; }

if command -v claude >/dev/null; then
  say "Registering MCP server 'browser-hub' with Claude Code (user scope)"
  claude mcp remove --scope user browser-hub >/dev/null 2>&1 || true
  claude mcp add --scope user browser-hub -- "$BIN/browser-hub-mcp" >/dev/null
  echo "registered: $BIN/browser-hub-mcp"
else
  echo "claude not on PATH; later run: claude mcp add --scope user browser-hub -- $BIN/browser-hub-mcp"
fi

cat <<MSG

Done. Remaining manual step, once per Chrome profile you want to control:
  chrome://extensions  ->  Developer mode  ->  Load unpacked  ->  $DEST/extension
  then click the extension icon and give that profile a name (e.g. work, personal).

Check:  browserctl browsers
Update: pull/sync the repo and run this script again (it re-copies, restarts the service, keeps names).
MSG
