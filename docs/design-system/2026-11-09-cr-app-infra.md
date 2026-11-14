# CR of the app, storage, viewer, scripts and CI — 2026-11-09 (épico `epic/cr-app-infra`)

## Pendências

- **Standalone buttons:** `docs/DESIGN-SYSTEM.md` gained the "Standalone buttons (exceptions to `Button`)" section, with the navigation items of the home screen's side strip (`.home-nav-item`). Nothing to write to the artifact.
- **`Button` with `button-link` inside `.notice`:** the four action buttons of the canvas notices (`CanvasNotices`: Dismiss, Retry) went from `<button class="link">` to `Button` (`size="sm"`, `button-link`); the `.notice .button-link` rule (`src/theme/base.css`) keeps the inherited color and the underline. Check in the notice preview (`CanvasNotices`/`StatusBar`) that the notice button is drawn as `Button` with `button-link`.
- The "new project" and "set up folder" dialogs of the home screen are now a single component (`ProjectNameDialog`, `src/app/HomeDialogs.tsx`); the look is the same (`Dialog` with `TextField`, Cancel and Create).

- **New token `opacity-viewer-hover` (`0.8`):** opacity of the hover outline of the embeddable viewer (previously a fixed `rgba(26, 99, 204, 0.8)` in `viewer/viewer.ts`); the color remains `color-accent`. Write the opacity to the opacities section of the artifact (8 tokens now; becomes 9).
- **New tokens of the interactive guide (item 66):** `space-px` (`1px`, fine breathing room for labels), `size-accent-bar` (`4px`, the annotation's color bar) and `opacity-mark-fill` / `opacity-mark-fill-selected` (`0.07` / `0.28`, marking fill). Write to the space, sizes and opacities sections of the artifact (opacities go from 9 to 11).

## Sincronização

Gravado no artefato Mapping on 2026-11-09 (version 66):

- `tokens.json`: `space-px` (1px), `size-accent-bar` (4px), `opacity-mark-fill` (0.07), `opacity-mark-fill-selected` (0.28) and `opacity-viewer-hover` (0.8); the opacities go from 7 to 10 (the `cr-i18n-tema` epic had removed two tokens, so the starting count was 7, not 8).
- `components/Home/README.md`: note on the `ProjectNameDialog` (new project and folder name, a single component).
- Index (`design-system.json`): `lastChange` updated.
- "Standalone buttons": already in `docs/DESIGN-SYSTEM.md`; nothing to write to the artifact.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `Button` `size="sm"` `button-link` inside `.notice` (Dismiss and Retry of `CanvasNotices`): `Notice` guide and `bundle.css` (text, DS3) and example in the `Notice` preview (preview, DS5).
