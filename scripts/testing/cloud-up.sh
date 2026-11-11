#!/usr/bin/env bash
# Sobe o ambiente de teste da nuvem (docs/TESTING.md, apêndice A, receitas 1 a 3; e
# docs/TESTING-NUVEM.md, "Primeiros 10 minutos", itens 1 a 7): build local, servidor estático,
# build do MCP, tela virtual (Xvfb), D-Bus, AT-SPI e o Chrome for Testing com um perfil novo.
#
# Uso:
#   scripts/testing/cloud-up.sh <pasta-da-rodada> [--restart-chrome | --check-packages]
#
# Sem --restart-chrome: sobe tudo do zero e confere os itens 4 a 7 dos "Primeiros 10 minutos".
# Com --restart-chrome: receita 3 do apêndice A (fecha o Chrome pelo CDP, nunca `pkill -f chrome`,
# e sobe de novo sem duplicar abas).
#
# Com --check-packages: só a pré-conferência dos pacotes (abaixo), para o teste.
#
# Começa conferindo os pacotes do ambiente (xdotool, openbox, import, at-spi, pyatspi e o Chrome).
# Faltando algum, instala com até 5 tentativas (`CLOUD_UP_RETRY_SLEEP`, padrão 15 s; o apt-get do
# setup do ambiente às vezes recebe 503) e confere de novo; ainda faltando, sai com o código 14 e a
# lista. O Chrome não se instala: a falta dele dá 14 direto.
#
# Decisão desta fase: cada conferência tem seu próprio código de saída (10 a 13), para o relato
# distinguir qual falhou sem precisar reler o texto do erro (10 a 13; 14 = pacote faltando).
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <pasta-da-rodada> [--restart-chrome | --check-packages]" >&2
  exit 1
fi

# Resolve a pasta da rodada para absoluta antes de qualquer `cd` (um caminho relativo apontaria
# para outro lugar depois do `cd "$REPO_DIR"`).
mkdir -p "$1"
RODADA="$(cd "$1" && pwd)"
shift
RESTART_CHROME=0
CHECK_PACKAGES=0
if [ "${1:-}" = "--restart-chrome" ]; then
  RESTART_CHROME=1
elif [ "${1:-}" = "--check-packages" ]; then
  CHECK_PACKAGES=1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
S="$RODADA/apoio"
mkdir -p "$S" "$RODADA/anexos"
export APOIO="$S"

CHROME_CMD=(
  /opt/pw-browsers/chromium --no-sandbox
  --user-data-dir="$S/profile" --remote-debugging-port=9222 --force-renderer-accessibility
  --no-first-run --no-default-browser-check --hide-crash-restore-bubble
  --window-position=0,0 --window-size=1600,1200 http://localhost:8080/
)

# Caminhos conferidos na pré-conferência (as variáveis só existem para o teste).
ATSPI_LAUNCHER="${CLOUD_UP_ATSPI_LAUNCHER:-/usr/libexec/at-spi-bus-launcher}"
CHROME_BIN="${CLOUD_UP_CHROME:-/opt/pw-browsers/chromium}"
ATSPI_PYTHON="${CLOUD_UP_PYTHON:-/usr/bin/python3.12}"
PACKAGES=(xdotool at-spi2-core python3-pyatspi openbox imagemagick)

# Imprime, um por linha, o que falta no ambiente (vazio = tudo no lugar).
missing_packages() {
  local c
  for c in xdotool openbox import; do
    command -v "$c" >/dev/null 2>&1 || echo "$c"
  done
  [ -e "$ATSPI_LAUNCHER" ] || echo "$ATSPI_LAUNCHER"
  # O pyatspi do apt vale para o python do sistema (o que o cloud.mjs e o atspi-allow.py usam); o
  # `python3` do PATH pode ser outra versão, onde ele não carrega: tenta o do sistema e, de reserva, o do PATH.
  "$ATSPI_PYTHON" -c 'import pyatspi' >/dev/null 2>&1 \
    || python3 -c 'import pyatspi' >/dev/null 2>&1 || echo "python3 pyatspi"
  [ -e "$CHROME_BIN" ] || echo "$CHROME_BIN"
}

# Pré-conferência (etapa #1533, decisão 12): instala o que falta com retry; sai 14 se não couber.
ensure_packages() {
  local faltam
  faltam=$(missing_packages)
  [ -z "$faltam" ] && return 0
  if [ ! -e "$CHROME_BIN" ]; then
    echo "ERRO: pacotes faltando (o Chrome não se instala): $(printf '%s ' $faltam)" >&2
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
  faltam=$(missing_packages)
  if [ -n "$faltam" ]; then
    echo "ERRO: pacotes faltando depois de 5 tentativas: $(printf '%s ' $faltam)" >&2
    exit 14
  fi
}

if [ "$CHECK_PACKAGES" -eq 1 ]; then
  ensure_packages
  echo "cloud-up.sh --check-packages: ok."
  exit 0
fi

