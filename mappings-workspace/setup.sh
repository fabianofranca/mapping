#!/usr/bin/env bash
# Brings the mappings folder to the version of an MCP release (mcp-v*): the server, the spec-author
# skill (in .agents/ and in the link under .claude/), the AGENTS.md rules block, the conversation
# watcher (watch-comments.mjs) and this script.
# Usage: ./setup.sh [tag] [--no-self-update]     (the flag may come before or after the tag)
#        ./setup.sh                      latest stable release
#        ./setup.sh mcp-v0.5.0           a specific release
#        ./setup.sh mcp-v0.5.0-rc.1      release candidate of the epic
#        ./setup.sh mcp-snapshot-pr172   test build of a PR; goes away when the PR closes
# The "latest release" (releases/latest) is always the stable one: GitHub never picks a
# pre-release (rc or snapshot) as latest, so those only come in by explicit tag.
#
# How it works: downloads everything to a temporary folder, checks the sha256 of ALL the files and
# only then changes anything. If a hash differs, it exits with an error and nothing changes. If the
# release's setup.sh differs from this one, it replaces itself and runs again (once only);
# --no-self-update turns that off.
# A file the release does not publish (old release) is skipped with a warning; without the server,
# it is an error.
# If GitHub fails when downloading (5xx, 429 or no response), it retries twice and then uses the
# GitHub assets API (only curl and node, no token); the sha256 check is the same.
#
# Only for testing and for the tester (not part of normal use):
#   MAPPING_RELEASE_BASE   replaces the base URL of the whole release (accepts file://); turns off the second path
#   MAPPING_GITHUB_BASE    replaces https://github.com (the direct download of the release)
#   MAPPING_GITHUB_API     replaces https://api.github.com (the second path, through the assets API)
#   MAPPING_RAW_BASE       replaces https://raw.githubusercontent.com/fabianofranca/mapping/main
#   MAPPING_SETUP_UPDATED  =1 prevents a second self-update cycle (the script sets it)
#
# Touches: tools/mapping-mcp.js(.sha256), tools/mapping-signature.mjs(.sha256), .agents/skills/spec-author, .claude/skills/spec-author,
# watch-comments.mjs (in the root; overwritten by the release's version, no backup), setup.sh itself and the block between the mapping:begin/end markers of AGENTS.md (with a copy
# AGENTS.md.bak-YYYYMMDD-HHMMSS when the file changes). Never changes projetos/ and especializacoes/
# (it only creates the folders), an existing CLAUDE.md (and does not create one), .mcp.json or the
# configs of the other clients.
set -euo pipefail
cd "$(dirname "$0")"

REPO="fabianofranca/mapping"
GITHUB_BASE="${MAPPING_GITHUB_BASE:-https://github.com}"
GITHUB_API="${MAPPING_GITHUB_API:-https://api.github.com}"
# The begin marker keeps its original Portuguese wording: workspaces already carry it and the line is matched exactly.
BEGIN='<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->'
END='<!-- mapping:end -->'
SELF="$PWD/$(basename "$0")"

TAG=""
SELF_UPDATE=1
for arg in "$@"; do
  case "$arg" in
    --no-self-update) SELF_UPDATE=0 ;;
    *) TAG="$arg" ;;
  esac
done

# The second path (assets API) only applies when the base is GitHub: with MAPPING_RELEASE_BASE it is turned off.
SECOND_PATH=0
if [ -n "${MAPPING_RELEASE_BASE:-}" ]; then
  RELEASE_BASE="$MAPPING_RELEASE_BASE"
elif [ -n "$TAG" ]; then
  RELEASE_BASE="$GITHUB_BASE/$REPO/releases/download/$TAG"
  SECOND_PATH=1
else
  RELEASE_BASE="$GITHUB_BASE/$REPO/releases/latest/download"
  SECOND_PATH=1
fi
RAW_BASE="${MAPPING_RAW_BASE:-https://raw.githubusercontent.com/$REPO/main}"

TMP=""
SKILL_FROM=""
AGENTS_SUMMARY=""
WATCHER_SUMMARY=""
EXTRACTOR_SUMMARY=""
HAVE_SETUP=0
HAVE_BLOCK=0
HAVE_WATCHER=0
HAVE_EXTRACTOR=0
# Download state (see `download` and `fetch_file`): HTTP code, curl stderr and failure class.
DL_CODE=""
DL_ERR=""
DL_CLASS=""
FETCH_MSG=""
FETCH_CLASS=""
API_JSON=""    # "" = not read yet; "ok" = in $TMP/release.json; "failed" = no point trying again
API_FAIL=""
SECOND_WARNED=0
FIRST_CODE=""

