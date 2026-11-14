# View — 2026-11-07 (épico `epic/visualizacao`)

## Pendências

### VZ1 — without the active layer

- `Tags`: the "Active layer chip" (`EditorMainBar`) goes away.
- `LayersPanel`: the ✓ (Make active) and the active row (`layer-row-active`) go away; the visibility checkbox is never disabled.
- `LayerGroup`: the "active" badge goes away.
- `Details`/`AnnotationsPanel`: the "+ Annotation" button at the top of the section goes away; the empty state "All layers are hidden." comes in with the **Show all** button (`.annotations-all-hidden`).
- `ListView`: the layer visibility checkbox is no longer disabled.
- The `check` icon stays (the review uses it). Tokens: none new.

### VZ3 — View button and Show on canvas panel

- `View button` (`ViewModeButton`): `IconButton` with the `eye` icon and `aria-pressed`, in place of Clean view (`eyeOff`), on the canvas bar.
- **Show on canvas** `IconButton` (`layers` icon, `aria-haspopup="dialog"`): only enabled in the mode; popover trigger.
- `ViewModePanel` popover (`.view-panel-popover`): title and sentence, **Elements** group with `Choice` (the **Arrows** hint in `choice-hint`), **Layers with drawings** group with `Choice` and the layer dot (`.layer-dot` with `--layer-color`), footer with two `sm` `Button`s (**Show all**, **Screens only**). Focus enters the first control and returns to the button on close.
- Status bar: the mode item (`eye` icon + "View mode: view only. Esc or Alt+H exits.").
- New token: `size-view-panel` (280px, panel width). New icons: none.

### VZ4 — fixing the tester's findings

- `Tooltip`/`IconButton`: new prop `suppressed`/`tooltipSuppressed` (the tip stays hidden, as after Esc); View uses it with the panel open, so the tip does not cover the panel.
- `ViewModePanel`: on close, focus returns to View (panel opened when turning the mode on) or to **Show on canvas** (panel opened by it). `AnnotationsPanel` (`.annotations`) gains `tabindex="-1"` to receive focus after **Show all**. Tokens and icons: none.

## Sincronização

Versões 49 (content) and 50 (index) of the artifact, from 2026-11-07. **`ViewModePanel` (new):** guide and preview of the "Show on canvas" panel and of the View and Show on canvas triggers, in three bar states and four panel states. **`Breadcrumbs`, `IconButton`, `Tooltip`, `StatusBar`:** View (`eye`) in place of Clean view, `tooltipSuppressed`/`suppressed` and the mode item in the status bar. **Without an active layer:** `Tags`, `LayerGroup`, `DataGrid` and `Choice` lost the chip, the ✓, the highlighted row, the "+ Annotation" at the top and the disabled checkbox; `LayerGroup` gained the "All layers are hidden." state with Show all; `MarkingPanel`, `ArrowPanel`, `ToolWindow` and `HelpDialog` only swapped excerpts of the previews. **`Atalhos.md`:** Alt+H becomes "View" and Alt+N goes away. **`tokens.json`:** `size-view-panel` (280px). Contrast checked by token value in both themes; the previews were not opened in a browser.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `.view-panel-*` and `.annotations-all-hidden` classes in `bundle.css` and removal of the dead `.layer-chip`, `.layer-chip-name` and `.layer-row-active` (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: checking the estimated `@dsCard` heights of the changed or new previews (DS4: `IconButton`, `ToolWindow`; DS5: the others).
- Passou para o registro do épico `epic/sincronia-ds-2`: what the canvas draws in view mode, in `Canvas.md` (and the "Clean view" left over in `Canvas.md`, `Layouts.md` and `README.md`) (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: the icon count in the DS's `README.md` (86 to 92) and the component and token counts, which only exist in `docs/DESIGN-SYSTEM.md` (DS3).
