# Import a component's parameters from its signature — 2026-11-13 (épico `epic/importar-assinatura`)

## Pendências

- **`Tabs`/`BottomTabs` guide, bottom window tabs** (S5, #1120): with the Material 3 `pending` items in the example, Notices gains a 2-digit counter and the 6-tab strip overflowed 356 px at 900 px with the CI font (359 px); the `.tab` `padding` in the bottom window goes from 1 px to 0 and that of `tab-badge` from `--space-0-5` to `--space-px`. The rest of the stage creates or changes no screen, component, token or icon: the import is done by the agent, through the MCP and the skill.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-13: version 84 (a single publish, with the index last). `components/Tabs/README.md`: the bottom window tab measures now reflect the CSS (`.tab` with padding `0` and font `t-text-small`; `tab-badge` with `padding: 0 space-px`, font `t-kbd` and `margin-left: space-1`; `tab-alert` with `margin-left: space-1`; strip of 360 px at 900 px and 417 px at 1280 px, all six tabs fitting with the 2-digit counter in Notices). `project/design-system.json`: `lastChange` filled in (by, at, via, note). Contrast: only spacing and font change, no color, so the light and dark theme pairs stay as before. No DS file was deleted.

## Ficou sem gravar

Nothing.
