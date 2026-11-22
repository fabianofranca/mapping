# Uneven grid

A list row and a 12-column grid that show a grid with tracks of different sizes (`columns` as a list, `formatVersion` 4). An integer (`"columns": 3`) still means equal `1fr` tracks; a list gives each track its own size.

- **List row:** `"columns": [56, "1fr", "hug"]` is a fixed 56 px leading column (the square), a text column that takes what is left (`1fr`) and a trailing column that is as wide as its text (`hug`). With a long subtitle the middle column shrinks, never the other two.
- **Tracks:** each item is a number of px, `"<n>fr"` (a share of what is left, `"2.5fr"` is allowed) or `"hug"` (the largest child with `span` 1 placed in that track). A list has 1 to 24 tracks; `"0fr"`, a negative number and `"auto"` are errors at the item.
- **12-column grid:** a list of twelve `"1fr"` tracks, with children that use `span` (8 + 4, 4 + 4 + 4, 3 + 3 + 3 + 3). A child that spans several tracks occupies their sum plus the gaps between them.
- **Rows:** the same list works in `rows` for the horizontal grid, which fills columns from top to bottom.
- **Hug:** a grid that hugs its width is the px tracks, the `hug` tracks and the gaps; with `fr` tracks it also asks for the largest cell width divided by its `n`, times the total of `n`.
- **Where it applies:** the frame, a `repeat` with `layout`, a slot (Arrange puts each child marking in its cell) and the screen without geometry.

Annotation type: `uneven-grid` (Uneven grid).

| Field      | Type   | Description                                                      |
| ---------- | ------ | ---------------------------------------------------------------- |
| `title`    | string | The first line of the list row (`Weekly report`)                 |
| `subtitle` | string | The second line, in the `1fr` column (`Updated 2 hours ago`)     |
| `trailing` | string | The text of the `hug` column (`12:40`)                           |
| `accent`   | string | The color of the leading square and the darker cells (`#7C3AED`) |
