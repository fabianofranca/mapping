# Header

A 200 × 240 area: a column slot named `content` for the child markings and a 200 × 56 translucent bar (`#FFFFFFB3`) at the top.

- **`overlay`:** the bar is a `rect` with `"overlay": true`, so it is drawn after the child markings of the same container and sits over the first ones of the content.
- **`backdropBlur`:** the bar has `"backdropBlur": 16`, a number in component units that works like CSS `backdrop-filter: blur(16px)`. It blurs what is drawn under the bar, clipped to the bar, before the fill, so the translucent fill tints the blur. In the app and the viewer it blurs the component drawings below it (the container's image is not blurred); in the MCP PNG it blurs everything below it, image included. Without `ctx.filter` the bar draws without the blur and the drawing warns `backdrop-blur-unsupported`.
- **Drawing only:** it does not change the layout, the measurement or the anchors.

Annotation type: `header` (Header). It has no fields: mark the content blocks inside it.