warn() { echo "Warning: $*" >&2; }
die() { echo "Error: $*" >&2; exit 1; }
cleanup() { [ -z "$TMP" ] || rm -rf "$TMP"; }

# --- download and check --------------------------------------------------------------------------

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# Downloads $1 to $2 (extra curl arguments in "${@:3}"). No -f: a 404 and a 504 are not confused with
# a network failure. Sets DL_CODE (HTTP, or 000 with no response), DL_ERR (curl's stderr on one line)
# and DL_CLASS: ok | missing (404) | down (5xx and 429) | net (no response) | other. Only 2xx is
# success; in the other cases the partial file is deleted.
download() {
  local url="$1" dest="$2" rc=0 errfile="$TMP/curl.err"
  DL_CODE="$(curl -sS -L --retry 2 --retry-delay 1 --connect-timeout 10 -o "$dest" -w '%{http_code}' \
    "${@:3}" "$url" 2>"$errfile")" || rc=$?
  DL_ERR="$(tr '\n' ' ' <"$errfile" | sed 's/ *$//')"
  rm -f "$errfile"
  [ -n "$DL_CODE" ] || DL_CODE=000
  case "$url" in
    file://*) # no HTTP: curl gives 000 on success and 37 when the file does not exist
      if [ "$rc" = 0 ]; then DL_CODE=200; elif [ "$rc" = 37 ]; then DL_CODE=404; rc=0; fi ;;
  esac
  if [ "$rc" = 0 ]; then
    case "$DL_CODE" in
      2??) DL_CLASS=ok ;;
      404) DL_CLASS=missing ;;
      429 | 5??) DL_CLASS=down ;;
      *) DL_CLASS=other ;;
    esac
  else
    case "$DL_CODE" in 429 | 5??) DL_CLASS=down ;; *) DL_CLASS=net ;; esac
  fi
  [ "$DL_CLASS" = ok ] || rm -f "$dest"
  [ "$DL_CLASS" = ok ]
}

host_of() { local h="${1#*://}"; echo "${h%%/*}"; }

# Failure message of the last `download`: $1 = file, $2 = URL, $3 = who should have shipped it.
failure_message() {
  case "$DL_CLASS" in
    missing)
      echo "$3 does not include $1 (HTTP 404). Check the tag at https://github.com/$REPO/releases." ;;
    down)
      echo "GitHub did not respond (HTTP $DL_CODE) when downloading $1 from $2. Try again in a few minutes.${API_FAIL:+ $API_FAIL}" ;;
    net)
      echo "no response from $(host_of "$2") when downloading $1: ${DL_ERR:-network error}. Check the network.${API_FAIL:+ $API_FAIL}" ;;
    *)
      echo "HTTP $DL_CODE when downloading $1 from $2.${API_FAIL:+ $API_FAIL}" ;;
  esac
}

# --- second path: assets API ---------------------------------------------------------------

# Reads the release JSON once per run (API_JSON); remembers the failure for the following calls.
api_release_json() {
  [ "$API_JSON" != ok ] || return 0
  [ "$API_JSON" != failed ] || return 1
  local url="$GITHUB_API/repos/$REPO/releases/latest"
  [ -z "$TAG" ] || url="$GITHUB_API/repos/$REPO/releases/tags/$TAG"
  if download "$url" "$TMP/release.json" -H 'Accept: application/vnd.github+json'; then
    API_JSON=ok
    return 0
  fi
  API_JSON=failed
  if [ "$DL_CLASS" = net ]; then
    API_FAIL="The assets API did not respond either (${DL_ERR:-network error})."
  else
    API_FAIL="The assets API failed too (HTTP $DL_CODE)."
  fi
  return 1
}

# Id of the asset named $1 in the release JSON (empty if the release does not include it).
asset_id() {
  node -e 'const fs = require("fs");
const release = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const asset = (release.assets || []).find((a) => a.name === process.argv[2]);
if (asset) process.stdout.write(String(asset.id));' "$TMP/release.json" "$1"
}

