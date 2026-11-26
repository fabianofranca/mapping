# Expand item

A tile (40 × 40, minimum 24 × 24) with a root `weight` that comes from the `weight` field (a number greater than 0).

Inside an Expand row the tile takes a share of the free width in proportion to its weight: two tiles with weights 1 and 2 split the free space 1 to 2. With the field empty the tile has no weight and keeps its width, so the weight is optional, like Compose `Modifier.weight` or CSS `flex-grow` on only some children.

`sizing` `fill` alone does not grow a child in Arrange: only a root `weight` does.

Annotation type: `expand-item` (Expand item). Field: `weight` (number, no default).
