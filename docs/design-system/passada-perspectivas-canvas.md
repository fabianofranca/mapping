# Passada visual das perspectivas e do canvas — [Não lançado] (épico `epic/passada-perspectivas-canvas`)

## Pendências

- **`PerspectivesSection` (Detalhes):** o gatilho do **Enviar para perspectiva…** passa a ter a aparência do `Button` (`font: var(--t-text)`, altura `--control-height`, borda `--color-border-control`, estados de hover e pressionado). Arquivos: `src/ui/PerspectiveSendMenu.tsx`, `src/theme/editor.css`.
- **`Menu`:** nova variante `menu-popover-control` do `MenuPopover` (gatilho com a aparência do `Button`, em vez da do **projeto ▾**). O `MenuPopover.tsx` não muda; a classe já era aceita.
- **`CanvasMarking` e seção `Canvas.md`:** o selo "Veio de…" da raiz grande sobe acima da faixa do nome de outra raiz logo abaixo; o rótulo da Área de chegada fica a `tokens.arrival.pad` (8 px) de cada borda da área visível e ganha reticências quando não cabe. Arquivos: `src/canvas/arrivals.ts`, `src/canvas/renderers/arrivals.ts`.

## Sincronização

A gravar no artefato **Mapping** pelo fechamento do épico (as pendências acima e as da PV2).

## Ficou sem gravar

Nada.
