#!/usr/bin/env bash
# Deixa a pasta de mapeamentos na versão de uma release do MCP (mcp-v*): o servidor, a skill
# spec-author (em .agents/ e no link de .claude/), o bloco de regras do AGENTS.md, o watcher de
# conversas (watch-comments.mjs) e este script.
# Uso: ./setup.sh [tag] [--no-self-update]     (a flag pode vir antes ou depois da tag)
#      ./setup.sh                      última release estável
#      ./setup.sh mcp-v0.5.0           uma release específica
#      ./setup.sh mcp-v0.5.0-rc.1      release candidate do épico
#      ./setup.sh mcp-snapshot-pr172   build de teste de um PR; some quando o PR fecha
# A "última release" (releases/latest) é sempre a estável: o GitHub nunca escolhe uma pre-release
# (rc ou snapshot) como latest, então elas só entram por tag explícita.
#
# Como funciona: baixa tudo para uma pasta temporária, confere o sha256 de TODOS os arquivos e só
# então troca algo. Se um hash divergir, sai com erro e nada muda. Se o setup.sh da release for
# diferente deste, ele se substitui e roda de novo (uma vez só); --no-self-update desliga isso.
# Arquivo que a release não publica (release antiga) é pulado com aviso; sem o servidor, é erro.
# Se o GitHub falhar na hora de baixar (5xx, 429 ou sem resposta), tenta de novo duas vezes e, depois,
# usa a API de assets do GitHub (só curl e node, sem token); a conferência do sha256 é a mesma.
#
# Só para teste e para o testador (não faz parte do uso normal):
#   MAPPING_RELEASE_BASE   troca a URL base da release inteira (aceita file://); desliga o segundo caminho
#   MAPPING_GITHUB_BASE    troca https://github.com (o download direto da release)
#   MAPPING_GITHUB_API     troca https://api.github.com (o segundo caminho, pela API de assets)
#   MAPPING_RAW_BASE       troca https://raw.githubusercontent.com/fabianofranca/mapping/main
#   MAPPING_SETUP_UPDATED  =1 impede um segundo ciclo de autoatualização (o script o define)
#
# Toca em: tools/mapping-mcp.js(.sha256), tools/mapping-signature.mjs(.sha256), .agents/skills/spec-author, .claude/skills/spec-author,
# watch-comments.mjs (na raiz; sobrescrito pela versão da release, sem backup), o próprio setup.sh e o bloco entre os marcadores mapping:begin/end do AGENTS.md (com cópia
# AGENTS.md.bak-AAAAMMDD-HHMMSS quando o arquivo muda). Nunca altera projetos/ e especializacoes/
# (só cria as pastas), um CLAUDE.md existente (e não cria um), .mcp.json nem as configs dos
# outros clientes.
set -euo pipefail
cd "$(dirname "$0")"

REPO="fabianofranca/mapping"
GITHUB_BASE="${MAPPING_GITHUB_BASE:-https://github.com}"
GITHUB_API="${MAPPING_GITHUB_API:-https://api.github.com}"
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

# O segundo caminho (API de assets) só vale quando a base é o GitHub: com MAPPING_RELEASE_BASE ele fica desligado.
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
# Estado do download (ver `download` e `fetch_file`): código HTTP, stderr do curl e classe da falha.
DL_CODE=""
DL_ERR=""
DL_CLASS=""
FETCH_MSG=""
FETCH_CLASS=""
API_JSON=""    # "" = ainda não lida; "ok" = em $TMP/release.json; "falhou" = não adianta tentar de novo
API_FAIL=""
SECOND_WARNED=0
FIRST_CODE=""

warn() { echo "Aviso: $*" >&2; }
die() { echo "Erro: $*" >&2; exit 1; }
cleanup() { [ -z "$TMP" ] || rm -rf "$TMP"; }

