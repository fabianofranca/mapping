# Correção na mesma proposta — [Não lançado] (épico `epic/corrigir-proposta`)

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

_Preenchida no fechamento do épico._

## Ficou sem gravar

Nada.
