# Registros por épico — [Não lançado] (épico `epic/registros-por-epico`, PR #500, MCP 0.14.0, schema v13)

## Alterado

- **Tabelas largas do guia de teste (`docs/TESTING.md`) e do registro do DS (`docs/DESIGN-SYSTEM.md`) sem alinhamento.** Acrescentar ou mudar um passo muda só a linha dele, em vez de realinhar a tabela inteira; o `docs/TESTING.md` encolhe cerca de 43%.
- **O changelog passa a ser um arquivo por épico em `changelog/`, e o `CHANGELOG.md` da raiz sai.** Dois épicos abertos ao mesmo tempo não conflitam mais no changelog; `ls changelog/` lista as entradas em ordem cronológica e a primeira linha de cada arquivo traz o épico, o PR, o MCP e o schema. A regra está em `changelog/README.md`.
- **O registro do design system passa a ser um arquivo por épico em `docs/design-system/`** (`<nome>.md` durante o épico, `AAAA-MM-DD-<nome>.md` depois do fechamento). O histórico de sincronização e as pendências por épico do `docs/DESIGN-SYSTEM.md` migraram para lá, sem perder texto; o `docs/DESIGN-SYSTEM.md` fica com o mapa, as regras e as pendências gerais.
