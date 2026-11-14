# Multiple selection — 2026-11-04 (epic `epic/selecao-multipla`, PR #448, MCP 0.13.0, schema v13)

## Adicionado

- **Ctrl+click and Cmd+click add and remove items from the selection**, like Shift+click, on the canvas (including over a handle) and in the Tree. On macOS, Ctrl+click remains the right click and does not add (use Cmd+click). In proposal review none of the three apply, and Ctrl+wheel remains zoom.
- **The keyboard arrows move the selection:** `←↑→↓` moves all selected items 1 px and `Shift+←↑→↓` moves 10 px, each item in its own space (image pixels for a container marking; canvas units for a canvas marking, floating and container). The container takes the markings and the container marking takes the descendants; the arrow (the stroke) does not move. It is all or nothing: if any item cannot move (locked, would leave the container, a container would come to overlap another), nothing moves, with no notice. Pressing and releasing becomes one undo entry; holding the key is a single gesture, closed on release. It only applies with focus on the canvas or on no control, in Navigate and Draw; it does not apply in a text field, Tree, menu, tabs, read-only or in proposal review.
- **Selection by rectangle:** Shift+drag, in any mode (Navigate and Draw), draws a rectangle and, on release, adds to the selection the items entirely inside it, leaving out those that already go along with another item of the selection (the marking of a container that came in, for example). Esc cancels. Over a selected item or a handle, Shift+drag still moves and resizes. The shortcuts list gains "Select by rectangle".
- The shortcuts list gains "Move the selection" (arrows; Shift+arrows, 10 px) and Shift+click now cites Ctrl/Cmd.

## Corrigido

- **Esc cancels the selection rectangle** (and the other pointer gestures in progress) also with Shift held: `Shift+Esc` only hides the focused window when there is no gesture. The Help › Shortcuts introduction no longer contradicts the selection's Cmd+click on macOS.
