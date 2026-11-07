#!/usr/bin/env bash
# Deixa a pasta de mapeamentos na versão de uma release do MCP (mcp-v*): o servidor, a skill
# spec-author (em .agents/ e no link de .claude/), o bloco de regras do AGENTS.md e este script.
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
#
# Só para teste e para o testador (não faz parte do uso normal):
#   MAPPING_RELEASE_BASE   troca a URL base da release inteira (aceita file://)
#   MAPPING_RAW_BASE       troca https://raw.githubusercontent.com/fabianofranca/mapping/main
#   MAPPING_SETUP_UPDATED  =1 impede um segundo ciclo de autoatualização (o script o define)
#
# Toca em: tools/mapping-mcp.js(.sha256), .agents/skills/spec-author, .claude/skills/spec-author,
# o próprio setup.sh e o bloco entre os marcadores mapping:begin/end do AGENTS.md (com cópia
# AGENTS.md.bak-AAAAMMDD-HHMMSS quando o arquivo muda). Nunca altera projetos/ e especializacoes/
# (só cria as pastas), um CLAUDE.md existente (e não cria um), .mcp.json nem as configs dos
# outros clientes.
set -euo pipefail
cd "$(dirname "$0")"

REPO="fabianofranca/mapping"
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

if [ -n "${MAPPING_RELEASE_BASE:-}" ]; then
  RELEASE_BASE="$MAPPING_RELEASE_BASE"
elif [ -n "$TAG" ]; then
  RELEASE_BASE="https://github.com/$REPO/releases/download/$TAG"
else
  RELEASE_BASE="https://github.com/$REPO/releases/latest/download"
fi
RAW_BASE="${MAPPING_RAW_BASE:-https://raw.githubusercontent.com/$REPO/main}"

TMP=""
SKILL_FROM=""
AGENTS_SUMMARY=""
HAVE_SETUP=0
HAVE_BLOCK=0

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

# Baixa $1 (e $1.sha256) da release para $TMP; falha se qualquer um não vier.
fetch_with_hash() {
  curl -fsSL -o "$TMP/$1" "$RELEASE_BASE/$1" 2>/dev/null &&
    curl -fsSL -o "$TMP/$1.sha256" "$RELEASE_BASE/$1.sha256" 2>/dev/null
}

# Baixa um arquivo opcional da release; devolve 1 (com aviso) se a release não o publica.
fetch_optional() {
  if fetch_with_hash "$1"; then return 0; fi
  warn "a release (${TAG:-última}) não traz $1 (release antiga)."
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
  fetch_with_hash mapping-mcp.js || die "não consegui baixar mapping-mcp.js de $RELEASE_BASE."
  if fetch_optional setup.sh; then HAVE_SETUP=1; fi
  if fetch_optional AGENTS.mapping.md; then HAVE_BLOCK=1; fi
  if fetch_optional SKILL.md; then
    SKILL_FROM="release ${TAG:-última}"
  else
    warn "usando a skill da main."
    curl -fsSL -o "$TMP/SKILL.md" "$RAW_BASE/.claude/skills/spec-author/SKILL.md" ||
      die "não consegui baixar a skill de $RAW_BASE."
    SKILL_FROM="main (release antiga)"
  fi
}

verify_all() {
  verify mapping-mcp.js
  [ "$HAVE_SETUP" = 0 ] || verify setup.sh
  [ "$HAVE_BLOCK" = 0 ] || verify AGENTS.mapping.md
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
  update_agents
  echo "Servidor: $(node tools/mapping-mcp.js --version)"
  echo "Skill: $SKILL_FROM"
  echo "AGENTS.md: $AGENTS_SUMMARY"
  echo "Pronto. Abra esta pasta no agente e aprove o servidor 'mapping'; preencha 'Para que servem' no AGENTS.md."
}

main "$@"
