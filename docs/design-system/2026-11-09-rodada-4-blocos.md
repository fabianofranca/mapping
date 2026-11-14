# Full round in 5 blocks — 2026-11-09 (épico `epic/rodada-4-blocos`)

## Pendências

- **Breadcrumbs bar / Help (RB3):** the **Fit all** button now shows `Shift+1` in the tooltip (the **Fit selection**, the `fit-selection` icon and `Shift+2` are already in the record `2026-11-08-enquadrar-selecao.md`), and the Help shortcut list gains the "Fit all" row (`Shift+1`) in the view group.

## Sincronização

Gravado no artefato Mapping in Claude Design on 2026-11-09 (index `project/design-system.json`, read immediately before; artifact version 63, `lastChange` by Claude via claude). The first write attempt was refused for "version not seen"; I re-read the index and the four files (unchanged) and wrote again.

- **`Atalhos.md`:** "Fit all | Shift+1" row in the table of the "View" group, before "Fit the selection"; the view mode paragraph stops saying that Fit all has no shortcut and now says that both shortcuts work by physical key (`Digit1`, `Digit2`, for ABNT2) and do not act with focus in a text field.
- **`Breadcrumbs`:** `README.md` cites `Shift+1` on **Fit all** (`fit`); `preview.html` gains `aria-keyshortcuts="Shift+1"` on the two **Fit all** buttons (the two previews).
- **`HelpDialog`:** `preview.html` gains the "Fit all | Shift 1" row before "Fit the selection" in the view group (both occurrences).

Only tokens and classes that already existed; the previews were not rendered in the browser.

## Ficou sem gravar

Nothing. (I did not check the previews' contrast in the light and dark themes: only a table row and an `aria-keyshortcuts` attribute go in, with no new color.)
