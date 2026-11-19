# MarkingPanel

Os Detalhes da marcação selecionada (`src/ui/MarkingPanel.tsx`, `.panel-details`). No app o painel não tem fundo nem borda: o fundo é o da janela Detalhes (ToolWindow), então a marcação só agrupa os filhos, numa coluna de 335 px (a janela de 360 menos 12 px de cada lado e a divisória), com 12 px entre as seções.

O que esperar dentro, de cima para baixo:

- **Identidade** (`.identity`): Caixa com a divisória embaixo (`lados` `baixo`); dentro, o Ícone `marking`, o nome (Texto `t-title`), o ID numa Caixa com borda de controle e raio 4 (Texto `t-code` `muted` com `reticencias` e Ícone `copy`), o IconButton de trava (`lock`/`unlock`, `pressionado` quando trancada) e o "Em …" (Texto `t-small` `muted`).
- **Seção Marcação**: o cabeçalho (Ícone `chevronDown`, Texto `t-heading`; recolhida, o resumo "X 112 · Y 236 · 346 × 84 px" em Texto `t-small` `muted` à direita) e a **PropertyGrid** com Nome, Container, Pertence a, Flutuante, Ordem, Posição e Tamanho.
- **Anotações**: o cabeçalho com a contagem e um **LayerGroup** por camada visível.
- **Conversas** (ThreadsSection), **Ligado por seta** e a linha de ações: Buttons **Ligar a…** e **Excluir marcação** (`danger`) e, quando dá, o IconButton **Arrumar**.

**Estado trancado:** o IconButton da trava fica `pressionado`, aparece o HelpTip do aviso ao lado dele e os campos da Marcação ficam desabilitados (cada controle com o próprio `desabilitado`). A pendência "Incompleta" aparece como Notice no topo. Nada disso é desenho do painel.
