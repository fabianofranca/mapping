# Multiple selection — 2026-11-04 (épico `epic/selecao-multipla`)

## Sincronização

Versões 25 (content) and 26 (index) of the artifact. **`Atalhos.md`:** the Shift+click row mentions Ctrl+click (Cmd+click on macOS); new rows "Select by rectangle" (Shift+drag) and "Move the selection" (←↑→↓, 1 px; Shift, 10 px); paragraph "Multiple selection" (on macOS Ctrl+click remains the right click; Shift+drag only adds; the arrows only apply with focus on the canvas or outside controls, and not in read-only nor in review). **`Canvas.md`:** row and paragraph for the selection rectangle (dashed border in `cv-select`, fill `cv-select-fill`, no halo or live preview, in the overlays layer) and `cv-select-fill` in the token table. **`tokens.json`:** new token `cv-select-fill` (`rgba(77, 141, 255, 0.15)`, the same in both themes; 141 tokens in the artifact, 146 in the code). **`Contraste.md`:** the border-over-fill pair (2.26:1 in light, 5.09:1 in dark). **Not written:** the Help intro sentence and the old list in the `HelpDialog` preview (see Pendências).

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `HelpDialog` preview and the intro sentence: redo the list and the intro (`help.shortcuts.intro`) from today's code.
- Passou para o registro do épico `epic/sincronia-ds-2`: Selection rectangle contrast (#456): already resolved; the `cv-halo` halo is in `renderMarquee`, in `Canvas.md` and in `Contraste.md`.
