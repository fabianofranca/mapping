# Stable accessible names — 2026-11-09 (epic `epic/nomes-estaveis`, PR #1140, MCP 0.28.6 unchanged, schema v18)

## Corrigido

- The window buttons of the side strip (Tree, Layers, Details, List, Proposals, Diagnostics, Comments…) always have the same name for the screen reader, the window title: the open or closed state is conveyed only by "pressed", and no longer by "Show …" and "Hide …". The notice of new proposals, new error and open conversations still comes after the name.
- On the home screen, the buttons of each recent project now say which project they belong to ("Open Loja", "Delete Loja", "Remove from list: Loja") and describe the row (source, folder and last use): rows with the same name are no longer confused by screen reader users. Nothing changes on screen.
- Closing the remote images strip with **Not now** or **Allow these** returns keyboard focus to whoever had it (for example, the **Image URL** field), or to the canvas if that field is gone; before, focus was lost to the start of the page.
- Focus also returns to the **Image URL** field after **Not now** or **Allow these** when the URL goes past 60 characters and the field switches between one and several lines; before, it went to the canvas.