# --- baixar e conferir --------------------------------------------------------------------------

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# Baixa $1 para $2 (curl extra em "${@:3}"). Sem -f: o 404 e o 504 não se confundem com falha de
# rede. Define DL_CODE (HTTP, ou 000 sem resposta), DL_ERR (stderr do curl em uma linha) e DL_CLASS:
# ok | missing (404) | down (5xx e 429) | net (sem resposta) | other. Só 2xx é sucesso; nos demais o
# arquivo parcial é apagado.
download() {
  local url="$1" dest="$2" rc=0 errfile="$TMP/curl.err"
  DL_CODE="$(curl -sS -L --retry 2 --retry-delay 1 --connect-timeout 10 -o "$dest" -w '%{http_code}' \
    "${@:3}" "$url" 2>"$errfile")" || rc=$?
  DL_ERR="$(tr '\n' ' ' <"$errfile" | sed 's/ *$//')"
  rm -f "$errfile"
  [ -n "$DL_CODE" ] || DL_CODE=000
  case "$url" in
    file://*) # sem HTTP: o curl dá 000 no sucesso e 37 quando o arquivo não existe
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

# Mensagem de falha do último `download`: $1 = arquivo, $2 = URL, $3 = quem deveria trazê-lo.
failure_message() {
  case "$DL_CLASS" in
    missing)
      echo "$3 não traz $1 (HTTP 404). Confira a tag em https://github.com/$REPO/releases." ;;
    down)
      echo "o GitHub não respondeu (HTTP $DL_CODE) ao baixar $1 de $2. Tente de novo em alguns minutos.${API_FAIL:+ $API_FAIL}" ;;
    net)
      echo "sem resposta de $(host_of "$2") ao baixar $1: ${DL_ERR:-erro de rede}. Confira a rede.${API_FAIL:+ $API_FAIL}" ;;
    *)
      echo "HTTP $DL_CODE ao baixar $1 de $2.${API_FAIL:+ $API_FAIL}" ;;
  esac
}

# --- segundo caminho: API de assets ---------------------------------------------------------------

# Lê o JSON da release uma vez por execução (API_JSON); guarda a falha para as chamadas seguintes.
api_release_json() {
  [ "$API_JSON" != ok ] || return 0
  [ "$API_JSON" != falhou ] || return 1
  local url="$GITHUB_API/repos/$REPO/releases/latest"
  [ -z "$TAG" ] || url="$GITHUB_API/repos/$REPO/releases/tags/$TAG"
  if download "$url" "$TMP/release.json" -H 'Accept: application/vnd.github+json'; then
    API_JSON=ok
    return 0
  fi
  API_JSON=falhou
  if [ "$DL_CLASS" = net ]; then
    API_FAIL="A API de assets também não respondeu (${DL_ERR:-erro de rede})."
  else
    API_FAIL="A API de assets também falhou (HTTP $DL_CODE)."
  fi
  return 1
}

# Id do asset de nome $1 no JSON da release (vazio se a release não o traz).
asset_id() {
  node -e 'const fs = require("fs");
const release = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const asset = (release.assets || []).find((a) => a.name === process.argv[2]);
if (asset) process.stdout.write(String(asset.id));' "$TMP/release.json" "$1"
}

# Baixa $1 pela API de assets para $TMP/$1. Devolve 1 e deixa FETCH_CLASS/FETCH_MSG se falhar.
fetch_via_api() {
  local name="$1" id
  api_release_json || return 1
  id="$(asset_id "$name")"
  if [ -z "$id" ]; then
    FETCH_CLASS=missing
    DL_CLASS=missing
    FETCH_MSG="a release ${TAG:-última} não traz $name (HTTP 404). Confira a tag em https://github.com/$REPO/releases."
    return 1
  fi
  if [ "$SECOND_WARNED" = 0 ]; then
    warn "download direto falhou (HTTP $FIRST_CODE); usando a API de assets do GitHub."
    SECOND_WARNED=1
  fi
  download "$GITHUB_API/repos/$REPO/releases/assets/$id" "$TMP/$name" -H 'Accept: application/octet-stream' && return 0
  API_FAIL="A API de assets também falhou (HTTP $DL_CODE)."
  return 1
}

# Baixa o arquivo $1 da release para $TMP/$1; no 5xx, 429 ou sem resposta, tenta a API de assets (só
# quando a base é o GitHub). Se falhar, FETCH_CLASS e FETCH_MSG dizem por quê.
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
  if [ -z "$FETCH_MSG" ]; then FETCH_MSG="$(failure_message "$name" "$url" "a release ${TAG:-última}")"; fi
  return 1
}

# Baixa $1 (e $1.sha256) da release para $TMP; falha (FETCH_CLASS/FETCH_MSG) se qualquer um não vier.
fetch_with_hash() {
  fetch_file "$1" && fetch_file "$1.sha256"
}