check_one_tab() {
  local linhas
  linhas=$(curl -s localhost:9222/json/list | grep '"url"' | grep -v 'chrome[:-]' || true)
  local n
  n=$(printf '%s\n' "$linhas" | grep -c . || true)
  if [ "$n" -ne 1 ]; then
    echo "ERRO: item 7 (abas) falhou: esperava exatamente 1 aba http://localhost:8080/, achei $n:" >&2
    printf '%s\n' "$linhas" >&2
    exit 13
  fi
}

start_display_and_chrome() {
  export DISPLAY=:99
  # Os processos que ficam de pé sobem com `setsid`, stdin de /dev/null e saída num log: nenhum
  # segura o terminal nem o pipe de quem chamou o script (`... | tail`), então ele volta sozinho.
  setsid Xvfb :99 -screen 0 1600x1200x24 </dev/null >"$S/xvfb.log" 2>&1 &
  # Espera o soquete do X aparecer: 1 s de `sleep` não basta sempre, e o openbox falha calado
  # ("Failed to open the display") se nascer antes do Xvfb estar de pé.
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
  # O servidor persistente do `cloud.mjs run` segura a conexão CDP: para antes de fechar o Chrome
  # (o próximo `run` sobe outro, ligado ao Chrome novo).
  if [ -f "$S/cloud.pid" ]; then
    # Só mata se o pid ainda é de um `cloud.mjs` (o número pode ter sido reaproveitado).
    if tr '\0' ' ' <"/proc/$(cat "$S/cloud.pid")/cmdline" 2>/dev/null | grep -q 'cloud.mjs'; then
      kill "$(cat "$S/cloud.pid")" 2>/dev/null || true
    fi
  fi
  rm -f "$S/cloud.sock" "$S/cloud.pid"
  # Receita 3 (nuvem): nunca `pkill -f chrome` (mata a própria shell também e conta como
  # "Crashed", restaurando abas). Fecha pelo CDP e espera o processo sumir de verdade.
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
  echo "cloud-up.sh --restart-chrome: ok, uma aba só."
  exit 0
fi

node "$REPO_DIR/scripts/testing/cloud.mjs" mark ambiente start

ensure_packages

cd "$REPO_DIR"
BUILD_LOG="$S/build.log"
: >"$BUILD_LOG"
# Etapa #1148, decisão 5: a saída do npm vai para apoio/build.log; com falha, as últimas 40
# linhas aparecem aqui e o script sai com o código do comando (como antes, por causa do set -e).
run_logged() {
  echo "+ $*" >>"$BUILD_LOG"
  local rc=0
  "$@" >>"$BUILD_LOG" 2>&1 || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "ERRO: '$*' falhou (código $rc); últimas 40 linhas de $BUILD_LOG:" >&2
    tail -n 40 "$BUILD_LOG" >&2
    exit "$rc"
  fi
}
run_logged npm ci
run_logged npm run build

# A redireção vai no grupo todo: o subshell que espera o servidor também larga o pipe de quem
# chamou o script (com ela só no `python3`, um `| tail` nunca fechava).
(cd dist && exec setsid python3 -m http.server 8080 --bind 127.0.0.1) </dev/null >"$S/http.log" 2>&1 &

run_logged npm run build:mcp
MCP_VERSION_OUTPUT=$(node dist-mcp/mapping-mcp.js --version)

# Espera o servidor estático com tentativas até um prazo de 15 s.
STATUS=""
for _ in $(seq 1 30); do
  STATUS=$(curl -sI http://localhost:8080/ 2>/dev/null | head -1 || true)
  printf '%s' "$STATUS" | grep -q '200' && break
  sleep 0.5
done
if ! printf '%s' "$STATUS" | grep -q '200'; then
  echo "ERRO: item 4 (servidor estático) falhou: $STATUS" >&2
  exit 10
fi

SOURCE_VERSION=$(grep "SERVER_VERSION = '" "$REPO_DIR/mcp/version.ts" | sed -E "s/.*SERVER_VERSION = '([^']+)'.*/\1/")
if ! printf '%s' "$MCP_VERSION_OUTPUT" | grep -qF -- "$SOURCE_VERSION"; then
  echo "ERRO: item 5 (versão do MCP) falhou: esperava conter '$SOURCE_VERSION', recebi '$MCP_VERSION_OUTPUT'" >&2
  exit 11
fi

start_display_and_chrome

# `|| true`: o `timeout` expirado (código 124) não pode abortar o script pelo `set -e`; o `if`
# abaixo dá a mensagem do item 6 e o `exit 12`.
JANELA=$(timeout 15 bash -c "
  while true; do
    W=\$(xdotool search --onlyvisible --name 'Mapping' 2>/dev/null | head -1)
    if [ -n \"\$W\" ]; then echo \"\$W\"; break; fi
    sleep 0.5
  done
" || true)
if [ -z "$JANELA" ]; then
  echo "ERRO: item 6 (janela do Chrome) falhou: xdotool não achou janela 'Mapping'." >&2
  exit 12
fi

check_one_tab

node "$REPO_DIR/scripts/testing/cloud.mjs" mark ambiente end

echo "cloud-up.sh: ambiente de pé, conferências 4 a 7 passaram."
