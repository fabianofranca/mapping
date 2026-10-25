#!/usr/bin/env bash
# Servidor MCP do workspace: gera o build do branch em uso (só o esbuild, ~0,1 s; sem o tsc
# do `npm run build:mcp`) e o inicia com as raízes do workspace. O stdout é o canal do
# protocolo MCP: tudo o que não é o servidor vai para o stderr.
set -euo pipefail
cd "$(dirname "$0")/.."

# O cliente MCP nem sempre herda o PATH do shell interativo (nvm).
if ! command -v node >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >&2
fi
if [ ! -d node_modules ]; then
  echo "workspace/mcp.sh: rode 'npm install' na raiz do repositório antes." >&2
  exit 1
fi

node mcp/build.mjs >&2
exec node dist-mcp/mapping-mcp.js --root workspace/projetos --root workspace/especializacoes
