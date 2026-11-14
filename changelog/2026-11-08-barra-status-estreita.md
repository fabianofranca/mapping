# Narrow status bar — 2026-11-08 (epic `epic/barra-status-estreita`, PR #999, MCP 0.28.4, schema v18)

## Corrigido

- The status bar and the canvas path at 900×720 no longer cut text in the middle of a letter. Saved, the destination (Folder or On this device) and Read-only always appear in full, together with the cursor, the zoom and the build version. The perspective, "awaiting apply", "Unexported changes", warnings, conversations, arrivals and the selection name shrink with an ellipsis and a tooltip on hover. In windows with the bar under 1100 px, the schema and the channel disappear; they remain in Settings and in Diagnostics. The canvas path ends with an ellipsis and a tooltip before the review controls.
- In the review at 900×720 with Tree, Layers, Proposals and Details open, the canvas path stays legible (the selection with letters and an ellipsis, the earlier segments collapse) and the zoom, Current and Proposed are not cut off: in that narrow column the Conversations, Fit all, View and Show on canvas buttons of the canvas bar disappear (Ctrl+0 fits; closing the Details window brings the buttons back).
