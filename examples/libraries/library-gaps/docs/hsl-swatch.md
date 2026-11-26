# HSL swatch

A frame (96 × 48) and two squares, with every color written as `hsl()` or `hsla()`:

- the frame is `hsl(210, 100%, 50%)` (`#0080FF`);
- the right square is `hsla(0, 100%, 50%, 0.5)`, red at half opacity, so over the frame it is about `#804080`;
- the left square is white with a `hsl(120, 100%, 25%)` stroke (`#008000`, 4 wide, inside).

The MCP PNG (`render_container`, `render_marking`, `get_marking_image`) paints the same colors as the app.

Annotation type: `hsl-swatch` (HSL swatch). It has no fields.
