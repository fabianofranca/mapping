# Signal

A round indicator (a 40 px ellipse) with a ring icon on top. The icon is `signal` in `icons/icons.json`: a ring whose hole comes from an `evenodd` fill rule.

- **Shadow numbers by expression:** the ellipse's outer shadow takes `y` and `blur` from a `$switch` over the `size` field (`formatVersion` 4). `x`, `y`, `blur` and `spread` accept an expression, in a single shadow and in each item of a list.
- **Sizes:** `s` is `y` 2 and `blur` 4, `m` is 4 and 8, `l` is 8 and 16.
- **A bad result:** a negative `blur` draws 0 and a value that is not a number draws 0; both warn `invalid value in shadow.<key>: <value>`.

Annotation type: `signal` (Signal).

| Field  | Type | Description                       |
| ------ | ---- | --------------------------------- |
| `size` | enum | `s`, `m` or `l`: the shadow (`m`) |
