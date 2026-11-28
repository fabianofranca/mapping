# Scroll

A 200 × 240 scroll area: a column slot named `content` for the child markings and a 4 × 80 scrollbar (`#6B7280`) near the right edge.

- **`overlay`:** the scrollbar is a `rect` with `"overlay": true`. A node with the flag keeps its place in the layout, the measurement and the anchors; only the drawing order changes: it is drawn after the child markings of the same container, so a content block as wide as the area does not hide it. A click on the scrollbar still selects the child under it.
- **What the overlay keeps:** the transform, the clip, the opacity and the filter of its ancestors, without their fill, stroke and shadow.
- **Where it has no effect:** in a component with `screen` and inside a `component` node, which have no child markings.

Annotation type: `scroll` (Scroll). It has no fields: mark the content blocks inside it.
