#!/usr/bin/env bash
# Brings up the cloud test environment (docs/TESTING.md, appendix A, recipes 1 to 3; and
# docs/TESTING-NUVEM.md, "First 10 minutes", items 1 to 7): local build, static server,
# MCP build, virtual screen (Xvfb), D-Bus, AT-SPI and Chrome for Testing with a fresh profile.
#
# Usage:
#   scripts/testing/cloud-up.sh <round-folder> [--restart-chrome | --check-packages]
#
# Without --restart-chrome: brings everything up from scratch and checks items 4 to 7 of the "First 10 minutes".
# With --restart-chrome: recipe 3 of appendix A (closes Chrome through CDP, never `pkill -f chrome`,
# and brings it up again without duplicating tabs).
#
# With --check-packages: only the packages pre-check (below), for the test.
#
# It starts by checking the environment's packages (xdotool, openbox, import, at-spi, pyatspi and Chrome).
# If any is missing, it installs them with up to 5 attempts (`CLOUD_UP_RETRY_SLEEP`, default 15 s; the apt-get of the
# environment setup sometimes gets a 503) and checks again; if still missing, it exits with code 14 and the
# list. Chrome is not installed: its absence gives 14 right away.
#
# Decision of this phase: each check has its own exit code (10 to 13), so the report can
# tell which one failed without rereading the error text (10 to 13; 14 = missing package).
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <round-folder> [--restart-chrome | --check-packages]" >&2
  exit 1
fi

# Resolve the round folder to absolute before any `cd` (a relative path would point somewhere
# else after the `cd "$REPO_DIR"`).
mkdir -p "$1"
ROUND_DIR="$(cd "$1" && pwd)"
shift
RESTART_CHROME=0
CHECK_PACKAGES=0
if [ "${1:-}" = "--restart-chrome" ]; then
  RESTART_CHROME=1
elif [ "${1:-}" = "--check-packages" ]; then
  CHECK_PACKAGES=1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
S="$ROUND_DIR/apoio"
mkdir -p "$S" "$ROUND_DIR/anexos"
export APOIO="$S"

CHROME_CMD=(
  /opt/pw-browsers/chromium --no-sandbox
  --user-data-dir="$S/profile" --remote-debugging-port=9222 --force-renderer-accessibility
  --no-first-run --no-default-browser-check --hide-crash-restore-bubble
  --window-position=0,0 --window-size=1600,1200 http://localhost:8080/
)

# Paths checked in the pre-check (the variables only exist for the test).
ATSPI_LAUNCHER="${CLOUD_UP_ATSPI_LAUNCHER:-/usr/libexec/at-spi-bus-launcher}"
CHROME_BIN="${CLOUD_UP_CHROME:-/opt/pw-browsers/chromium}"
ATSPI_PYTHON="${CLOUD_UP_PYTHON:-/usr/bin/python3.12}"
PACKAGES=(xdotool at-spi2-core python3-pyatspi openbox imagemagick)

# Prints, one per line, what is missing from the environment (empty = everything in place).
missing_packages() {
  local c
  for c in xdotool openbox import; do
    command -v "$c" >/dev/null 2>&1 || echo "$c"
  done
  [ -e "$ATSPI_LAUNCHER" ] || echo "$ATSPI_LAUNCHER"
  # The apt pyatspi is for the system python (the one cloud.mjs and atspi-allow.py use); the
  # `python3` on the PATH may be another version, where it does not load: try the system one and, as a fallback, the PATH one.
  "$ATSPI_PYTHON" -c 'import pyatspi' >/dev/null 2>&1 \
    || python3 -c 'import pyatspi' >/dev/null 2>&1 || echo "python3 pyatspi"
  [ -e "$CHROME_BIN" ] || echo "$CHROME_BIN"
}

