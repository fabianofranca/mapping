# Perspectivas — [Não lançado] (épico `epic/perspectivas`)

## Pendências

PE3 — a interface das perspectivas (PR "PE3 — A interface das perspectivas"). Proposta visual aprovada: https://claude.ai/artifact/6rMomxsDEGyRWLkdt4NafD.

- **Ícone novo `perspective`** (`src/ui/icons.tsx`): dois retângulos lado a lado, o da direita mais baixo, e uma linha embaixo. Entra no grupo `Icons`.
- **`PerspectivePicker`** (`src/ui/PerspectivePicker.tsx`, `src/theme/editor.css`): botão da barra principal (ícone, nome em negrito, "para todos"/"só eu"/"tudo") e a lista (`listbox`) com os grupos Para todos (Principal primeiro) e Só minhas, a aberta marcada, e Nova/Gerenciar no fim; estado travado na revisão. Seção `Layouts.md` (barra principal).
- **Diálogos** (`src/ui/NewPerspectiveDialog.tsx`, `ManagePerspectivesDialog.tsx`, `DeletePerspectiveDialog.tsx`, `src/theme/dialogs.css`): Nova perspectiva (grade rótulo/campo, Começar de, Quem vê em `Segmented`, camadas em caixas, erro de nome com `role="alert"`), Gerenciar (tabela com Select de Quem vê, renomear inline, duplicar, apagar; linha da Principal com ações desabilitadas) e a confirmação de apagar (`alertdialog`, Cancelar em foco, botão de perigo). Cobrir em `ConfirmDialogs`.
- **Menu do botão direito** (`src/ui/PerspectiveMenuItems.tsx`, `src/theme/panels.css`): item com submenu "Enviar para perspectiva ›" (caixas, linhas travadas "sempre"/"esta"), "Tirar desta perspectiva" e o item desabilitado com a dica "só na Principal" (classes `.menu-submenu`, `.menu-heading`, `.menu-note`, `.menu-hint`, `.menu-check-slot`).
- **Detalhes** (`src/ui/PerspectivesSection.tsx`, `ArrivalNotice.tsx`, `PerspectiveSendMenu.tsx`, `ArrowLinksSection.tsx`, `src/theme/details.css`): a seção Perspectivas, o aviso "Veio de…" com Dispensar e Próximo que veio (N), e o selo "fora desta perspectiva" na seção Ligado por seta. Botões Arrumar e Excluir desabilitados com a dica fora da Principal.
- **Canvas** (`src/canvas/renderers/arrivals.ts`, `src/canvas/arrivals.ts`): o selo "Veio de <nome>" sobre a raiz e a faixa tracejada "Área de chegada". Usa tokens existentes do canvas (`badge`, `line`, `halo`, `selectSecondary`, `selectFill`, `text`, `textMuted`); nenhum token novo. Seção `Canvas.md`.
- **Barra de status** (`src/ui/StatusBar.tsx`): o nome da perspectiva aberta e "N itens vieram de outras perspectivas".
- **Tokens:** nenhum token novo.
- **Correção da rodada completa (fase PC):** o selo "Veio de <nome>" mudou de posição, sem mudar de aparência: do canto de cima à esquerda da raiz para o de baixo à esquerda (por dentro; em raiz pequena, por fora e abaixo), sempre dentro da área visível. O submenu "Enviar para perspectiva" pode abrir à esquerda do pai (`.menu-submenu-left`), abre também por hover, e suas linhas são `menuitemcheckbox` com `aria-checked`. O item da barra de status virou "Chegadas: N" (frase inteira no `title`). Nenhum token novo.
- **Correção PC2 (`Canvas.md`):** o rótulo "Área de chegada" (título e dica) fica acima da linha do nome dos containers e, sem espaço em cima, abaixo da faixa, sempre dentro da área visível; o selo "Veio de <nome>" sai de baixo do minimapa. Sem mudança de aparência nem token novo.
