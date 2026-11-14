# Perspectives — 2026-11-07 (épico `epic/perspectivas`, PR #739, MCP 0.26.0, schema v16)

## Alterado

- The `mapping.json` moves to v16: it gains `project.id` (the project's identity, which never changes), `perspectives` and `arrivals` (empty until the first perspective). A v15 project opens and migrates by itself, and the first write keeps the v15 backup in `backups/`.

## Adicionado

- **Perspectives**: cuts of the project for different audiences (mobile dev, backend, analytics). Each perspective chooses which items appear, where they sit on the canvas and which layers are seen; the content stays the same in all of them. **Main** always exists, shows everything and is where proposals are accepted.
- **Perspective picker** in the main bar, next to the project name, with the groups **For everyone** and **Only mine**, **New perspective…** and **Manage perspectives…**. The choice is kept in this browser, per project.
- **New perspective** (unique name, start from another perspective, from Main or empty, who sees it and the layers) and **Manage perspectives** (change who sees it, rename, duplicate and delete). Deleting a perspective deletes nothing from the project and can be undone.
- **Send to perspective** and **Remove from this perspective**, in the right-click menu and in the **Perspectives** section of Details. Inside a perspective, dragging an item changes only its position there; Arrange, Delete and drawing a canvas marking stay for Main (with the hint "only in Main").
- **Arrival in Main**: what is born in a perspective arrives in Main near the reference or in the **Arrival area**, with the **"Came from…"** badge on the canvas and a notice in Details with **Dismiss** and **Next one that came (N)**. The status bar counts the items that came from other perspectives.
- **Layers per perspective**: the visibility checkbox of the Layers window edits the hidden layers of the open perspective. Reviewing a proposal opens Main (with the notice "The review shows Main") and locks the picker.
- In the **Linked by arrow** section, the other end outside the open perspective gets the "outside this perspective" badge.
- **The MCP reads the perspectives** (MCP 0.26.0, read-only): `get_project` brings `perspectives` (id, name, how many roots, hidden layers) and `arrivals` (the "Came from…" marks); the new tool `get_perspective` brings the roots of a perspective with the position of each one and the hidden layers; `get_marking` and `get_container` say in which perspectives the item appears. The server never creates or changes perspectives, and the "Only me" ones (from the browser) do not appear to it.

## Corrigido

- Inside a perspective, the **Linked by arrow** section of Details again shows the arrow that leaves toward the outside, with the "outside this perspective" badge.
- Containers created in a perspective are no longer born one on top of another.
- The arrival notice of the first screen in the queue again brings "No reference; it went to the arrival area.".
- In Main, the "Came from…" badge no longer covers the container name or the label of the arrival strip and is always inside the visible area; the status bar shows "Arrivals: N" (the full sentence stays in the tooltip).
- In Main framed with the arrival area, the "Arrival area" label no longer sits over the containers' names or leaves the screen (it rises above the name line or, with no room, goes below the strip), Fit all leaves slack for it and the "Came from…" badge no longer sits under the minimap.
- The **Send to perspective** submenu also opens on hover, does not leave the screen near the right edge and announces the checked perspective (`menuitemcheckbox` with `aria-checked`).
- The positions saved when moving, creating and sending items to perspectives no longer carry floating-point noise (like `225.00000000000006`).
