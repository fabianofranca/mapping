# Esc closes the Catalog and one corner geometry for the marking — [Não lançado] (épico `epic/esc-catalogo-e-canto`)

## Corrigido

- The **Catalog** window closes with Esc when the focus is inside it, like the X: the focus goes to the strip's **Catalog** button and the selection stays. The search box and the **Library** selector keep their own Esc, and the component dialog closes alone. **Help › Shortcuts** says "Close Details, Comments or Catalog (with focus in the window)".
- On the canvas, the incomplete ⚠ no longer touches the "to review" badge nor the name: the badge, the ⚠ and the name come from one calculation (`cornerLayout`) and keep a gap between them.
- In view mode, the name of a "to review" marking no longer leaves the badge's gap (the badge does not appear in that mode).