# Pre-check (stage #1533, decision 12): installs what is missing with retry; exits 14 if it does not fit.
ensure_packages() {
  local missing
  missing=$(missing_packages)
  [ -z "$missing" ] && return 0
  if [ ! -e "$CHROME_BIN" ]; then
    echo "ERROR: missing packages (Chrome is not installed): $(printf '%s ' $missing)" >&2
    exit 14
  fi
  local apt=(apt-get)
  if [ "$(id -u)" -ne 0 ]; then
    apt=(sudo -n apt-get)
  fi
  local i
  for i in 1 2 3 4 5; do
    if "${apt[@]}" update -q && "${apt[@]}" install -y -q "${PACKAGES[@]}"; then
      break
    fi
    [ "$i" -lt 5 ] && sleep $((i * ${CLOUD_UP_RETRY_SLEEP:-15}))
  done
  missing=$(missing_packages)
  if [ -n "$missing" ]; then
    echo "ERROR: missing packages after 5 attempts: $(printf '%s ' $missing)" >&2
    exit 14
  fi
}

if [ "$CHECK_PACKAGES" -eq 1 ]; then
  ensure_packages
  echo "cloud-up.sh --check-packages: ok."
  exit 0
fi

check_one_tab() {
  local lines
  lines=$(curl -s localhost:9222/json/list | grep '"url"' | grep -v 'chrome[:-]' || true)
  local n
  n=$(printf '%s\n' "$lines" | grep -c . || true)
  if [ "$n" -ne 1 ]; then
    echo "ERROR: item 7 (tabs) failed: expected exactly 1 tab http://localhost:8080/, found $n:" >&2
    printf '%s\n' "$lines" >&2
    exit 13
  fi
}

start_display_and_chrome() {
  export DISPLAY=:99
  # The processes that stay up start with `setsid`, stdin from /dev/null and output to a log: none
  # holds the terminal or the pipe of whoever called the script (`... | tail`), so it returns on its own.
  setsid Xvfb :99 -screen 0 1600x1200x24 </dev/null >"$S/xvfb.log" 2>&1 &
  # Wait for the X socket to appear: 1 s of `sleep` is not always enough, and openbox fails silently
  # ("Failed to open the display") if it starts before Xvfb is up.
  for _ in $(seq 1 50); do
    [ -e /tmp/.X11-unix/X99 ] && break
    sleep 0.2
  done
  setsid openbox </dev/null >"$S/openbox.log" 2>&1 &
  sleep 1
  export DBUS_SESSION_BUS_ADDRESS=$(setsid dbus-daemon --session --fork --print-address=1 </dev/null 2>"$S/dbus.log")
  setsid /usr/libexec/at-spi-bus-launcher --launch-immediately </dev/null >"$S/at-spi.log" 2>&1 &
  echo "export DISPLAY=:99 DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS" >"$S/env.sh"
  GTK_A11Y=atspi ACCESSIBILITY_ENABLED=1 setsid nohup "${CHROME_CMD[@]}" </dev/null >"$S/chrome.log" 2>&1 &
}

