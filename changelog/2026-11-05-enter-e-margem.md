# Enter saves the long field and Wrap with exact margin — 2026-11-05 (epic `epic/enter-e-margem`, PR #523, MCP 0.16.0, schema v13)

## Corrigido

- A long text field without a line break (such as an image URL, over 60 characters) saves with Enter, like the short field; Shift+Enter breaks the line, and with a break in the text Enter breaks lines again. The consent strip for remote images follows the URL right away, without leaving the field, and the focus stays in the field.
- Wrap (in the app and in the MCP `wrap_items`) gives an 8 px margin around containers with an integer position, also when the drag left floating-point noise in the `placement` (before it gave 9 px). With a real fraction, the whole rectangle still covers the set.
- Moving a container back and forth by dragging no longer leaves noise (such as `-2.27e-13`) in the `placement` of `mapping.json`; the real fraction of a smooth drag with zoom is kept.