# Baixa um arquivo opcional da release; devolve 1 (com aviso) se a release não o publica. Qualquer
# outra falha (GitHub fora, sem rede) é erro: não se confunde com release antiga.
fetch_optional() {
  if fetch_with_hash "$1"; then return 0; fi
  [ "$FETCH_CLASS" = missing ] || die "$FETCH_MSG"
  warn "a release (${TAG:-última}) não traz $1 (release antiga) (HTTP 404)."
  return 1
}

# Confere o hash de $TMP/$1 contra o primeiro campo de $TMP/$1.sha256.
verify() {
  local expected actual
  expected="$(awk '{print $1; exit}' "$TMP/$1.sha256")"
  actual="$(hash_of "$TMP/$1")"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] ||
    die "sha256 de $1 não confere (esperado ${expected:-vazio}, obtido $actual). Nada foi alterado."
}

download_all() {
  echo "Baixando da release ${TAG:-última}..."
  fetch_with_hash mapping-mcp.js || die "$FETCH_MSG"
  if fetch_optional setup.sh; then HAVE_SETUP=1; fi
  if fetch_optional AGENTS.mapping.md; then HAVE_BLOCK=1; fi
  if fetch_optional watch-comments.mjs; then HAVE_WATCHER=1; fi
  if fetch_optional mapping-signature.mjs; then HAVE_EXTRACTOR=1; fi
  if fetch_optional SKILL.md; then
    SKILL_FROM="release ${TAG:-última}"
  else
    warn "usando a skill da main."
    local url="$RAW_BASE/.claude/skills/spec-author/SKILL.md"
    download "$url" "$TMP/SKILL.md" || die "$(failure_message SKILL.md "$url" "a main")"
    SKILL_FROM="main (release antiga)"
  fi
}

verify_all() {
  verify mapping-mcp.js
  [ "$HAVE_SETUP" = 0 ] || verify setup.sh
  [ "$HAVE_BLOCK" = 0 ] || verify AGENTS.mapping.md
  [ "$HAVE_WATCHER" = 0 ] || verify watch-comments.mjs
  [ "$HAVE_EXTRACTOR" = 0 ] || verify mapping-signature.mjs
  [ "$SKILL_FROM" = "main (release antiga)" ] || verify SKILL.md
}

# --- autoatualização ----------------------------------------------------------------------------

# Troca este script pelo da release e roda de novo, uma vez só.
self_update() {
  if [ "$HAVE_SETUP" = 0 ]; then
    warn "seguindo com o setup.sh atual."
    return 0
  fi
  [ "$SELF_UPDATE" = 1 ] && [ "${MAPPING_SETUP_UPDATED:-}" != 1 ] || return 0
  ! cmp -s "$TMP/setup.sh" "$SELF" || return 0
  cp "$TMP/setup.sh" "$SELF.new"
  chmod +x "$SELF.new"
  mv -f "$SELF.new" "$SELF"
  echo "setup.sh atualizado; rodando de novo."
  cleanup
  trap - EXIT
  MAPPING_SETUP_UPDATED=1 exec "$SELF" "$@"
}

# --- servidor e skill ---------------------------------------------------------------------------

install_server() {
  mkdir -p tools
  cp "$TMP/mapping-mcp.js" tools/mapping-mcp.js
  cp "$TMP/mapping-mcp.js.sha256" tools/mapping-mcp.js.sha256
}

install_skill() {
  mkdir -p .agents/skills/spec-author .claude/skills
  cp "$TMP/SKILL.md" .agents/skills/spec-author/SKILL.md
  if [ -L .claude/skills/spec-author ]; then
    return 0 # link (inclusive quebrado): já aponta para a cópia canônica
  elif [ -d .claude/skills/spec-author ]; then
    rm -rf .claude/skills/spec-author
    cp -R .agents/skills/spec-author .claude/skills/spec-author
  elif [ ! -e .claude/skills/spec-author ]; then
    # Link para a cópia canônica; onde link não existe (alguns Windows), uma cópia.
    ln -s ../../.agents/skills/spec-author .claude/skills/spec-author 2>/dev/null ||
      cp -R .agents/skills/spec-author .claude/skills/spec-author
  fi
}

# --- watcher de conversas -----------------------------------------------------------------------

