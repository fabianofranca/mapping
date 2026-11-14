# Accessible semantics — 2026-11-03 (epic `epic/semantica-acessivel`, PR #355, MCP 0.13.0, schema v13)

## Alterado

- Interactive guide: a note below the shortcuts table explains the window shortcut. With focus outside the window, the shortcut moves focus to it and opens it, if closed; with focus inside, it hides the window.
- Help › Shortcuts: each window's row says both things ("Go to Marking tree (hides when focused)", on a single line, also in pt-BR at 900 px). The shortcut's behavior does not change.

## Corrigido

- Details: a field's segmented selector (for example `estilo` of the Button) no longer goes past the panel's edge nor creates a horizontal scrollbar: in a narrow column the options wrap to the next line, each one whole and clickable. The table of a `table` field still scrolls in its own box.
- Screen reader: the popover menus (the project one, on the project name, and the review's **Bulk** in a narrow window) are now real menus. Items are announced as menu items, focus goes to the first on opening, ↑/↓ move among them in a loop and Esc closes and returns focus to the button, which announces that it opens a menu.
- Voice command: the name of the review's buttons with text now starts with the visible text, in the format "text: target" — "Accept image: Confirmation", "Reject marking: Top", "Overwrite: Name", "Keep current: Name". The state (accepted or rejected) stays only in the button's state, and the effect of the conflict (overwrites or keeps the current value) in the description. The same goes for the project menu button ("My project: project actions"), the **Bulk** one, the zoom ("100%: current zoom…") and the **Add** of the Library palette ("Add: Button").
