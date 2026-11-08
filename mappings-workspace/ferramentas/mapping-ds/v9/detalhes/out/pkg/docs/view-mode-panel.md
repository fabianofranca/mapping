# ViewModePanel

O painel **Mostrar no canvas** do modo visualização (`src/ui/ViewModePanel.tsx`; Alt+H entra no modo e abre o painel). Só para ver: nada se seleciona nem se edita.

O desenho é a moldura do popover (`.popover.view-panel-popover`, 280 px): `color-surface`, borda `color-border`, raio 6, sombra de popup, 8 px de margem, e o título (`titulo`, "Mostrar no canvas", `t-heading`).

**Filhos**, em coluna com 8 px entre os blocos:

- a dica "Só para ver: nada se seleciona nem se edita." (Texto `t-body` `muted`);
- **Elementos** (título do grupo em Texto `t-small` `muted`) e os Choices Containers, Imagens, Contorno das marcações, Nome das marcações e Setas (com a `dica` "continuam ligando os mesmos pontos");
- **Camadas com desenho**: um Choice por camada com componente, com o ponto da cor (LayerGroup `ponto`, 12 px) antes do nome (no rótulo do Choice, o lugar do ponto é um U+2060 e espaços não separáveis);
- o rodapé, à direita: Buttons `sm` **Mostrar tudo** e **Só as telas**.

O botão que reabre o painel na barra do canvas é um IconButton (Mostrar no canvas, ao lado do Visualizar `pressionado`); o aviso do modo na barra de status é Ícone e Texto. Não desenhado: o foco.
