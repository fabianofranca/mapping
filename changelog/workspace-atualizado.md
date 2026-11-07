# Workspace atualizado — [Não lançado] (épico `epic/workspace-atualizado`, PR #710, MCP 0.24.1, schema v15)

## Adicionado

- Cada release do MCP traz também o `setup.sh`, a skill `spec-author` e as regras do workspace (o bloco do `AGENTS.md` entre `mapping:begin` e `mapping:end`), cada um com `sha256`.
- O `setup.sh` do workspace se atualiza sozinho (`--no-self-update` desliga) e mantém as regras do `AGENTS.md`: troca só o bloco entre os marcadores, preserva a sua seção "Para que servem" e guarda um backup quando migra um `AGENTS.md` antigo. Rodar de novo não muda nada.
- O `setup.sh` confere o `sha256` de todos os arquivos da release antes de trocar qualquer um: se um não bate, ele para com erro e nada na pasta muda.
- Quem ainda tem o `setup.sh` antigo se atualiza uma vez com `curl -fsSL https://github.com/fabianofranca/mapping/releases/latest/download/setup.sh -o setup.sh && chmod +x setup.sh && ./setup.sh`.

## Alterado

## Corrigido

- A skill `spec-author` do workspace vem da mesma versão do servidor, e a cópia em `.claude/skills/` (onde link não existe) passa a ser atualizada a cada execução do `setup.sh`.
