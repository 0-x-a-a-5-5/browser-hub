#!/usr/bin/env bash
# Install (or update) Browser Hub on this machine.
#
#   ops/install.sh               deploy to ~/.local/share/browser-hub (override: BROWSER_HUB_HOME=/path)
#   ops/install.sh --no-service  same, but do not run a hub here: this machine reaches a hub on
#                                another machine through a tunnel that lands on 127.0.0.1:8777
#                                (see "Two machines" in the README)
#
# What it does, all idempotent:
#   1. copies hub/ extension/ docs/ ops/ README.md into the install dir (unless run from there already)
#   2. npm install --omit=dev inside it
#   3. symlinks browser-hub, browser-hub-mcp, browserctl, browser-hub-tunnel into ~/.local/bin
#   4. installs + (re)starts the systemd user unit browser-hub.service (skipped with --no-service)
#      and installs the browser-hub-tunnel@.service template (enable an instance per remote host)
#   5. registers the MCP server with Claude Code (user scope) when `claude` is on PATH
# Loading the extension into each Chrome profile stays manual (Chrome offers no API for it).
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${BROWSER_HUB_HOME:-$HOME/.local/share/browser-hub}"
BIN="$HOME/.local/bin"
UNIT_DIR="$HOME/.config/systemd/user"
RUN_SERVICE=1

for arg in "$@"; do
  case "$arg" in
    --no-service) RUN_SERVICE=0 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

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
ln -sfn "$DEST/ops/browser-hub-tunnel" "$BIN/browser-hub-tunnel"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "note: $BIN is not on your PATH; add it to use browserctl directly";; esac

say "Installing systemd user units"
mkdir -p "$UNIT_DIR"
cp "$DEST/ops/systemd/browser-hub-tunnel@.service" "$UNIT_DIR/browser-hub-tunnel@.service"
if [ "$RUN_SERVICE" = 1 ]; then
  cp "$DEST/ops/systemd/browser-hub.service" "$UNIT_DIR/browser-hub.service"
  systemctl --user daemon-reload
  systemctl --user enable browser-hub.service >/dev/null
  systemctl --user restart browser-hub.service
  sleep 1
  systemctl --user is-active --quiet browser-hub.service && echo "browser-hub.service is running on 127.0.0.1:${BROWSER_HUB_PORT:-8777}" \
    || { echo "browser-hub.service failed to start:"; journalctl --user -u browser-hub -n 10 --no-pager; exit 1; }
else
  systemctl --user disable --now browser-hub.service 2>/dev/null || true
  rm -f "$UNIT_DIR/browser-hub.service"
  systemctl --user daemon-reload
  echo "no hub service here (--no-service): agents use whatever tunnel lands on 127.0.0.1:${BROWSER_HUB_PORT:-8777}"
fi

if command -v claude >/dev/null; then
  say "Registering MCP server 'browser-hub' with Claude Code (user scope)"
  claude mcp remove --scope user browser-hub >/dev/null 2>&1 || true
  claude mcp add --scope user browser-hub -- "$BIN/browser-hub-mcp" >/dev/null
  echo "registered: $BIN/browser-hub-mcp"
else
  echo "claude not on PATH; later run: claude mcp add --scope user browser-hub -- $BIN/browser-hub-mcp"
fi

if [ "$RUN_SERVICE" = 1 ]; then
cat <<MSG

Done. Remaining manual step, once per Chrome profile you want to control:
  chrome://extensions  ->  Developer mode  ->  Load unpacked  ->  $DEST/extension
  then click the extension icon and give that profile a name (e.g. work, personal).

Check:  browserctl browsers
Update: pull/sync the repo and run this script again (it re-copies, restarts the service, keeps names).
To let another machine drive these browsers over ssh:
  systemctl --user enable --now browser-hub-tunnel@<ssh-host-alias>.service
MSG
else
cat <<MSG

Done. This machine runs no hub. On the machine with the browsers, start the tunnel that lands here:
  systemctl --user enable --now browser-hub-tunnel@<ssh alias for this machine>.service
Check (once the tunnel is up):  browserctl browsers
MSG
fi
