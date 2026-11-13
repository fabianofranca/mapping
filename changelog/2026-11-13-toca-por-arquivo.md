# Toca por arquivo e seção na ficha da fila — 2026-11-13 (épico `epic/toca-por-arquivo`, PR #1850, MCP 0.39.1 sem mudança, schema v19)

## Alterado

- **O `toca=` da ficha vale só com arquivos e seções (para quem conduz o fluxo, #1812, fase TA1):** a citação passa a aceitar só arquivo (ou padrão com prefixo, como `tests/storage/folder*.test.ts`) e seção de documento (`docs/TESTING.md#R9`, `CLAUDE.md#regras-de-arquitetura`). Pasta (`src/model/`), `**`, padrão sem prefixo, documento com seções inteiro (`docs/TESTING.md`) e âncora fora da forma dão `ficha incompleta (toca: <citação>)` no painel, e a ficha passa a ser refeita (`fichas a refazer:` do `show`).
- **Efeito prático:** uma etapa deixa de segurar outra que só mexe noutro arquivo da mesma pasta ou noutra seção do mesmo documento. A fila rodou com 1 de 8 vagas por cerca de 25 h por causa disso.
- **Etapa já começada:** a que foi começada com citação antiga continua conflitando como hoje até a ficha ser refeita. A linha `exclusive=sim` não passa por essa validação.
- **Comando novo `python3 .claude/skills/implementar-fila/painel/painel.py toca "<citações separadas por vírgula>"`:** imprime `ok` (código 0) ou uma linha `inválida: <citação> — <motivo>` por citação (código 1). Não entra no `apply`.
- **O detalhamento e a ficha escrevem o "Toca em:" em arquivos e seções (para quem conduz o fluxo, #1812, fase TA2):** o `/detalhar-backlog`, a "Ficha da etapa" do `implementar-fila`, o `docs/PROCESS.md` e o `docs/FLOW.md` passam a pedir arquivos (ou padrão com prefixo) e seções, nunca pasta nem documento inteiro, e conferem a lista com o `painel.py toca` antes de gravar. O "Entre etapas" manda refazer, no mesmo ciclo do merge, as fichas do `fichas a refazer:` a partir do "Toca em:" das sub-issues de fase, sem editar issue.

## Corrigido

- O `painel.cpython-313.pyc` deixou de ser rastreado pelo git (estava obsoleto em relação ao `painel.py`) e `__pycache__/` entrou no `.gitignore`.