# Arquivo gerenciado, como o servidor: sobrescrito pela versão da release, sem backup.
install_watcher() {
  if [ "$HAVE_WATCHER" = 0 ]; then
    WATCHER_SUMMARY="não atualizado (release sem o watcher)"
  elif [ ! -f watch-comments.mjs ]; then
    WATCHER_SUMMARY="instalado"
  elif cmp -s "$TMP/watch-comments.mjs" watch-comments.mjs; then
    WATCHER_SUMMARY="sem mudança"
    return 0
  else
    WATCHER_SUMMARY="atualizado"
  fi
  [ "$HAVE_WATCHER" = 0 ] || cp "$TMP/watch-comments.mjs" watch-comments.mjs
}

# --- extrator de assinaturas --------------------------------------------------------------------

# Arquivo gerenciado em tools/, como o servidor: sobrescrito pela versão da release, sem backup.
install_extractor() {
  if [ "$HAVE_EXTRACTOR" = 0 ]; then
    EXTRACTOR_SUMMARY="não atualizado (release sem o extrator)"
    return 0
  elif [ ! -f tools/mapping-signature.mjs ]; then
    EXTRACTOR_SUMMARY="instalado"
  elif cmp -s "$TMP/mapping-signature.mjs" tools/mapping-signature.mjs; then
    EXTRACTOR_SUMMARY="sem mudança"
  else
    EXTRACTOR_SUMMARY="atualizado"
  fi
  mkdir -p tools
  cp "$TMP/mapping-signature.mjs" tools/mapping-signature.mjs
  cp "$TMP/mapping-signature.mjs.sha256" tools/mapping-signature.mjs.sha256
}

# --- bloco do AGENTS.md -------------------------------------------------------------------------

# Número da primeira linha de AGENTS.md que é exatamente $1 (vazio se não houver).
line_of() { awk -v m="$1" '$0 == m { print NR; exit }' AGENTS.md; }
count_of() { awk -v m="$1" '$0 == m { n++ } END { print n + 0 }' AGENTS.md; }

# Títulos # e ## fora de cercas ```, um por linha.
headings() {
  awk '/^```/ { fence = !fence; next } !fence && /^##? / { print }' AGENTS.md
}

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
    printf '# Mapeamentos\n\n## Para que servem estes mapeamentos\n\n'
    cat <<'COMMENT'
<!-- Preencha: o objetivo de quem mantém esta pasta. Ex: "documentar as telas do app X, ligar cada
componente ao código de instanciação Android/iOS e escrever as telas na solução a partir das marcações". É isto que o
servidor MCP não sabe dizer: ele explica o mecanismo, não o propósito. -->

COMMENT
    cat "$TMP/AGENTS.mapping.md"
  } >"$TMP/AGENTS.new"
  mv "$TMP/AGENTS.new" AGENTS.md
  AGENTS_SUMMARY="criado"
}

# Troca só o trecho entre os marcadores (inclusive eles) pelo bloco novo.
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
    AGENTS_SUMMARY="sem mudança"
    return 0
  fi
  backup_agents
  mv "$TMP/AGENTS.new" AGENTS.md
  AGENTS_SUMMARY="atualizado"
}

# Esqueleto antigo (sem marcadores): mantém só "Para que servem" e põe o bloco no lugar do resto.
migrate_old_agents() {
  local s e
  s="$(line_of '## Para que servem estes mapeamentos')"
  e="$(line_of '## Estrutura')"
  {
    printf '# Mapeamentos\n\n'
    # sed (e não `tail | head`): com pipefail, o head fechando o pipe antes do tail terminar dava SIGPIPE (141).
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
  warn "revise o AGENTS.md: as seções antigas do Mapping podem ter ficado duplicadas."
  AGENTS_SUMMARY="não reconhecido: bloco acrescentado no fim"
}

update_agents() {
  if [ "$HAVE_BLOCK" = 0 ]; then
    AGENTS_SUMMARY="não atualizado (release sem o bloco)"
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
    warn "AGENTS.md com marcadores mapping:begin/end quebrados; não alterei o arquivo."
    AGENTS_SUMMARY="marcadores quebrados: não alterado"
  fi
}

# --- principal ----------------------------------------------------------------------------------

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
  echo "Servidor: $(node tools/mapping-mcp.js --version)"
  echo "Skill: $SKILL_FROM"
  echo "AGENTS.md: $AGENTS_SUMMARY"
  echo "Watcher: $WATCHER_SUMMARY"
  echo "Extrator: $EXTRACTOR_SUMMARY"
  echo "Pronto. Abra esta pasta no agente e aprove o servidor 'mapping'; preencha 'Para que servem' no AGENTS.md."
}

main "$@"
