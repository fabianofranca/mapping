# One drawing font, a token named by a field value and notes library v6 — 2026-11-27 (épico `epic/drawing-font-notes-v6`)

## Pendências

None so far. FN1 (the drawing font) crosses its "Toca em:" with the triggers of `docs/DESIGN-SYSTEM.md`: the interface font and every token of `src/theme/tokens.ts` stay as they are (the Mapping faces are registered for the drawn component text only, never for the UI), and no screen, component or icon of the app changes. The later phases of the epic add their own lines here if they touch a trigger. FN3 (notes library v6) touches no trigger: `libraries/notas/`, the docs, the examples and the generated files never trigger the design system, its colors live in the library's own component and not in the app's theme, and the `src/i18n/specHelp.ts` change is spec-help prose, not a label of a preview or a guide.

## Sincronização

Sem impacto: no pending item came out of this epic. The drawing font registers the Mapping faces for the drawn component text only, no token, screen, component or icon of the app changed, and the notes library v6 lives in its own component, outside the app's theme. Nothing was written to the **Mapping** artifact.

## Ficou sem gravar

Nothing. There was nothing to write, so no item was left behind.
