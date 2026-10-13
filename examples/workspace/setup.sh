#!/usr/bin/env bash
# Prepara a pasta de mapeamentos: baixa o servidor MCP do Mapping da release (mcp-v*), confere
# o sha256, traz a skill spec-author e cria o link que o Claude Code lê.
# Uso: ./setup.sh            (última release)
#      ./setup.sh mcp-v0.3.3 (uma release específica)
set -euo pipefail
cd "$(dirname "$0")"

REPO="fabianofranca/mapping"
TAG="${1:-}"
if [ -n "$TAG" ]; then
  BASE="https://github.com/$REPO/releases/download/$TAG"
else
  BASE="https://github.com/$REPO/releases/latest/download"
fi

mkdir -p tools .agents/skills/spec-author .claude/skills projetos especializacoes

echo "Baixando o servidor MCP (${TAG:-última release})..."
curl -fsSL -o tools/mapping-mcp.js "$BASE/mapping-mcp.js"
curl -fsSL -o tools/mapping-mcp.js.sha256 "$BASE/mapping-mcp.js.sha256"
(
  cd tools
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c mapping-mcp.js.sha256
  else
    shasum -a 256 -c mapping-mcp.js.sha256
  fi
)

echo "Baixando a skill spec-author..."
curl -fsSL -o .agents/skills/spec-author/SKILL.md \
  "https://raw.githubusercontent.com/$REPO/main/.claude/skills/spec-author/SKILL.md"
if [ ! -e .claude/skills/spec-author ]; then
  # Link para a cópia canônica; onde link não existe (alguns Windows), uma cópia.
  ln -s ../../.agents/skills/spec-author .claude/skills/spec-author 2>/dev/null ||
    cp -R .agents/skills/spec-author .claude/skills/spec-author
fi

echo "Servidor: $(node tools/mapping-mcp.js --version)"
echo "Pronto. Abra esta pasta no agente e aprove o servidor 'mapping'; preencha 'Para que servem' no AGENTS.md."
