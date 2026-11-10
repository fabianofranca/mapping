# Passada visual das perspectivas e do canvas — [Não lançado] (épico `epic/passada-perspectivas-canvas`)

## Pendências

- **`PerspectivesSection` (Detalhes):** o gatilho do **Enviar para perspectiva…** passa a ter a aparência do `Button` (`font: var(--t-text)`, altura `--control-height`, borda `--color-border-control`, estados de hover e pressionado). Arquivos: `src/ui/PerspectiveSendMenu.tsx`, `src/theme/editor.css`.
- **`Menu`:** nova variante `menu-popover-control` do `MenuPopover` (gatilho com a aparência do `Button`, em vez da do **projeto ▾**). O `MenuPopover.tsx` não muda; a classe já era aceita.
- **`CanvasMarking` e seção `Canvas.md`:** o selo "Veio de…" da raiz grande sobe acima da faixa do nome de outra raiz logo abaixo e, em qualquer raiz, escolhe o lugar já puxado para dentro da vista (nunca sobre o título de outra raiz nem sobre o da Área de chegada); o rótulo da Área de chegada fica a `tokens.arrival.pad` (8 px) de cada borda da área visível e ganha reticências quando não cabe. Arquivos: `src/canvas/arrivals.ts`, `src/canvas/renderers/arrivals.ts`.
- **`Notice`:** os avisos curtos (`ui.toast`) e o de progresso saem do `.canvas-overlay` (topo) e vão para o `.canvas-overlay-foot`: pé do canvas, à esquerda, da largura do texto (quebra em linhas se a coluna for estreita, sem reticências), sem passar sob o minimapa; erros, Somente leitura, reparo e backup seguem no topo. Arquivos: `src/app/CanvasNotices.tsx`, `src/theme/canvas.css`.
- **`Breadcrumbs`:** na barra do canvas acima de 470 px, os trechos que não são o último encolhem primeiro (`flex-shrink: 20`, mínimo `--space-8`); o último encolhe por último. Até 470 px nada muda (BC1). Arquivo: `src/theme/editor.css`.

## Sincronização

A gravar no artefato **Mapping** pelo fechamento do épico (as pendências acima e as da PV2).

## Ficou sem gravar

Nada.
