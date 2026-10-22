#!/bin/bash
# Hook de SessionStart das sessões do Claude Code na nuvem: instala as dependências
# para os gates (npm run lint, typecheck, test, build) rodarem sem passo manual.
# Só age em sessão remota (CLAUDE_CODE_REMOTE); localmente não faz nada. É
# idempotente: `npm install` com o package-lock é um no-op rápido quando já está
# tudo instalado. Roda síncrono: a sessão só começa com as dependências prontas,
# o que a cascata noturna (PLAN.md, "Execução em cascata") exige.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
npm install --no-audit --no-fund --prefer-offline --loglevel=error
