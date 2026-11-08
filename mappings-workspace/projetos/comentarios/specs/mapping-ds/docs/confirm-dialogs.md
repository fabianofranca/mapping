# ConfirmDialogs

Os diálogos de confirmação do editor (`src/app/EditorDialogs.tsx`; o estado de abertura vem de `src/app/useEditorDialogs.ts`), todos `Dialog` `size="sm"` (480 px):

- **ConfirmDialog**: Cancelar e uma ação, destrutiva (`danger`, com o papel de alerta) ou principal (`primary`). Usos: *Excluir container?*, *Excluir marcação?*, *Excluir seta?*, *Excluir N itens?*, *Fechar sem salvar?* e *Proporção diferente* (troca de imagem).
- **ExternalChangeDialog**: *Projeto alterado fora da app*, quando o `mapping.json` mudou por fora com alterações locais não gravadas. Sem o fechar (`fechavel` `não`): Esc e o toque fora não fazem nada; é preciso escolher **Recarregar** ou **Manter as minhas** (`primary`).

## O que o desenho mostra

A moldura: cartão `color-surface` com borda, raio 8 e sombra de popup; cabeçalho de 44 px com o `titulo` e, com `fechavel` `sim`, o fechar; o corpo (slot *Conteúdo*, 16 px de margem); o rodapé com a divisória de cima.

## Filhos esperados

- A mensagem do impacto (Texto, parágrafo): o que é removido, quantas marcações, anotações e setas; o aviso de marcações trancadas é um Texto em negrito.
- No rodapé: **Cancelar** e a ação (Button `danger` ou `primary`).

## O que fica de fora

O fundo escurecido (`color-backdrop`), o foco e o hover dos botões não são desenhados. O papel de alerta (`alertdialog`) não tem efeito visual.
