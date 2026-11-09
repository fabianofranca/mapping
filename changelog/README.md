# Changelog

Um arquivo por épico (ou etapa) mesclado na `main`, com o que mudou para quem usa a app e o servidor MCP, em pt-BR. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Os detalhes de cada etapa estão nas issues fechadas com o rótulo `in-progress` (`em-andamento` até 2026-11-03) e, antes delas, no histórico do git.

## Regra

- O épico cria `changelog/<nome>.md`, onde `<nome>` é o branch sem `epic/`, com a data `[Não lançado]` no título.
- O fechamento renomeia o arquivo para `changelog/AAAA-MM-DD-<nome>.md` (`git mv`) e põe a mesma data no título.
- O job `epic` do `ci.yml` falha se o PR de `epic/<nome>` para a `main` não trouxer um dos dois nomes.

## Formato

A primeira linha é:

```
# <Etapa> — <AAAA-MM-DD | [Não lançado]> (épico `epic/<nome>`, PR #<n>, MCP <versão>, schema v<n>)
```

Depois vêm as categorias `## Adicionado`, `## Alterado` e `## Corrigido` (só as que têm itens), com bullets voltados a quem usa a app e o MCP. O épico que só mexe no fluxo de entrega (skills do fluxo, CI, `docs/FLOW.md`, regras do `CLAUDE.md`) escreve as categorias para quem conduz o fluxo (o dono e os agentes). Entradas antigas, de antes dos épicos, mantêm só os campos que tinham.

## Ordem

- `ls changelog/` sai em ordem cronológica, com os não lançados no fim.
- Épicos do mesmo dia ficam em ordem alfabética. A ordem exata do merge é a de `git log --first-parent main`.

## Achar a versão do MCP de um épico

A versão está na primeira linha do arquivo: `grep -m1 '^# ' changelog/*<nome>.md`, ou `grep -h '^# ' changelog/*.md` para todos.

## Épico aberto antes desta regra

Se um épico abriu com a seção no antigo `CHANGELOG.md`:

- a seção dele vira `changelog/<nome>.md` (títulos um nível acima: `##` → `#`, `###` → `##`);
- a linha ou as pendências dele no `DESIGN-SYSTEM.md` viram `docs/design-system/<nome>.md`;
- conflito numa tabela do `docs/TESTING.md`: fica a versão do épico, e roda-se `npx prettier --write docs/TESTING.md`.