# Downloads $1 through the assets API to $TMP/$1. Returns 1 and sets FETCH_CLASS/FETCH_MSG on failure.
fetch_via_api() {
  local name="$1" id
  api_release_json || return 1
  id="$(asset_id "$name")"
  if [ -z "$id" ]; then
    FETCH_CLASS=missing
    DL_CLASS=missing
    FETCH_MSG="release ${TAG:-latest} does not include $name (HTTP 404). Check the tag at https://github.com/$REPO/releases."
    return 1
  fi
  if [ "$SECOND_WARNED" = 0 ]; then
    warn "direct download failed (HTTP $FIRST_CODE); using the GitHub assets API."
    SECOND_WARNED=1
  fi
  download "$GITHUB_API/repos/$REPO/releases/assets/$id" "$TMP/$name" -H 'Accept: application/octet-stream' && return 0
  API_FAIL="The assets API failed too (HTTP $DL_CODE)."
  return 1
}

# Downloads file $1 of the release to $TMP/$1; on 5xx, 429 or no response, tries the assets API (only
# when the base is GitHub). If it fails, FETCH_CLASS and FETCH_MSG say why.
fetch_file() {
  local name="$1" url="$RELEASE_BASE/$1"
  API_FAIL=""
  FETCH_CLASS="" FETCH_MSG=""
  if download "$url" "$TMP/$name"; then return 0; fi
  FIRST_CODE="$DL_CODE"
  if [ "$SECOND_PATH" = 1 ] && { [ "$DL_CLASS" = down ] || [ "$DL_CLASS" = net ]; }; then
    local direct_class="$DL_CLASS" direct_err="$DL_ERR"
    if fetch_via_api "$name"; then return 0; fi
    if [ -z "$FETCH_CLASS" ]; then
      DL_CLASS="$direct_class" DL_CODE="$FIRST_CODE" DL_ERR="$direct_err"
    fi
  fi
  FETCH_CLASS="$DL_CLASS"
  if [ -z "$FETCH_MSG" ]; then FETCH_MSG="$(failure_message "$name" "$url" "release ${TAG:-latest}")"; fi
  return 1
}

# Downloads $1 (and $1.sha256) of the release to $TMP; fails (FETCH_CLASS/FETCH_MSG) if either does not arrive.
fetch_with_hash() {
  fetch_file "$1" && fetch_file "$1.sha256"
}

# Downloads an optional file of the release; returns 1 (with a warning) if the release does not
# publish it. Any other failure (GitHub down, no network) is an error: it is not confused with an old release.
fetch_optional() {
  if fetch_with_hash "$1"; then return 0; fi
  [ "$FETCH_CLASS" = missing ] || die "$FETCH_MSG"
  warn "release (${TAG:-latest}) does not include $1 (old release) (HTTP 404)."
  return 1
}

# Checks the hash of $TMP/$1 against the first field of $TMP/$1.sha256.
verify() {
  local expected actual
  expected="$(awk '{print $1; exit}' "$TMP/$1.sha256")"
  actual="$(hash_of "$TMP/$1")"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] ||
    die "sha256 of $1 does not match (expected ${expected:-empty}, got $actual). Nothing was changed."
}

download_all() {
  echo "Downloading from release ${TAG:-latest}..."
  fetch_with_hash mapping-mcp.js || die "$FETCH_MSG"
  if fetch_optional setup.sh; then HAVE_SETUP=1; fi
  if fetch_optional AGENTS.mapping.md; then HAVE_BLOCK=1; fi
  if fetch_optional watch-comments.mjs; then HAVE_WATCHER=1; fi
  if fetch_optional mapping-signature.mjs; then HAVE_EXTRACTOR=1; fi
  if fetch_optional SKILL.md; then
    SKILL_FROM="release ${TAG:-latest}"
  else
    warn "using the skill from main."
    local url="$RAW_BASE/.claude/skills/spec-author/SKILL.md"
    download "$url" "$TMP/SKILL.md" || die "$(failure_message SKILL.md "$url" "a main")"
    SKILL_FROM="main (old release)"
  fi
}

verify_all() {
  verify mapping-mcp.js
  [ "$HAVE_SETUP" = 0 ] || verify setup.sh
  [ "$HAVE_BLOCK" = 0 ] || verify AGENTS.mapping.md
  [ "$HAVE_WATCHER" = 0 ] || verify watch-comments.mjs
  [ "$HAVE_EXTRACTOR" = 0 ] || verify mapping-signature.mjs
  [ "$SKILL_FROM" = "main (old release)" ] || verify SKILL.md
}

