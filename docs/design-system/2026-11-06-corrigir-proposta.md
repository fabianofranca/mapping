# Correção na mesma proposta — 2026-11-06 (épico `epic/corrigir-proposta`)

## Pendências

- **CP1 e CP2** (modelo e MCP): nenhuma.
- **CP3** (a revisão na app):
  - **Selo "Revisada" / "Nova na revisão"** (`src/ui/review/RevisedFlag.tsx`): `Flag` de tom `new` com `Tooltip`, na linha da mudança, do item e da imagem; o nome acessível da linha ganha o sufixo.
  - **Bloco "Antes da revisão"** nos Detalhes da mudança (`RevisedBefore.tsx`, classe `.revised-before` em `src/theme/review.css`, só tokens): `DiffValue` do que o agente tinha proposto e a decisão de antes.
  - **Linha "Revisada · N para conferir"** da janela Propostas (`ProposalRow.tsx`).
  - **Aviso de revisão nova** (`ProposalNotices.tsx`, `RevisedNotice`): texto com contagens e o botão **Revisar**, ausente com a revisão dela aberta.
  - **Filtro "Só revisadas (N)"** no menu Filtros (`Choice`), a linha "Revisada pelo agente em …" no cabeçalho (`ReviewHeader`) e "Da mudança retirada: …" nas notas (`NoteField`).
  - Nenhum token, ícone ou controle novo.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-06, no fechamento do épico (versão 48, `1794004854-9fe3`; o índice por último, com `lastChange`). CP1 e CP2 sem impacto. Da CP3, só guias e `Revisao.md`:

- `Flag` (guia): o selo `Revisada` / `Nova na revisão`, tom `new`, com `Tooltip`, na linha da mudança, do item e da imagem; o nome acessível da linha ganha o sufixo.
- `ChangePopover` (guia): o bloco **Antes da revisão** (`RevisedBefore.tsx`, `.revised-before`), com o `DiffValue` do que o agente tinha proposto e a decisão de antes.
- `ProposalRow` (guia): a linha **Revisada · N para conferir**, o aviso de revisão nova (`RevisedNotice` em `ProposalNotices.tsx`, com **Revisar**, ausente com a revisão dela aberta) e o filtro **Só revisadas (N)** no menu Filtros.
- `ReviewHeader` (guia): a linha "Revisada pelo agente em …". `NoteField` (guia): "Da mudança retirada: …".
- `ReviewRow` (guia): a menção ao filtro **Só revisadas (N)** da lista.
- `Revisao.md`: a seção nova "Revisão do agente na mesma proposta".
- `project/design-system.json`: só o `lastChange`.

## Ficou sem gravar

- Os previews (`Flag`, `ProposalRow`, `ChangePopover`, `ReviewHeader`, `NoteField`, `ReviewRow`) não ganharam os estados novos (selo Revisada, bloco Antes da revisão, linha Revisada · N para conferir, aviso de revisão nova, filtro Só revisadas): só os guias foram atualizados, para não desenhar estado sem o desenho de referência do app.
- Nem o bloco **Antes da revisão** nem o aviso de revisão nova têm componente próprio no Mapa; ficaram descritos nos guias de `ChangePopover` e `ProposalRow`. Criar componente novo é decisão do dono.
- Contraste do selo `new` e do bloco `.revised-before` nos dois temas não foi conferido num navegador (só tokens existentes).
- O `.revised-before` não entrou no `bundle.css` do artefato.
