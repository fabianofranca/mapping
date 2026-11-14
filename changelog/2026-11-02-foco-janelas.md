# Focus on windows — 2026-11-02 (épico `epic/foco-janelas`, PR #315, MCP 0.12.0, schema v13)

## Corrigido

- Closing a tool window (Tree, Layers, Details, Catalog and those of the bottom window), by the X, by the shortcut or by the bar, no longer leaves keyboard focus lost: it returns to whoever opened the window, or to its button in the bar, or to the canvas. Switching tabs in the bottom window also keeps focus on the tab.
