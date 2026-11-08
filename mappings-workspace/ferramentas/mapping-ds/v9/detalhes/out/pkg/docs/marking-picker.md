# MarkingPicker

O seletor de marcação do **Ligar a…** dos Detalhes (`src/ui/MarkingPicker.tsx`): o mesmo popup do RefPicker (`dialog.picker`, no topo da tela, sem fundo escurecido), com a lista das marcações do projeto, sem as setas e sem a própria marcação. Escolher cria a seta e a seleciona.

O desenho é a moldura: `color-surface`, borda de controle, raio 8, a sombra de popup; o título (`titulo`, "Ligar Filtro Status a…", `t-heading`, 12 px da esquerda e 8 px abaixo do topo, centrado nos 28 px do fechar) e, com `rodape` `sim`, a faixa do rodapé (30 px de `color-bg` com a divisória `color-border` em cima). A largura é `size-picker` (600 px; 400 no compacto da RefCell) e a altura vai até a janela menos 32 px em cima e embaixo.

**Filhos:**

- o IconButton **Fechar** (`close`), à direita do título;
- a busca: TextField de 28 px (12 px de margem dos lados), com o foco;
- as opções (28 px, raio 4, 24 px de recuo à esquerda): a escolhida é uma Caixa `accent`; dentro, o Ícone `marking` (`accent-text` na escolhida), o rótulo (Texto `t-code`, com `reticencias`) e o caminho à direita ("Container › Marcação", Texto `t-kbd` `muted`; `accent-text` na escolhida);
- no rodapé, as dicas: cada tecla é uma Caixa com borda e raio 2 com o Texto `t-kbd` (↑ ↓, Enter, Esc) e a ação é Texto `t-small` `muted` (navegar, escolher, fechar).

No RefPicker (campo e célula `ref`) entram ainda a linha das etiquetas aceitas, as abas e os grupos por anotação; não foram conferidos nesta medição.

Não desenhado: o trecho que casa com a busca (em negrito `accent` dentro do rótulo) e a rolagem.