if [ "$RESTART_CHROME" -eq 1 ]; then
  # The persistent server of `cloud.mjs run` holds the CDP connection: stop it before closing Chrome
  # (the next `run` starts another, connected to the new Chrome).
  if [ -f "$S/cloud.pid" ]; then
    # Only kill it if the pid still belongs to a `cloud.mjs` (the number may have been reused).
    if tr '\0' ' ' <"/proc/$(cat "$S/cloud.pid")/cmdline" 2>/dev/null | grep -q 'cloud.mjs'; then
      kill "$(cat "$S/cloud.pid")" 2>/dev/null || true
    fi
  fi
  rm -f "$S/cloud.sock" "$S/cloud.pid"
  # Recipe 3 (cloud): never `pkill -f chrome` (it kills the shell itself too and counts as
  # "Crashed", restoring tabs). Close through CDP and wait for the process to really go away.
  (cd "$REPO_DIR" && node --input-type=module -e "
    import { chromium } from 'playwright';
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const session = await browser.newBrowserCDPSession();
    await session.send('Browser.close');
  ") 2>/dev/null || true
  for _ in $(seq 1 30); do
    if ! pgrep -x chrome >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  rm -rf "$S/profile/Default/Sessions"
  if [ -f "$S/env.sh" ]; then
    # shellcheck disable=SC1091
    source "$S/env.sh"
  fi
  if ! (pgrep -x Xvfb >/dev/null 2>&1 && pgrep -x dbus-daemon >/dev/null 2>&1); then
    start_display_and_chrome
  else
    GTK_A11Y=atspi ACCESSIBILITY_ENABLED=1 setsid nohup "${CHROME_CMD[@]}" </dev/null >>"$S/chrome.log" 2>&1 &
  fi
  sleep 2
  check_one_tab
  echo "cloud-up.sh --restart-chrome: ok, a single tab."
  exit 0
fi

node "$REPO_DIR/scripts/testing/cloud.mjs" mark ambiente start

ensure_packages

cd "$REPO_DIR"
BUILD_LOG="$S/build.log"
: >"$BUILD_LOG"
# Stage #1148, decision 5: npm's output goes to apoio/build.log; on failure, the last 40
# lines show up here and the script exits with the command's code (as before, because of set -e).
run_logged() {
  echo "+ $*" >>"$BUILD_LOG"
  local rc=0
  "$@" >>"$BUILD_LOG" 2>&1 || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "ERROR: '$*' failed (code $rc); last 40 lines of $BUILD_LOG:" >&2
    tail -n 40 "$BUILD_LOG" >&2
    exit "$rc"
  fi
}
run_logged npm ci
run_logged npm run build

# The redirection goes on the whole group: the subshell that waits for the server also lets go of the pipe of whoever
# called the script (with it only on `python3`, a `| tail` never closed).
(cd dist && exec setsid python3 -m http.server 8080 --bind 127.0.0.1) </dev/null >"$S/http.log" 2>&1 &

run_logged npm run build:mcp
MCP_VERSION_OUTPUT=$(node dist-mcp/mapping-mcp.js --version)

# Wait for the static server, retrying up to a 15 s deadline.
STATUS=""
for _ in $(seq 1 30); do
  STATUS=$(curl -sI http://localhost:8080/ 2>/dev/null | head -1 || true)
  printf '%s' "$STATUS" | grep -q '200' && break
  sleep 0.5
done
if ! printf '%s' "$STATUS" | grep -q '200'; then
  echo "ERROR: item 4 (static server) failed: $STATUS" >&2
  exit 10
fi

SOURCE_VERSION=$(grep "SERVER_VERSION = '" "$REPO_DIR/mcp/version.ts" | sed -E "s/.*SERVER_VERSION = '([^']+)'.*/\1/")
if ! printf '%s' "$MCP_VERSION_OUTPUT" | grep -qF -- "$SOURCE_VERSION"; then
  echo "ERROR: item 5 (MCP version) failed: expected to contain '$SOURCE_VERSION', got '$MCP_VERSION_OUTPUT'" >&2
  exit 11
fi

start_display_and_chrome

# `|| true`: the expired `timeout` (code 124) must not abort the script through `set -e`; the `if`
# below gives the item 6 message and the `exit 12`.
CHROME_WINDOW=$(timeout 15 bash -c "
  while true; do
    W=\$(xdotool search --onlyvisible --name 'Mapping' 2>/dev/null | head -1)
    if [ -n \"\$W\" ]; then echo \"\$W\"; break; fi
    sleep 0.5
  done
" || true)
if [ -z "$CHROME_WINDOW" ]; then
  echo "ERROR: item 6 (Chrome window) failed: xdotool found no 'Mapping' window." >&2
  exit 12
fi

check_one_tab

node "$REPO_DIR/scripts/testing/cloud.mjs" mark ambiente end

echo "cloud-up.sh: environment up, checks 4 to 7 passed."
