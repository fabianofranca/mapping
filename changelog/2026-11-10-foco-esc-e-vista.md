# Focus, Esc and view — 2026-11-10 (epic `epic/foco-esc-e-vista`, PR #1483, MCP unchanged, schema v18)

## Corrigido

- After **Link to…** + Enter, focus stays on the **Details** window (already with the new arrow) and no longer goes to "<project>: project actions".
- Esc closes the **Details** and **Comments** windows when focus is inside them and outside a text field, like the X: focus goes to the strip button and the selection stays. **Help › Keyboard shortcuts** gains the new row.
- Opening or closing the **Tree**, the **Details** or the bottom window no longer changes the zoom and leaves in the middle of the canvas what was in the middle: the view keeps the center when the canvas changes size.
- In the test guide: R25.32 says that the `Escuro` container is born below `Telas`, R25.41 brings a window size that fits the whole Badge and R1.20b makes the setup order explicit.
- The test that counts the interface's renders during a gesture gained a generous timeout (30 s) against the timing flake under coverage on a shared runner; the render limit did not change.