# --- self-update ----------------------------------------------------------------------------

# Replaces this script with the release one and runs again, once only.
self_update() {
  if [ "$HAVE_SETUP" = 0 ]; then
    warn "continuing with the current setup.sh."
    return 0
  fi
  [ "$SELF_UPDATE" = 1 ] && [ "${MAPPING_SETUP_UPDATED:-}" != 1 ] || return 0
  ! cmp -s "$TMP/setup.sh" "$SELF" || return 0
  cp "$TMP/setup.sh" "$SELF.new"
  chmod +x "$SELF.new"
  mv -f "$SELF.new" "$SELF"
  echo "setup.sh updated; running again."
  cleanup
  trap - EXIT
  MAPPING_SETUP_UPDATED=1 exec "$SELF" "$@"
}

# --- server and skill ---------------------------------------------------------------------------

install_server() {
  mkdir -p tools
  cp "$TMP/mapping-mcp.js" tools/mapping-mcp.js
  cp "$TMP/mapping-mcp.js.sha256" tools/mapping-mcp.js.sha256
}

install_skill() {
  mkdir -p .agents/skills/spec-author .claude/skills
  cp "$TMP/SKILL.md" .agents/skills/spec-author/SKILL.md
  if [ -L .claude/skills/spec-author ]; then
    return 0 # link (even a broken one): already points to the canonical copy
  elif [ -d .claude/skills/spec-author ]; then
    rm -rf .claude/skills/spec-author
    cp -R .agents/skills/spec-author .claude/skills/spec-author
  elif [ ! -e .claude/skills/spec-author ]; then
    # Link to the canonical copy; where links do not exist (some Windows), a copy.
    ln -s ../../.agents/skills/spec-author .claude/skills/spec-author 2>/dev/null ||
      cp -R .agents/skills/spec-author .claude/skills/spec-author
  fi
}

# --- conversation watcher -----------------------------------------------------------------------

# Managed file, like the server: overwritten by the release version, no backup.
install_watcher() {
  if [ "$HAVE_WATCHER" = 0 ]; then
    WATCHER_SUMMARY="not updated (release without the watcher)"
  elif [ ! -f watch-comments.mjs ]; then
    WATCHER_SUMMARY="installed"
  elif cmp -s "$TMP/watch-comments.mjs" watch-comments.mjs; then
    WATCHER_SUMMARY="no change"
    return 0
  else
    WATCHER_SUMMARY="updated"
  fi
  [ "$HAVE_WATCHER" = 0 ] || cp "$TMP/watch-comments.mjs" watch-comments.mjs
}

# --- signature extractor --------------------------------------------------------------------

# Managed file in tools/, like the server: overwritten by the release version, no backup.
install_extractor() {
  if [ "$HAVE_EXTRACTOR" = 0 ]; then
    EXTRACTOR_SUMMARY="not updated (release without the extractor)"
    return 0
  elif [ ! -f tools/mapping-signature.mjs ]; then
    EXTRACTOR_SUMMARY="installed"
  elif cmp -s "$TMP/mapping-signature.mjs" tools/mapping-signature.mjs; then
    EXTRACTOR_SUMMARY="no change"
  else
    EXTRACTOR_SUMMARY="updated"
  fi
  mkdir -p tools
  cp "$TMP/mapping-signature.mjs" tools/mapping-signature.mjs
  cp "$TMP/mapping-signature.mjs.sha256" tools/mapping-signature.mjs.sha256
}

# --- AGENTS.md block -------------------------------------------------------------------------

# Number of the first line of AGENTS.md that is exactly $1 (empty if there is none).
line_of() { awk -v m="$1" '$0 == m { print NR; exit }' AGENTS.md; }
count_of() { awk -v m="$1" '$0 == m { n++ } END { print n + 0 }' AGENTS.md; }

# # and ## headings outside ``` fences, one per line.
headings() {
  awk '/^```/ { fence = !fence; next } !fence && /^##? / { print }' AGENTS.md
}

# The headings of the old skeleton (no markers), in Portuguese as it was published: they are only
# used to recognize an AGENTS.md of that skeleton and migrate it. Do not translate them.
OLD_HEADINGS='# Mapeamentos
## Para que servem estes mapeamentos
## Estrutura
## Servidor MCP `mapping`
## Regras
## Skill `spec-author`
## Fluxo típico'

