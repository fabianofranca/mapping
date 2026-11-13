# Toca por arquivo e seção na ficha da fila — [Não lançado] (épico `epic/toca-por-arquivo`, PR #0, MCP 0.39.1 sem mudança, schema v19)

## Alterado

- **O `toca=` da ficha vale só com arquivos e seções (para quem conduz o fluxo, #1812, fase TA1):** a citação passa a aceitar só arquivo (ou padrão com prefixo, como `tests/storage/folder*.test.ts`) e seção de documento (`docs/TESTING.md#R9`, `CLAUDE.md#regras-de-arquitetura`). Pasta (`src/model/`), `**`, padrão sem prefixo, documento com seções inteiro (`docs/TESTING.md`) e âncora fora da forma dão `ficha incompleta (toca: <citação>)` no painel, e a ficha passa a ser refeita (`fichas a refazer:` do `show`).
- **Efeito prático:** uma etapa deixa de segurar outra que só mexe noutro arquivo da mesma pasta ou noutra seção do mesmo documento. A fila rodou com 1 de 8 vagas por cerca de 25 h por causa disso.
- **Etapa já começada:** a que foi começada com citação antiga continua conflitando como hoje até a ficha ser refeita. A linha `exclusive=sim` não passa por essa validação.
- **Comando novo `python3 .claude/skills/implementar-fila/painel/painel.py toca "<citações separadas por vírgula>"`:** imprime `ok` (código 0) ou uma linha `inválida: <citação> — <motivo>` por citação (código 1). Não entra no `apply`.