backup_agents() { cp AGENTS.md "AGENTS.md.bak-$(date +%Y%m%d-%H%M%S)"; }

create_agents() {
  {
    printf '# Mappings\n\n## What these mappings are for\n\n'
    cat <<'COMMENT'
<!-- Fill in: the goal of whoever maintains this folder. E.g.: "document the screens of app X, link each
component to its Android/iOS instantiation code and write the screens in the solution from the markings". This is what the
MCP server cannot tell: it explains the mechanism, not the purpose. -->

COMMENT
    cat "$TMP/AGENTS.mapping.md"
  } >"$TMP/AGENTS.new"
  mv "$TMP/AGENTS.new" AGENTS.md
  AGENTS_SUMMARY="created"
}

# Replaces only the part between the markers (including them) with the new block.
update_block() {
  local b e
  b="$(line_of "$BEGIN")"
  e="$(line_of "$END")"
  {
    head -n $((b - 1)) AGENTS.md
    cat "$TMP/AGENTS.mapping.md"
    tail -n +$((e + 1)) AGENTS.md
  } >"$TMP/AGENTS.new"
  if cmp -s "$TMP/AGENTS.new" AGENTS.md; then
    AGENTS_SUMMARY="no change"
    return 0
  fi
  backup_agents
  mv "$TMP/AGENTS.new" AGENTS.md
  AGENTS_SUMMARY="updated"
}

# Old skeleton (no markers): keeps only "Para que servem" and puts the block in place of the rest.
migrate_old_agents() {
  local s e
  s="$(line_of '## Para que servem estes mapeamentos')"
  e="$(line_of '## Estrutura')"
  {
    printf '# Mappings\n\n'
    # sed (and not `tail | head`): with pipefail, head closing the pipe before tail finished gave SIGPIPE (141).
    sed -n "${s},$((e - 1))p" AGENTS.md
    cat "$TMP/AGENTS.mapping.md"
  } >"$TMP/AGENTS.new"
  backup_agents
  mv "$TMP/AGENTS.new" AGENTS.md
  AGENTS_SUMMARY="migrado"
}

append_block() {
  {
    cat AGENTS.md
    printf '\n'
    cat "$TMP/AGENTS.mapping.md"
  } >"$TMP/AGENTS.new"
  backup_agents
  mv "$TMP/AGENTS.new" AGENTS.md
  warn "review AGENTS.md: the old Mapping sections may have ended up duplicated."
  AGENTS_SUMMARY="not recognized: block appended at the end"
}

update_agents() {
  if [ "$HAVE_BLOCK" = 0 ]; then
    AGENTS_SUMMARY="not updated (release without the block)"
    return 0
  fi
  if [ ! -f AGENTS.md ]; then
    create_agents
    return 0
  fi
  local begins ends
  begins="$(count_of "$BEGIN")"
  ends="$(count_of "$END")"
  if [ "$begins" = 0 ] && [ "$ends" = 0 ]; then
    if [ "$(headings)" = "$OLD_HEADINGS" ]; then migrate_old_agents; else append_block; fi
  elif [ "$begins" = 1 ] && [ "$ends" = 1 ] && [ "$(line_of "$BEGIN")" -lt "$(line_of "$END")" ]; then
    update_block
  else
    warn "AGENTS.md has broken mapping:begin/end markers; I did not change the file."
    AGENTS_SUMMARY="broken markers: not changed"
  fi
}

# --- main ----------------------------------------------------------------------------------

main() {
  TMP="$(mktemp -d ./.mapping-setup.XXXXXX)"
  trap cleanup EXIT
  download_all
  verify_all
  self_update "$@"
  mkdir -p projetos especializacoes
  install_server
  install_skill
  install_watcher
  install_extractor
  update_agents
  echo "Server: $(node tools/mapping-mcp.js --version)"
  echo "Skill: $SKILL_FROM"
  echo "AGENTS.md: $AGENTS_SUMMARY"
  echo "Watcher: $WATCHER_SUMMARY"
  echo "Extractor: $EXTRACTOR_SUMMARY"
  echo "Done. Open this folder in the agent and approve the 'mapping' server; fill in 'What these mappings are for' in AGENTS.md."
}

main "$@"
