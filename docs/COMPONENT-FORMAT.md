# Component format (`mapping-component`, `formatVersion` 1, 2, 3 and 4)

The format of the file that draws an annotation type: a **component**. It is for whoever writes one by hand or generates one (the `spec-author` skill and agents). The component lives inside a library package (see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Library: the package"); this document describes only its file.

Supporting files:

- `docs/component.schema.json`: JSON Schema (draft 2020-12) of the structure. It is documentation: the source of truth is the code (`src/model/components/parseComponent.ts`), and a test checks the schema against the Material 3 components and against the parser.
- `libraries/material3-compose/components/*.json`: real components (50 Material 3 types); the examples in this document come from components like these, shortened. The executable source is in `examples/libraries/sdui-backend/`.
- The engine that reads the format: `src/model/components/` (`componentFormat.ts`, `parseComponent.ts`, `expressions.ts`, `instantiate.ts`, `layout.ts`, `arrange.ts`, `origin.ts`). Pure, no DOM: it runs in the browser and in Node.

## What a component is

A component is the **generic drawing** of an annotation type: a tree of neutral primitives (frame, rectangle, ellipse, text, path, slot, in `formatVersion` 2 `repeat`, in 3 `image` and, in 4, the stroke with cap, join and sides, the layout with an expression, the `min`/`max` size limits, the `distribute` of `repeat` and the rich text in `runs`) whose attributes can be **bound to the fields** of the type by expressions. Changing the value of a field redraws the component.

- **One file per component.** The specialization's type only references it, with the `component` key (`"component": "components/button.json"`).
- The path is **relative to the specialization file**, with `/`, no `..`, no leading `/` and no drive letter, and ends in `.json`.
- The component's `id` does **not** need to equal the `id` of the type that references it. A single file cited by two types produces a warning from the library validator.
- The component **does not declare fields**: they come from the type. The file only says how the values appear in the drawing (`preview` carries example values).
- A type without `component` remains valid, it just has no drawing.
- **Motion vs. state appearance.** The drawing is a still frame: no animation, animated ripple or state change by the mouse. The **appearance** of an interaction state (hover, focus, pressed, dragged) is drawable and, when the source defines it (the design system's state tokens), it enters as an optional `enum` field of the type, outside the `code`, like disabled and selected. When listing what stays out in a plan or in the Fidelity, separate motion (out) from state appearance (field). Example from the `material3-compose` library: the `interaction` field of `button` (`none`, `hovered`, `focused`, `pressed`) picks a `rect` layer with the state's opacity token, and a `$switch` over it changes the elevation; with disabled turned on the layer does not draw.

## The file root

```json
{
  "format": "mapping-component",
  "formatVersion": 1,
  "id": "button",
  "name": "Button",
  "description": "Button with a label; hug width, 40 tall.",
  "size": { "width": 120, "height": 40 },
  "minSize": { "width": 48, "height": 40 },
  "sizing": { "width": "hug", "height": 40 },
  "preview": { "label": "Label", "variant": "filled" },
  "template": {
    "type": "frame",
    "name": "button",
    "layout": {
      "type": "row",
      "padding": [0, 24],
      "align": "center",
      "justify": "center"
    },
    "cornerRadius": 20,
    "fill": {
      "$switch": "variant",
      "cases": { "filled": "#6750A4", "tonal": "#E8DEF8" },
      "default": "rgba(0, 0, 0, 0)"
    },
    "children": [
      {
        "type": "text",
        "name": "label",
        "text": { "$field": "label", "default": "Label" },
        "font": { "family": "Roboto", "size": 14, "weight": 500, "lineHeight": 20 },
        "color": {
          "$if": { "$eq": ["variant", "filled"] },
          "then": "#FFFFFF",
          "else": "#6750A4"
        }
      }
    ]
  }
}
```

| Property        | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`        | yes      | Always `"mapping-component"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `formatVersion` | yes      | `1`, `2`, `3` or `4`. `2` is `1` plus the `repeat` node (the drawn table); `3` is `2` plus the `image` node; `4` is `3` plus `stroke.cap`, `stroke.join`, `stroke.sides`, `stroke.offset` and `stroke.gap`, `stroke.dash` by expression, `shadow.spread` and `shadow` as a list, `$token` in `shadow` and in the items of `cornerRadius` and of `stroke.dash`, `alpha` and `over` in the color `$token`, `font.align` `justify`, the image `fit` values `fill-width`, `fill-height`, `scale-down` and `none`, `layout.justify` `space-around` and `space-evenly`, `layout.reverse`, `layout.wrap`, `layout.lineGap`, `layout.maxPerLine` and `layout.maxLines` (and the four in `repeat`), expression in `layout.type`, `layout.align`, `layout.justify`, `width` and `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` and `repeat.distribute`, `layout.align` and `layout.justify` in `none`, `clip` of the slot and `clip` of the frame by expression and the reading direction (`direction` on the node, `anchors.start`/`end`, `font.align` `start`/`end`, `mirror` on `icon` and `path`, the `$direction` condition). `repeat` in a `1`, `image` in a `1` or `2` and the keys of `4` in a lower one are an error. The two-pass measurement ("Sizing") applies in all versions. All four are accepted. |
| `id`            | yes      | Text matching the pattern `^[a-z0-9][a-z0-9-_]*$`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `name`          | yes      | Display name, not empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `description`   | no       | Help text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `size`          | yes      | `{ width, height }`, positive numbers (px). **Initial** size of the instance and, without `sizing`, the size of both axes in size-based arrangement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `minSize`       | no       | `{ width, height }`, positive and **not greater** than `size`. Floor of resizing and of every computed size.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sizing`        | no       | `{ width?, height? }`: sizing of an instance **without a rectangle** (see "Sizing").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `screen`        | no       | Only in `formatVersion` 4: draws the component in screen pixels (see "Screen pixels: `screen` and `stroke.scale`").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `anchor`        | no       | Only in `formatVersion` 4: how the type prefers to attach to the anchor (see "Anchor"). `{ side?, align?, offset? }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `preview`       | no       | Example values of the fields (`key` → text, number or `null`; in a `table` field, the list of rows), used when creating an instance, in the Catalog and in the drawing check. The fields come from the type, not from here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `template`      | yes      | The root of the drawing. It must be a `frame` node; it fills the instance's whole rectangle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Any other key at the root is a problem (the format is strict).

## Template nodes

Each node has a `type` (`frame`, `rect`, `ellipse`, `text`, `path`, `slot`, in `formatVersion` 2 `repeat`, in 3 `image` or, in 4, `icon`) and the common keys below. The keys of each type come afterward. **An unknown key is a problem**, so that typos show up.

| Key                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`                                           | Node name (shows up in warnings and in the tree). Optional.                                                                                                                                                                                                                                                                                                                                                                                            |
| `visible`                                        | Boolean expression (see "Expressions and conditions"). An invisible node takes no space and does not take part in the arrangement. Default: visible.                                                                                                                                                                                                                                                                                                   |
| `opacity`                                        | Number from 0 to 1 (accepts an expression). Default 1.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `rotation`                                       | `formatVersion` 4. Rotates the node in degrees, clockwise, around the center of the box (accepts an expression); drawing only. Applies to every node except the root (see "Rotation: `rotation`"). Default 0.                                                                                                                                                                                                                                          |
| `width`, `height`                                | Node size (see "Sizing"): px, `"fill"`, `"hug"` or `"NN%"`. In `formatVersion` 4 they accept an expression (see "Sizing").                                                                                                                                                                                                                                                                                                                             |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | `formatVersion` 4. Limits of the node size, in px (number greater than or equal to 0; they accept an expression). They apply to any node, after `fill`/`hug`/`%` are resolved (see "Size limits").                                                                                                                                                                                                                                                     |
| `direction`                                      | `formatVersion` 4. `"ltr"` or `"rtl"` (literal, never an expression): fixes the reading direction of the subtree (see "Reading direction"). Applies to every node except `repeat`, where `direction` remains the stacking of the rows (`row`/`column`). Without the key, the node follows its parent's direction.                                                                                                                                      |
| `anchors`                                        | `{ left?, right?, start?, end?, top?, bottom?, centerX?, centerY? }`. Only takes effect when the parent is a frame with `layout: none`. `start` and `end` are logical (`formatVersion` 4; see "Reading direction").                                                                                                                                                                                                                                    |
| `fill`                                           | CSS color (`#rrggbb`, `#rrggbbaa`, `rgba(...)`), `"none"` or gradient `{ "type": "linear", "angle": 90, "stops": [{ "offset": 0, "color": "#fff" }, …] }` (at least 2 stops, `offset` from 0 to 1; 0° goes from left to right and 90° from top to bottom). Accepts an expression.                                                                                                                                                                      |
| `stroke`                                         | `{ color, width?, align?, dash? }`. `color` is required and accepts an expression; `width` defaults to 1; `align` is `inside` (default; `center` in `path`), `center` or `outside`; `dash` is the list of lengths (in `formatVersion` 4, also by expression and with `$token` in the items). Color `"none"` turns it off. In `formatVersion` 4 it also accepts `cap`, `join`, `sides`, `offset` and `gap` (see "Stroke: cap, join and sides").         |
| `shadow`                                         | `{ color, x?, y?, blur?, spread? }`, or, in `formatVersion` 4, a **list** of 1 to 4 of these objects (see "Shadows: list and `spread`"). `color` is required (`"none"` turns it off); `x` and `y` in px; `blur` greater than or equal to 0. In `formatVersion` 4, `x`, `y`, `blur` and `spread` accept a number `{ "$token": … }` (and only `$token`; a `blur` that resolves negative is 0, with the warning `invalid value in shadow.blur: <value>`). |
| `cornerRadius`                                   | Number greater than or equal to 0 or list of 4 (top-left, top-right, bottom-right, bottom-left). Accepts an expression. In `formatVersion` 4, each item of the list also accepts a number `{ "$token": … }` (`[{ "$token": "corner-extra-small" }, 0, 0, { "$token": "corner-extra-small" }]`). Applies to `frame` and `rect`.                                                                                                                         |

### `frame`

The node that groups. The children go in `children` and are distributed according to the `layout`.

| Key        | Description                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`   | `{ "type": "none" }` (default), `row` or `column` (see "Sizing"). In `formatVersion` 4, `type`, `align` and `justify` accept an expression, and there is `reverse`.                                                                                   |
| `children` | List of nodes.                                                                                                                                                                                                                                        |
| `clip`     | Clips the children to the frame's box (and its stroke and shadow, see "Root clipping"). Default `true` at the template root and `false` in the other frames. In `formatVersion` 4, it accepts an expression (see "`clip` on the frame and the slot"). |
| `let`      | (`formatVersion` 4) Frame variables: name → expression, used with `{ "$var": "name" }` in the frame and in descendants (see "Variables: `let` and `$var`").                                                                                           |

### `rect` and `ellipse`

Only the common keys. `rect` accepts `cornerRadius`.

### `text`

| Key               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`            | Required, unless there is `runs` (one or the other). Text or number, or expression (`$field`, `$concat`…). A number becomes text; empty becomes empty text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `color`           | Text color (accepts an expression). Default `#000000`; `"none"` hides it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `baselinePadding` | `formatVersion` 4. `{ top?, bottom? }` (px greater than or equal to 0, accept an expression), like Compose's `Modifier.paddingFromBaseline(top, bottom)`: `top` is the distance from the top of the node's box to the **first** baseline; `bottom`, from the **last** baseline to the bottom of the box. See "Baseline".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `runs`            | `formatVersion` 4. Non-empty list of runs, in place of `text`: rich text, with weight, color and a background box in the middle of the line (see "Rich text: runs and inline box").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `font`            | `{ family?, size?, weight?, italic?, lineHeight?, letterSpacing?, align?, verticalAlign?, decoration?, wrap?, ellipsis?, maxLines? }`, all accepting an expression. Defaults: `size` 14, `weight` 400 (from 100 to 900), `italic` false, `lineHeight` 1.2, `letterSpacing` 0, `align` `start` (`left`, `center`, `right`, or, in `formatVersion` 4, `justify`: the text fills the width of the box and the last line of each paragraph stays on the left, like `TextAlign.Justify`, rich text, with `runs`, still draws `justify` as `left`; and `start` and `end`, logical: `start`, the default in `formatVersion` 4, is left in `ltr` and right in `rtl`, and `end` the opposite, see "Reading direction". In a lower `formatVersion` the default remains `left` and `start`/`end` are a version error; in `ltr` the `start` default draws like the usual `left`), `verticalAlign` `top` (`top`, `middle`, `bottom`, or `cap-middle` in `formatVersion` 4: see "Centering on the capital: `cap-middle`"), `decoration` `none` (`underline` or `line-through`). `lineHeight` up to 3 is a multiple of the size; above that it is px. As in CSS, px is the line height as is (not rounded up) and the multiple is multiplied by the size without rounding before multiplying by the lines: 2 lines of `lineHeight` 18.5 measure 37 and of 1.4 × 13, 36.4. `wrap`, `ellipsis` and `maxLines` are `formatVersion` 4 only (see "Single-line text, ellipsis and `maxLines`"). `family` is a family (`Roboto`) or a CSS stack (`system-ui, "Segoe UI", Roboto, sans-serif`): the stack is used as is, a name with a space may come in quotes (`"Segoe UI"`), and a generic name (`system-ui`, `monospace`) stands alone, without quotes; a library font (`fonts`) is used if the stack starts with its name. A value that CSS does not accept (unclosed quotes, empty item) produces a **warning** in validation and the text falls back to `sans-serif`. Without `family`, the drawing uses the built-in `font-sans` token, the host theme's font (the fixed `Inter` is gone; see "Design tokens (`$token`)"). **Warning:** the width of a text without `family` changes relative to the versions that used `Inter`, and with it the `hug`, the line wrapping and the `text larger than the box`; whoever needs a stable width declares the `family`. |

The text **wraps** when the node has a defined width (px, `fill` or `%`) and **does not wrap** when the width is `hug`. Without `width` and `height`, the text is `hug` on both axes (all other nodes are `fill`).

### `image` (remote image, `formatVersion` 3)

Shows an image from an `https://` URL (avatar, photo, logo whose URL comes from the data). Example, an avatar with a name:

```json
{
  "type": "frame",
  "name": "avatar",
  "layout": { "type": "row", "gap": 8 },
  "children": [
    {
      "type": "image",
      "name": "photo",
      "src": { "$field": "foto" },
      "fit": "cover",
      "width": 40,
      "height": 40,
      "fill": "#e0e0e0",
      "cornerRadius": 20
    },
    { "type": "text", "text": { "$field": "nome" }, "width": "fill" }
  ]
}
```

| Key    | Description                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`  | Required. A literal `https://...` text or exactly `{ "$field": "<field>" }` (see below).                                                                                                                                                                                                                                                                                                                                          |
| `fit`  | `cover` (default: fills the box and crops the excess), `contain` (fits entirely) or `fill` (stretches). In `formatVersion` 4: `fill-width` and `fill-height` (fill the width or the height, centered and clipped, Compose's `FillWidth` and `FillHeight`), `scale-down` (like `contain`, without enlarging) and `none` (natural size, centered), with the sizes of the downloaded image. The MCP PNG still draws the placeholder. |
| common | `name`, `visible`, `opacity`, `width`, `height`, `anchors`, `fill` (the background, behind the image), `stroke`, `shadow` and `cornerRadius`.                                                                                                                                                                                                                                                                                     |

- **Restricted `src`.** Only the literal or `{ "$field": "<field>" }`, without `default`. `$concat`, `$switch`, `$if` and any other expression are an error. Reason: the component must not be able to build a URL from the values of other fields, which would send project data to the server of whoever wrote the specialization.
- **Literal.** It must be an absolute `https://` URL, without username and password, up to 2048 characters. `http:`, `data:` and a relative path are an error (the relative one is refused so that it can become a local package image in the future without ambiguity).
- **The field bound** to `src` must be `string` (in `repeat`, a `string` column of the `table`); the library validator checks it. No source declaration: the URL is the value of a field like any other.
- **Size.** `width`/`height` `"hug"` is an **error**: the arrangement never depends on the downloaded image, so that the drawing is the same in the app, in MCP and before loading. The default for both axes is `fill`, as in the other nodes that are not text. Use px, `fill` or `%`.
- **Placeholder.** While the image has not loaded, without consent from the origin, with a refused URL or on failure, the node draws the placeholder (the gray box with an X). The MCP server **never downloads** the image and always draws the placeholder.
- **Consent.** The image is only requested from the network after the person allows that origin in the app (Settings › Privacy); nothing is saved in the project beyond the URL.
- It applies inside the `template` of a `repeat` (the `src` binds to a `string` column).

### `path`

| Key        | Description                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `d`        | Required. SVG path data, or an expression (a `$switch` swaps the icon).                                                                                                              |
| `viewBox`  | Required. Positive `[width, height]`: the box in which `d` was drawn; the path is scaled to the node's box.                                                                          |
| `fillRule` | `nonzero` (default) or `evenodd`.                                                                                                                                                    |
| `mirror`   | `formatVersion` 4. Boolean or expression (default `false`): in `rtl` the path is mirrored horizontally inside the node's box (see "Reading direction"). In `ltr` it changes nothing. |

A different scale on the two axes (node box with a different proportion than the `viewBox`) stretches the icon and produces a warning.

### `icon` (icon from the library's set, `formatVersion` 4)

Draws an icon from the set declared in `icons` in the specialization (`formatVersion` 15; see `docs/SPEC-FORMAT.md`, "Icon set"), instead of a `$switch` with all the paths inside the component.

```json
{
  "type": "icon",
  "name": { "$field": "icone" },
  "color": { "$token": "primary" },
  "width": 24,
  "height": 24
}
```

| Key           | Description                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Required. The name of the icon in the set: text or expression (`$field`, `$switch`…). It is the name of the **icon**: the `icon` node has no node name.                                                                                           |
| `color`       | Node color (expression); default `#000000`. Paints the paths without their own color and those that ask for the node's color (`fill` or `stroke` `true`).                                                                                         |
| `strokeWidth` | Width of the strokes, in units of the icon's `viewBox` (expression); replaces the `width` of all stroked paths.                                                                                                                                   |
| `mirror`      | Boolean or expression: in `rtl` the icon is mirrored horizontally inside the node's box. Without the key, the icon's `mirror` in the set applies (`mapping-icons` `formatVersion` 2), which in turn defaults to `false`. See "Reading direction". |
| common        | `visible`, `opacity`, `width`, `height` (`hug` = the icon's `viewBox`), `minWidth`…, `anchors`, `fill`, `stroke`, `shadow` and `cornerRadius`.                                                                                                    |

- **Scale.** The paths are drawn in the icon's `viewBox` (its own, otherwise the set's) and scaled to the node's box; a different proportion stretches and produces the warning `stretched icon: different scale on the two axes`. The stroke width scales along.
- **Color.** `color` paints only what has no color of its own: `fill` or `stroke` `true` and the path with neither `fill` nor `stroke` use the node's color; `fill`/`stroke` with a color of their own keep it.
- **Name outside the set.** In the drawing (name coming from a field, or without a loaded set) the node becomes the **placeholder** and the warning `unknown icon: <name>` accompanies it. A **literal** name outside the set is a `validate_library` error (level 2), and an `enum` field bound to the `name` with an option outside the set is a warning (level 3).
- In a component `formatVersion` lower than 4: `template.children[0].type: only allowed with formatVersion 4`.

### `slot`

The space reserved for other instances: the **child marking** of a marking with this type is drawn inside the slot. A component with a slot receives child markings inside the slot.

| Key       | Description                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `label`   | Text of the slot's label (accepts an expression). Default: the node's `name`.                                                                                                                                                                                                                                                                          |
| `layout`  | How the children are organized: `row` or `column` (with `gap`, `padding`, `align`, `justify`) or `none`/absent (each child stays where it is; the `none` slot with `align`/`justify`, `formatVersion` 4, aligns the children in the slot's box when the person asks for **Arrange**, see "Aligned overlay"). `gap` and `padding` can come from fields. |
| `clip`    | `formatVersion` 4. Boolean or expression (default `false`): the child markings drawn inside the slot are clipped by the slot's box. See "`clip` on the frame and the slot".                                                                                                                                                                            |
| `provide` | `formatVersion` 4. Values that the slot **offers** to the child markings: `{ "<name>": <text or number expression> }`, the content color, for example. Each value is resolved in the parent (its fields, tokens and mode) and the child reads it with `$provided`. See "Inherited color".                                                              |

The slot is the space; what is drawn inside it are the children. Its `width`, `height` and `anchors` work as in any node. An invisible slot (`visible` false) ignores the children.

### `repeat` (the drawn table, `formatVersion` 2)

Repeats the drawing of **one row** per row of a `table` field of the type: this is how a data table (the events of a screen, the properties of a call) becomes a drawing, without numbered fields (`label1`, `label2`…).

```json
{
  "type": "repeat",
  "name": "rows",
  "field": "linhas",
  "direction": "column",
  "gap": 4,
  "template": {
    "type": "frame",
    "name": "row",
    "layout": { "type": "row", "gap": 12 },
    "children": [
      { "type": "text", "text": { "$field": "chave" }, "width": "hug" },
      { "type": "text", "text": { "$field": "valor" }, "width": "fill" }
    ]
  }
}
```

| Key          | Description                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field`      | The `key` of the type's `table` field whose rows are repeated. **Exactly one of `field` and `count`.**                                                                                  |
| `count`      | `formatVersion` 4. Repeats the `template` `max(0, floor(count))` times, without a `table` field (see "Repeat by count" below). Number or number expression.                             |
| `template`   | Required. A `frame` node: the drawing of **one** row. It cannot have `repeat` or `slot` inside.                                                                                         |
| `direction`  | `column` (default: the rows stack) or `row` (side by side).                                                                                                                             |
| `layout`     | `formatVersion` 4. A complete `layout` (`row`, `column` or `grid`) in place of `direction` + `gap` (see `repeat.layout` below).                                                         |
| `distribute` | `formatVersion` 4. `"none"` (default) or `"fill"`: with `fill`, the `repeat` fills the parent's axis and the rows divide the rows' axis equally (see below).                            |
| `gap`        | Space between the rows in px (accepts an expression over the type's fields). Default 0.                                                                                                 |
| `wrap`       | `formatVersion` 4. `"none"` (default), `"wrap"` or `"wrap-reverse"`: the rows of the `repeat` break into lines (see "Line wrapping" in "Layouts: `none`, `row`, `column` and `grid`").  |
| `lineGap`    | `formatVersion` 4, only with `wrap`. Space between the lines in px (accepts an expression). Default 0.                                                                                  |
| `maxPerLine` | `formatVersion` 4, only with `wrap`. Rows of the `repeat` per line, at most (integer greater than or equal to 1).                                                                       |
| `maxLines`   | `formatVersion` 4, only with `wrap`. Lines, at most (integer greater than or equal to 1): the rows beyond the last line are not drawn (warning `<n> children beyond maxLines: <node>`). |
| common       | Only `name`, `visible`, `opacity`, `width`, `height` and `anchors`. `fill`, `stroke`, `shadow` and `cornerRadius` do not apply to `repeat` (the drawing belongs to the `template`).     |

How the `template` reads the row:

- Inside the `template`, `{ "$field": "<column>" }` (and `$has`, `$eq`, `$switch`, in any expression or condition) reads the **row's column**. A column **shadows** the type's field of the same name; whatever is not a column keeps reading the type's field (a `{ "$field": "titulo" }` inside the `template` shows the annotation's title in each row). What counts as a column is what the rows carry, and the library validator checks that each cited key is a column of the `table` or a field of the type.
- The row values arrive as text, number or empty. In a `ref` column (see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Value types"), the cell arrives as the **target's text**, resolved one level like the `ref` field: the row's label (`rowLabel`) when the target is a table row, the value of the free tuple, the value of the simple field; a broken target, in a cycle or more than one level deep becomes empty and warns (`broken reference: table[2].column`). The `ref` column does **not** draw an arrow: it is data.
- A table without rows (or null) draws an empty frame. The order of the rows is that of the field.

How the `repeat` is sized (it is a frame underneath): `hug` on the **rows' axis** (the height in `column`, the width in `row`) and `fill` on the other, unless `width` or `height` say otherwise; and the `template` is also `hug` on the rows' axis if it does not say otherwise. So the component's height follows the **measured** number of rows, but the marking's box does not grow by itself: too many rows for the box come out clipped (the root clips) and the drawing warns `content larger than the box` (the marking gets the pending item that the component does not fit). The component's `preview` carries a few example rows, which the Catalog and the drawing check use.

**`distribute: "fill"` (`formatVersion` 4).** For a list that fills the height its parent gives it (and not that of the measured rows), with rows of equal heights:

- the `repeat` fills the parent's axis, like a `fill` child (the height in `column`, the width in `row`);
- the rows divide the rows' axis **equally**, after discounting the `gap`s: the `template`'s `fill` on that axis (or the omitted axis) is the fraction; an explicit value (px, `hug` or `%`) in the `template` or in the `repeat` stays as written, and the `fill` rows divide only what is left;
- without `distribute` (or `"none"`), a `fill` in the `template` on the rows' axis is still worth 0, with the warning `fill inside hug becomes 0`.

```json
{
  "type": "repeat",
  "field": "linhas",
  "gap": 4,
  "distribute": "fill",
  "template": { "type": "frame", "layout": { "type": "row" }, "children": [] }
}
```

`distribute` in a `formatVersion` lower than 4 is an error (`template.children[0].distribute: only allowed with formatVersion 4`).

**`repeat.layout` (`formatVersion` 4).** The `repeat` accepts `layout`, a complete `layout` like a frame's (`row`, `column` or `grid`, with `gap`, `lineGap`, `columns`, `minColumnWidth`, `rows`, `minRowHeight`, `align`, `justify`, `reverse`, `wrap`, `padding`), in place of `direction` + `gap`. The expressions inside it apply as in any frame (`$rows`, `$size`, `$field`). The `template` remains the drawing of **one** row, which in a grid is a **cell** (and the `template` is `fill` in the cell, not `hug` on the rows' axis as in the column). Without `distribute`, the frame generated by a grid is `hug` on both axes (the grid hugs the cells); the `repeat`'s own `width`, if any, rules. The equal segments of a `SegmentedButton`, by the widest label (Compose's `IntrinsicSize.Min`):

```json
{
  "type": "repeat",
  "name": "segments",
  "field": "options",
  "width": "hug",
  "layout": { "type": "grid", "columns": { "$rows": "options" } },
  "template": {
    "type": "frame",
    "name": "segment",
    "layout": { "type": "row", "justify": "center", "padding": [0, 12] },
    "children": [{ "type": "text", "text": { "$field": "label" } }]
  }
}
```

- **`layout` together with `direction` or `gap` is an error** (`repeat.layout: does not combine with direction or gap`). `wrap`, `lineGap`, `maxPerLine` and `maxLines` loose on the `repeat` remain as before (without `layout`); with `layout`, they are an error (`repeat.layout: the key goes inside layout (wrap)`): those inside the `layout` apply. `repeat.layout` with `type: "none"` is also an error (`repeat.layout: use row, column or grid`). `span` and `weight` on the `repeat` itself apply to the frame it generates.
- **`distribute: "fill"` with a literal `layout.type` of `grid` is an error** (`distribute: does not apply with layout grid`); with `row`/`column` in the `layout` it applies as with the equivalent `direction`.
- In a `formatVersion` lower than 4, `layout` on the `repeat` is an error (`only allowed with formatVersion 4`, at the key's path).

**Repeat by count and `$index` (`formatVersion` 4).** The `repeat` accepts `count` in place of `field`: the `template` repeats `max(0, floor(count))` times, without a table. It serves for what is a number and not data: the days of a month, the ticks of a dial, the dots of a page indicator.

```json
{
  "type": "repeat",
  "count": 31,
  "direction": "row",
  "template": {
    "type": "frame",
    "children": [{ "type": "text", "text": { "$add": [{ "$field": "$index" }, 1] } }]
  }
}
```

- **`count`** is a number or a number expression (`{ "$field": "n" }`, `{ "$rows": "items" }`, a calculation). A negative or non-integer literal is an error (`template.children[0].count: expected an integer greater than or equal to 0`); an expression that gives negative or no value is 0, and the fractional part is dropped (`3.9` is 3).
- **Cap of 1000 rows.** Above that, 1000 rows come out and the drawing warns `repeat limited to 1000 rows: <node name>` (`repeat` when the node has no `name`).
- **`{ "$field": "$index" }`** inside the `template` is the **row index** (0, 1, …), in the `repeat` by `count` and in the one by `field`. It goes through the same shadowing as the columns and is **not a field of the type**: it does not need to be declared nor does it count as an unused field. In a `repeat` inside another, the innermost one applies. `$index` outside a `repeat`'s `template` is an error (`template.children[0].text.$field: $index only applies inside a repeat`).
- In a `repeat` by `count`, the rest of the `template` reads **fields of the type** (there are no columns); the library validator checks that each cited key is a field of the type.
- `count` and `$index` in a `formatVersion` lower than 4 are an error (`only allowed with formatVersion 4`, at the key's path).

### Stroke: cap, join and sides (`formatVersion` 4)

In `formatVersion` 4 the `stroke` gains five keys (`cap`, `join` and `sides` accept an expression; `offset` accepts a literal or `$token`; `gap` is an object with `padding` by expression) and they only apply from 4 on: in a lower version the parser refuses with `<key path>: only allowed with formatVersion 4` (e.g. `template.children[0].stroke.cap: only allowed with formatVersion 4`).

| Key      | Description                                                                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cap`    | The stroke's end (where it starts and ends, at the ends of dashed lines and of the `sides` sides): `butt` (default), `round` or `square`.                                                                                                                                                                         |
| `join`   | The corner between two stroke segments: `miter` (default, sharp point), `round` or `bevel`.                                                                                                                                                                                                                       |
| `sides`  | Non-empty list, without repetition, of `top`, `right`, `bottom` and `left`: only those sides are stroked. Absent, or with all four sides, it is the whole outline (with the corner radius). Only in `frame` and `rect`; in `ellipse` and `path` it is an error (`only valid in frame and rect (this is <type>)`). |
| `offset` | Distance of the stroke from the shape, in px greater than or equal to 0 (literal or number `{ "$token": … }`). Only in `frame`, `rect` and `ellipse`; in `path` and the others it is an error (`only valid in frame, rect and ellipse (this is <type>)`).                                                         |
| `gap`    | The outline interrupted over a template node: `{ "node": "<name>", "padding"?: Expr<number> }` (`padding` defaults to 0). Only in `frame` and `rect`, and not valid together with `sides`. See below.                                                                                                             |

- `sides` can come from an expression that returns the list (a `$switch` with one list per case, for example).
- With `cornerRadius` and partial sides, the stroke is **straight**: there is no arc at the corner.
- The requested sides have the **same** color, width, `align` and `dash`. A different color or width per side calls for **two nodes** (see "Known limits").
- The MCP server's raster (`get_marking_image`) respects `cap`, `join` and `sides`.
- **`offset`** draws the stroke over the outline of the shape **grown** by `offset` on each side, with the radius of each corner + `offset` (like CSS's `outline-offset`); the `align` applies relative to that outline. With `sides`, the offset applies only to the requested sides. The root's enlarged clip counts `offset` + the stroke's extent (see "Root clipping"), so a child `rect` that fills the shape, with an `outside` stroke and `offset` 2, draws the Material 3 focus ring outside the box (3 wide, offset 2). The scene carries the value in `Stroke.offset`.
- **`gap`** (`frame` and `rect`) interrupts the outline where the box of a template node crosses it: it is the outline cutout of the `OutlinedTextField`, which follows the measured width of the minimized label. The outline is the usual one (with the radius of each corner), but the side that the named node's box crosses stays **without stroke over the stretch it covers, plus the `padding` on each side**. The arrangement computes the stretch (in the scene, `Stroke.gaps`, with `side`, `from` and `to` in px along the side); the app and the MCP raster only draw.
  - The **first node with that name** in template order applies (a node's default name is its type). An invisible node, or one that crosses no side, opens no gap.
  - The gap stays only on the **straight part** of the side: corners with a radius are never cut. The box used is the **unrotated** one (`rotation` does not count).
  - Errors: `stroke.gap.node: node not found: <name>`, `stroke.gap.node cannot cite the node itself: <name>`, `stroke.gap.node cannot cite a node inside a repeat: <name>`, `stroke.gap cannot be used inside a repeat` (the gap only opens on a node outside a `repeat` that is not the node itself), `gap does not apply with sides`, `only valid in frame and rect (this is <type>)`, missing `node` (`required field`) and unknown key in `gap` (`unknown key: <key>`). In a version lower than 4: `only allowed with formatVersion 4`, at the key's path.
- **`dash` by expression** (`formatVersion` 4): `$switch`, `$if` or `$field` that return the list, and number `{ "$token": … }` in each item. A resolved value that is not a list of numbers greater than or equal to 0 gives the warning `invalid value in stroke.dash: <value>` and no dashing. The literal list of numbers remains valid in all versions; an expression or `$token` in a lower version is `only allowed with formatVersion 4`.

```json
{
  "type": "frame",
  "name": "divider",
  "height": 48,
  "stroke": { "color": "#CAC4D0", "width": 1, "sides": ["bottom"] }
}
```

The outline of an outlined text field, with the gap over the minimized label (the `label` node, which rises above the border):

```json
{
  "type": "frame",
  "name": "outline",
  "cornerRadius": 4,
  "stroke": { "color": "#79747E", "width": 1, "gap": { "node": "label", "padding": 4 } }
}
```

### Shadows: list and `spread` (`formatVersion` 4)

In `formatVersion` 4 the `shadow` accepts an object (as before) or a **list of 1 to 4 shadows**, and each shadow gains `spread`. The list in a version lower than 4 is an error (`only allowed with formatVersion 4`, at the path of `shadow`); so is `spread` (at its path). An empty list or one with more than 4 items: `shadow: expected 1 to 4 shadows`. Each item of the list is an object with the same keys as a single shadow.

- The **first in the list stays on top**, as in CSS's `box-shadow`; the others come underneath, in order.
- **`spread`** (px, literal or number `{ "$token": … }`; negative is valid) grows the shadow's shape by `spread` on each side (or shrinks it, if negative), with the radii + `spread` (a straight corner stays straight), as in CSS. The `blur` blurs the already grown outline.
- It applies to `frame`, `rect` and `ellipse`, in the app, in the viewer and in the MCP raster. In other node types the `spread` is ignored, and a list on a type that is not `frame`, `rect` or `ellipse` draws only the first shadow (see "Known limits").
- The root's clip counts the `spread` and all the outer shadows (see "Root clipping"). The scene carries the shadows in `effects`, each with `spread`.

```json
{
  "type": "frame",
  "name": "card",
  "cornerRadius": 12,
  "shadow": [
    { "color": "#0000004D", "y": 1, "blur": 3 },
    { "color": "#00000026", "y": 4, "blur": 8, "spread": 3 }
  ]
}
```

### Screen pixels: `screen` and `stroke.scale` (`formatVersion` 4)

`screen` is a key **of the file root** (not of a node): `"screen": { "anchor": "top-left" }`. With it, the template is drawn at the component's `size` in **screen pixels**, at any zoom (it does not scale with the image or the zoom), anchored at the `anchor` point of the marking's rectangle. The marking stays in image pixels; only the drawing has a fixed size on screen, like the comment pins.

- `anchor`: `center` (default), `top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom` or `bottom-right`. The point of the drawing and the point of the rectangle with the same name coincide (in `center`, the centers).
- The drawing may extend beyond the marking's rectangle; for that reason the "does not fit" pending item is not generated for a component with `screen`.
- The size of the drawing is always the `size` (the marking's rectangle only says **where**); `sizing`, `minSize` and resizing the marking do not change the size of the drawing.
- Limit: the drawing in screen pixels is not a layout node; the children of a `slot` stay in their own rectangles and are not arranged inside it.
- `screen` with an unknown key or an `anchor` outside the set is an error with a path (`screen.anchor: expected one of: …`). In a version lower than 4: `screen: only allowed with formatVersion 4`. On a child node, `screen` is an unknown key.

`stroke.scale` (boolean literal, `formatVersion` 4): `true` (default) scales the stroke width with the zoom, like the rest of the drawing; `false` keeps the width in **screen pixels**, at any zoom (a stroke of 2 is 2 pixels at 50% and at 400%). In a lower version: `…stroke.scale: only allowed with formatVersion 4`.

### Rotation: `rotation` (`formatVersion` 4)

`rotation` (number in degrees, **clockwise**, accepts an expression) rotates the node around **the center of its box**. It applies to any node (`frame`, `rect`, `ellipse`, `text`, `path`, `icon`, `image`, `slot` and `repeat`), except the template root (`template.rotation: does not apply at the root`).

- **It is drawing only**, like CSS's `transform`: it does not change the layout, the measurement, the `hug`, the `fill`, the "does not fit" warnings or the node's box in the arrangement. Arrange and `hug` give the same result with and without `rotation`; the box that the marking and the anchors see is the unrotated one.
- **The children of a rotated frame rotate along**, and the frame's `clip` rotates with it (the root's clip does not rotate, because the root has no `rotation`). In a `repeat`, the `rotation` rotates the whole frame of the rows.
- **No value or 0 does not rotate**: an empty field is 0 and the drawing is the same as before, without `rotation`. Negative values and values above 360 are valid. An operand that is not a number makes the value not exist (see "Calculations and comparisons").
- **The same rotation in the app, in the viewer and in the MCP PNG.** A 40 × 10 `rect` with `rotation` 90 draws a vertical 10 × 40 bar centered on the same point. The hover and the clickable area follow the rotated shape.
- **Slot:** the content that the instance puts in a `slot` inside a rotated node is positioned by the unrotated box and **does not rotate** with the node.
- In a `formatVersion` lower than 4 the key is an error (`only allowed with formatVersion 4`).

The hands and handles of dials (which previously called for a table of positions) come from `rotation` or from `$sin` and `$cos` (see "Calculations and comparisons"); the center of the rotation is the center of the box, so to rotate around another point use a larger frame, with the drawing offset inside it.

### Root clipping

The template root (and an inner frame with `clip: true`) clips the children to the instance's box. In **all** versions, the clip also includes the extent of the stroke and shadow of the frame itself and of the children that go past the box **only** through stroke or shadow:

- an `outside` stroke is included whole and a `center` one by half (the `inside` already fits in the box); with `stroke.offset` (`formatVersion` 4) the offset is also included, per side of `sides` when there is one (an `inside` stroke offset by 2 sticks out 2 from the box);
- a shadow is included with its reach (the `blur` plus the `spread`, in `formatVersion` 4) and the displacement (`x`, `y`), per side; with a list of shadows, **the one that reaches farthest** applies, of all the outer shadows, not just the first.

The **content** (shapes and text) is still clipped to the instance's rectangle. In the scene, the enlarged clip is `FrameNode.clipBox`, a local rectangle present only when larger than the box. The ring of an `outside` stroke at the root, which used to vanish, now shows up.

## Units and density

Every number in the component file is in **component units**: `size`, `minSize`, `width`/`height` of the nodes,
`gap`, `padding`, `font.size`, anchors, radii, strokes, shadows and offsets. One unit is 1 dp on Android, 1 pt
on iOS and 1 CSS px at 1x; **write the component in logical units, never in pixels of a capture** (do not multiply
by 2 or 3).

What says how many image pixels one unit is worth is the **container**: `containers[].density` (from 0.5 to 8; default 1;
see [`FORMAT.md`](FORMAT.md), "Fields of v19"). In a 3x capture of a 360 dp phone, the density is 3: a `button`
with `size` 58 × 40 and `minSize` 58 × 40 takes up 174 × 120 px, and the 14-unit label comes out at 42 px. The marking's `rect`
stays in image pixels (`rect` = units × `density`).

- **What scales:** everything drawn in the component's space. The engine instantiates the component in the box **in
  units** (`rect` ÷ density) and the scene root carries `translate(rect.x, rect.y) · scale(density)`; text is measured
  in units (the measurement does not depend on the density) and drawn scaled.
- **What does not scale:** what is already in screen pixels. A component with `screen` measures `size` in screen pixels and
  `stroke.scale: false` keeps the width in output pixels; both ignore the density, as they ignore the zoom.
- **Marking sizes:** `minSize` is worth `minSize` × density (rounded up) as the marking's minimum size; the
  new instance is born at `size` × density; Arrange and fit-to-content measure in units and write in pixels.
- **Warnings:** the `missing` of `component-overflow` is in **image pixels** (the shortfall in units × density), because
  it is the `rect` that gets adjusted. The library check (`validate_library`) is in units and does not change.

## Sizing

There are three different questions: **how big the instance is** (the root), **how big each node inside the template is** and **how the children of a component with a slot are arranged**.

### The instance: `size`, `minSize` and `sizing`

- `size` is the **initial** size of the instance, in px, and applies when the instance **has a rectangle** (a marking in the editor, a `*.screen.json`): the marking's rectangle rules and the template adapts to it.
- `minSize` is the floor. No computed size falls below it (neither the divided `fill` nor the `hug`).
- `sizing` applies when the instance arrives **without a rectangle**, that is, in a screen coming from an external JSON (source, see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Sources") or arranged by `layoutScreen`, and **by action** on a marking (see "Fit to content", below): a marking's rectangle never changes by itself when a value is edited. Each axis is:
  - **px**: fixed size;
  - **`"fill"`**: takes up the space the parent gives on that axis;
  - **`"hug"`**: the size of the content (the measured template and, in a component with a slot, the children already arranged);
  - **`"min-content"`** and **`"max-content"`** (`formatVersion` 4): the content measured **without the parent's space limit**. In `sizing.width`, `max-content` is the size without wrapping (the `maxWidth` limit of the fit measurement does not apply) and `min-content` is the largest unbreakable piece (the widest word); in `sizing.height` both are worth `hug`. An axis measured this way counts as "follows the content", like `hug`. See "Intrinsic size" below;
  - **missing axis** (or missing `sizing`): the px of `size` on that axis;
  - **expression** (`formatVersion` 4): `$switch` by style, `$if` by a field… evaluated with the instance's values, which gives px (≥ 0), `"fill"` or `"hug"`. A value that is none of those (or an expression with no value) falls back to that axis's `size` with the warning `invalid value in sizing.height: <value>`. `$size` and `$lines` are not valid in `sizing` (the `sizing` is evaluated before measuring): they are a validation error (`sizing.height: $size is not valid in sizing`).

```json
"size": { "width": 360, "height": 200 },
"minSize": { "width": 160, "height": 96 },
"sizing": { "width": "fill", "height": "hug" }
```

The Material 3 card takes up the width of the column it is in and has the height of what it carries. A button `{ "width": "hug", "height": 40 }` has the width of the label and a height of 40.

```json
"sizing": {
  "width": "fill",
  "height": { "$switch": "style", "cases": { "small": 64, "medium": 112, "large": 152 } }
}
```

The Material 3 top bar measures 64, 112 or 152 depending on the style: in a screen without geometry, in the catalog playground and in the **Arrange** of a component with a slot, the axis is worth what the expression gives (a literal px `sizing` still applies only in a screen without geometry). The same evaluated `sizing` tells the drawing check what the component's **fitted size** is (see "Engine warnings").

**Fit to content.** The evaluated `sizing` is also what the marking's fit follows, and it only runs by **action** (never on load, when applying a proposal or when editing a value):

- the **new** instance is born at the measured size (without a `rect`, in the app and in the MCP's `create_marking`), with the `preview` and the given values; whoever gives the `rect` (the agent that reads the image, the drag) still rules, and a component with a slot is born at `size`;
- the app's **Arrange** (context menu, Details button, `Alt+Shift+A`) on a **slotless** component marking with a fittable axis, and the MCP's **`fit_marking`** op (in the batch, in the preview and in a proposal), take each axis to the measured size: `"hug"` (or the expression that gives `hug`) measures the content on the other, current axis, rounded up to an integer; an expression that gives px is worth the px; both between the `minSize` and the root's `minWidth`/`maxWidth`/`minHeight`/`maxHeight` (resizing by hand is not limited by them), never below a marking's minimum, and never beyond the image. The top-left corner stays; `fill`, the missing axis (the px of `size` do not come back) and the axis that the parent's `align: "stretch"` stretches do not change. Locked geometry fails (`locked`) and so does a component without a fittable axis (`not-fittable`). A component **with** a slot and children stays on the usual Arrange, which already fits its `hug` after arranging the children. Undo is a single entry.

So declare `sizing` `hug` (or an expression) on the axis that should **follow the content** (the height of a long-label button, the width of a chip) and none on fixed-size axes.

### A template node: `width` and `height`

| Value           | Meaning                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| number          | Fixed px.                                                                                                                                                                                                                    |
| `"fill"`        | Takes up what is left in the parent. In `row`/`column`, on the main axis, it splits what is left with the other `fill`s; on the cross axis and in `layout: none`, it takes up the parent's content area (minus the anchors). |
| `"hug"`         | The size of the content: measured text, a frame that hugs its children, path = `viewBox`, rectangle, ellipse and slot = 0.                                                                                                   |
| `"min-content"` | (`formatVersion` 4) The largest unbreakable piece of the content, without the parent's space limit. See "Intrinsic size".                                                                                                    |
| `"max-content"` | (`formatVersion` 4) The content without wrapping, without the parent's space limit. See "Intrinsic size".                                                                                                                    |
| `"NN%"`         | Fraction of the parent's **content area** (without the padding).                                                                                                                                                             |
| missing         | `hug` for text and `fill` for everything else, on both axes. In a `none` parent, a child with no size and no anchors takes up the whole parent.                                                                              |

**Expression in `width` and `height` (`formatVersion` 4).** The evaluated value must be a finite number greater than or equal to 0, a pure numeric text (`"120"` is worth 120 px), `"fill"`, `"hug"` or `"NN%"`. Any other value falls back to the node type's default (`hug` for text, `fill` for the rest) and the engine warns `invalid value in width: <value>` (or `height`). An invalid literal remains a validation error, in all versions. The expression may also give `"min-content"` or `"max-content"`.

#### Intrinsic size: `min-content` and `max-content` (`formatVersion` 4)

They are CSS's `min-content` and `max-content` (and Compose's `IntrinsicSize.Min`/`Max`). They apply to `width` and `height` of any node (except `image`) and to `sizing.width`/`sizing.height`. The computations include the frame's padding.

- **`max-content`**: the size without wrapping. **`min-content`**: the largest unbreakable piece.
- **`hug` does not change**: it remains the _shrink-to-fit_ limited by the parent's space. `min-content` and `max-content` are **not** limited to that space: a `max-content` `row` does not wrap and, if it is larger than the parent, the warning `content larger than the box` comes out as usual. The node's own `minWidth`/`maxWidth` still apply.
- **Height**: `min-content` and `max-content` are worth `hug` (the height the content asks for at the already-resolved width), as in CSS.

| Node or layout                            | `max-content` (width)                                                                                                                                                                                        | `min-content` (width)                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`                                    | the widest line (respects `\n`); never wraps                                                                                                                                                                 | the widest word; a word that crosses `runs` segments is a single one; the chip (a segment with a background) is atomic and counts whole with its breathing room; with `font.wrap: "none"` the whole line applies |
| `row`                                     | sum of the children's `max-content` + `gap`s                                                                                                                                                                 | without `wrap`: sum of the children's `min-content` + `gap`s                                                                                                                                                     |
| `row` with `wrap`                         | the same (a single line)                                                                                                                                                                                     | the largest `min-content` among the children                                                                                                                                                                     |
| `column`                                  | the largest child                                                                                                                                                                                            | the largest `min-content` among the children                                                                                                                                                                     |
| `none`                                    | the largest child: each child adds anchor start + size + anchor end; one centered by anchor counts only its size; one stretched by both anchors counts its own natural size (as in `hug`) plus start and end | the same, with the children's `min-content`                                                                                                                                                                      |
| `grid`                                    | _n_ tracks × the largest cell + `gap`s (with `span`)                                                                                                                                                         | _n_ × the largest `min-content` cell + `gap`s                                                                                                                                                                    |
| adaptive `grid` (`minColumnWidth`)        | all children in a single line                                                                                                                                                                                | one track of at least `minColumnWidth`                                                                                                                                                                           |
| horizontal `grid` (`rows`/`minRowHeight`) | the sum of the flow lines (each the size of the largest child) + `lineGap`                                                                                                                                   | the same                                                                                                                                                                                                         |
| `slot`                                    | the width of the slot's content                                                                                                                                                                              | the width of the slot's content (see "Known limits")                                                                                                                                                             |

**Each child's contribution to the measured parent.** A child in px contributes the px (between its `min*`/`max*`); a `fill` or `hug` child contributes its own `min-content`/`max-content`, in the parent's mode; a child with its own `min-content`/`max-content` contributes its own; a `"N%"` child contributes 0.

The engine keeps the intrinsic measurement per node and mode (the nested grid and row do not re-measure the subtree on every pass) and calls the text measurer at most once per (text, font, limit) in an instantiation.

```json
{ "type": "text", "text": "Pay now", "width": "min-content" }
{ "type": "frame", "width": "max-content", "layout": { "type": "row", "wrap": "wrap", "gap": 8 }, "children": [] }
```

The `image` node accepts neither (`the image node does not accept min-content or max-content: the layout does not depend on the downloaded image`). In a `formatVersion` from 1 to 3 the literal fails with `only allowed with formatVersion 4`, at the key's path (`width`, `height`, `sizing.width`, `sizing.height`). By expression, the invalid value falls back to the axis default with the warning `invalid value in width: <value>` (likewise `height` and `sizing.<axis>`).

### Size limits: `minWidth`, `maxWidth`, `minHeight`, `maxHeight` (`formatVersion` 4)

Four keys on **any** node, in px (a number greater than or equal to 0; they accept an expression, and a value that is not a finite number greater than or equal to 0 counts as missing). The limit is applied **after** the node's size is resolved (px, `%`, `hug` or `fill`) and **before** the instance's `minSize`.

- **`fill` with `max` (or `min`)** behaves as in flexbox: the child that hits the limit **freezes** at it and the difference is split among the other `fill`s of the same parent. Two `fill`s side by side, one with `maxWidth: 100`, give 100 px to the first and **all the rest** to the second.
- **`min` greater than `max`** with literals is a validation error (`template.children[1].minWidth: cannot be greater than maxWidth`). When it comes from an expression, `min` wins.
- **`hug` text** cut by `maxWidth` wraps at the cut width, and the height is that of the resulting lines.
- **At the root** of the template the limits only apply when the component is **measured** (a `hug` axis, for example `sizing` in a screen without a rectangle); in a marking with a rectangle the root takes up the box and its limits change nothing.
- In a version lower than 4 the four keys are an error (`only allowed with formatVersion 4`).

### Layouts: `none`, `row`, `column` and `grid`

`layout.type` is `none` (default), `row` (children side by side), `column` (children stacked) or `grid` (`formatVersion` 4: children in the cells of a grid; see "Grid: `layout.type: \"grid\"`").

**Concept map.** The format follows the vocabulary of CSS flexbox; the table says where each key comes from and where it exists on the other platforms, for whoever models a component from code on any of them.

| Concept               | Format                                                            | CSS                                                       | Compose                                      | SwiftUI              | Flutter          |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------- | -------------------- | ---------------- |
| Aligned overlay       | `none` + `align`/`justify`; `anchors` per child                   | `display: grid; place-items`; `place-self`                | `Box(contentAlignment)`; `Modifier.align`    | `ZStack(alignment:)` | `Stack`          |
| Row and column        | `row`/`column`, `gap`, `align`, `justify`                         | `flex-direction`, `gap`, `align-items`, `justify-content` | `Row`/`Column`, `Arrangement`, `Alignment`   | `HStack`/`VStack`    | `Row`/`Column`   |
| Reversed order        | `reverse`                                                         | `row-reverse`                                             | `reverseLayout`                              | —                    | `reverse`        |
| Row wrapping          | `wrap`, `lineGap`                                                 | `flex-wrap`, `row-gap`                                    | `FlowRow`                                    | —                    | `Wrap`           |
| Clipping              | `clip` (frame and slot)                                           | `overflow: hidden`                                        | `clipToBounds`                               | `.clipped()`         | `ClipRect`       |
| Weights               | `weight` on the `fill` child                                      | `flex-grow`                                               | `Modifier.weight`                            | `layoutPriority` (≈) | `Expanded(flex)` |
| Grid                  | `grid` + `columns`/`minColumnWidth`/`rows`/`minRowHeight`, `span` | `grid-template-columns: repeat(n, 1fr)` / `auto-fit`      | `LazyVerticalGrid(GridCells.Fixed/Adaptive)` | `LazyVGrid`          | `GridView`       |
| Intrinsic measurement | (arrives in phase L4 of the same epic)                            | `min-content`/`max-content`                               | `IntrinsicSize`                              | `fixedSize`          | `IntrinsicWidth` |

| Key              | Values                                                                                       | Description                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `gap`            | number greater than or equal to 0 (accepts an expression)                                    | Space between children, on the main axis.                                                                 |
| `padding`        | number, `[vertical, horizontal]` or `[top, right, bottom, left]` (accepts an expression)     | Inner margin. Counts toward the frame's `hug` size.                                                       |
| `align`          | `start` (default), `center`, `end`, `stretch`, `baseline` (`formatVersion` 4, only in `row`) | Position on the **cross** axis. `baseline` aligns the children by the first baseline (see "Baseline").    |
| `justify`        | `start` (default), `center`, `end`, `space-between`, `space-around`, `space-evenly`          | Position on the **main** axis (width in `row`, height in `column`).                                       |
| `reverse`        | boolean or expression (default `false`; `formatVersion` 4)                                   | The children in reverse order on the main axis and `start` becomes the end.                               |
| `wrap`           | `none` (default), `wrap`, `wrap-reverse` (`formatVersion` 4, only in `row` and `column`)     | Breaks the row into lines, like CSS's `flex-wrap` (Compose's `FlowRow`/`FlowColumn`). See "Row wrapping". |
| `lineGap`        | number greater than or equal to 0 (accepts an expression; only with `wrap`)                  | Space between the lines, on the cross axis. The `gap` stays between the children of the same line.        |
| `maxPerLine`     | integer greater than or equal to 1 (accepts an expression; only with `wrap`)                 | Children per line, at most (the `maxItemsInEachRow`).                                                     |
| `maxLines`       | integer greater than or equal to 1 (accepts an expression; only with `wrap`)                 | Lines, at most: children beyond the last one are not drawn.                                               |
| `columns`        | integer greater than or equal to 1 (accepts an expression; `grid` only)                      | Equal columns of the grid (one of the four track keys; see "Grid").                                       |
| `minColumnWidth` | number greater than 0 (accepts an expression; `grid` only)                                   | As many columns as fit: the `GridCells.Adaptive`.                                                         |
| `rows`           | integer greater than or equal to 1 (accepts an expression; `grid` only)                      | Equal rows of the **horizontal** grid, which fills columns.                                               |
| `minRowHeight`   | number greater than 0 (accepts an expression; `grid` only)                                   | As many rows as fit, in the horizontal grid.                                                              |

**Expression in the layout (`formatVersion` 4).** `layout.type`, `layout.align` and `layout.justify` accept an expression (a `$switch` over an `enum` field chooses `row` or `column`, for example), in a frame and in a slot. The resolved value must be in the set in the table above; outside it the default applies (`none`, `start`, `start`) and the engine warns `invalid value in layout.type: <value>` (or `layout.align`, `layout.justify`). Literals are still checked at validation, in all versions; an expression on those keys in a version lower than 4 is an error (`only allowed with formatVersion 4`). With a literal `type` of `"none"`, only `type`, `align` and `justify` are valid in the `layout` (see "Aligned overlay"); `gap`, `padding`, `reverse` and `wrap` (and `lineGap`, `maxPerLine`, `maxLines`) remain unknown keys.

Inside a template:

- **`hug` on a frame, in two passes** (flexbox's `shrink-to-fit`; applies in all versions of the format):
  1. the content is measured within the **limit the frame receives from the parent** (the parent's content, or the limit the parent itself received): a `fill` child on the **cross** axis (or in a `none` frame) contributes the **smaller** of the limit and what it would hug inside itself (text wrapped at the limit, a frame measured at the limit) and a `"NN%"` child contributes the limit × NN / 100. With no known limit, `fill` and `%` are worth 0;
  2. the result becomes the frame's size; then `fill` and `%` are resolved against it and the text is measured **at that width**.

  So a `fill` text in a `hug` column wraps into lines of words, and the frame has their height (before, the text was measured with width 0 and wrapped letter by letter). `hug` text does not change: it does not wrap. Only `fill` on the **main** axis of a `hug` frame warns (`fill inside hug becomes 0`), because there the result really is 0. A text that, despite this, is measured with a maximum width of 0 warns `text measured with width 0: <node>`.

- **`fill` on the main axis** splits what is left (content minus fixed sizes minus `gap`s) equally among the `fill` children; what is left is never negative.
- **`align: stretch`** stretches the child on the cross axis to the content area (a `hug` with `stretch` becomes `fill`); the `center` and `end` position uses the child's size.
- **`justify: space-between`** splits the slack among the children (with a single child, it does nothing).
- **`justify: space-around` and `space-evenly`** (`formatVersion` 4), as in CSS flexbox (Compose's `Arrangement.SpaceAround`/`SpaceEvenly`): `space-around` gives each child half a gap on each side (the ends get half the gap between children); `space-evenly` gives the same gap at the ends and between children. With a single child, both center it. In a lower version, the literal is `only allowed with formatVersion 4`, at the path of `layout.justify`.
- **`layout.reverse`** (`formatVersion` 4), like CSS's `row-reverse`/`column-reverse` (Compose's `reverseLayout`): the first child goes to the end of the main axis and `start` becomes the end (`justify: end` packs at the beginning). Applies in a frame, in a slot (the arrangement of the children, `arrange`) and in the screen layout. The `repeat` has no `layout`: in a parent with `reverse`, the block of rows moves as a single child and the rows keep their order. With `type: "none"`, `reverse` is an unknown key (like `align` and `justify`).
- **Row wrapping: `layout.wrap`** (`formatVersion` 4), in a `row`/`column` frame, in the slot and in the `repeat`:
  - `"wrap"` and `"wrap-reverse"` make a child that does not fit in what is left of the main axis go to the **next line**; a child larger than the whole line stays alone on a line (and warns `content larger than the box: <frame>` as today). `"none"` (default) is a single line.
  - `lineGap` is the space between the lines (the `FlowRow`'s `verticalArrangement = spacedBy`, CSS's `row-gap`); the `gap` stays between the children of the same line. `maxPerLine` and `maxLines` limit the children per line and the lines: with `maxLines`, the children beyond the last line **are not drawn** and the engine warns `<n> children outside maxLines: <node>`.
  - `justify` and `reverse` apply **to each line** (each line splits its own slack; `reverse` mirrors each line, not the stack of lines); `align` applies within the line (with `"baseline"`, by the first baseline of each line) and `stretch` stretches to the line's height. The lines stay together at the start of the cross axis, separated by the `lineGap`. `"wrap-reverse"` stacks the lines in the opposite direction (the new line goes **above** in a `row`, which is what the `AlertDialogFlowRow` does with the confirm button).
  - **`hug`**: on the main axis, with no given width, the frame measures **a single line** (CSS's `max-content`; only `maxPerLine` wraps) and it is the widest line; on the cross axis, the **sum of the lines** with the `lineGap`s. A `fill` child on the main axis is worth the base of what it would hug to decide the lines and then splits the slack of its own line.
  - **In the `repeat`**, the four keys stay on the node itself (`wrap`, `lineGap`, `maxPerLine`, `maxLines`), because the `repeat` has no `layout`; they apply with `direction: "row"` (the `repeat`'s lines wrap) and with `column` (the columns).
  - **In the slot**, **Arrange** (`arrange`) puts the child markings in lines by the same rule and the new child goes after the last one, on the next line when it does not fit. Children beyond `maxLines` lines stay where they are (the arrangement neither moves nor deletes them), and the `hug` of the component with a slot measures the lines.
  - Errors: `layout.lineGap: only valid with wrap` (likewise `maxPerLine` and `maxLines`, with `wrap` missing or a literal `"none"`; in the `repeat`, at the key's path), `expected an integer greater than or equal to 1` (`maxPerLine`, `maxLines`), `expected one of: none, wrap, wrap-reverse` and `only allowed with formatVersion 4` in a lower version. When coming from an expression, the invalid value falls back to the default with the warning `invalid value in layout.wrap: <value>` (or `layout.maxPerLine`, `layout.maxLines`).

#### Aligned overlay: `none` with `align` and `justify`

In `formatVersion` 4, `layout: { "type": "none" }` accepts `align` and `justify`, literal or by expression (the same set as an expression in `row`/`column`):

| Key       | Values                                        | Description                                                          |
| --------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `align`   | `start` (default), `center`, `end`, `stretch` | Position of the children on the **vertical** axis (top to bottom).   |
| `justify` | `start` (default), `center`, `end`, `stretch` | Position of the children on the **horizontal** axis (left to right). |

It is Compose's `Box(contentAlignment)`, the `place-items` of a CSS Grid cell and SwiftUI's `ZStack(alignment:)`: the children stay one on top of the other (they are not stacked and have no `gap`), and each one is placed by the frame's rule **on each axis where it has no `anchors`**.

- **The child's `anchors` win, per axis.** A child with `anchors` on an axis (`left`/`right`/`centerX` horizontally, `top`/`bottom`/`centerY` vertically) is placed by them on that axis, and by the frame's `align`/`justify` on the other. It is Compose's `Modifier.align` and CSS's `place-self`: the frame gives the alignment for all and each child opens the exception.
- **`stretch`** makes a child with no size on the axis take up the content area, and a `hug` with `stretch` becomes `fill`, as in `row`/`column`. A fixed-size child keeps its size and stays at the start. The `justify`'s `stretch` applies only in `none` and in the grid: in `row`/`column`, `justify: "stretch"` remains invalid.
- **Without `align`/`justify`, nothing changes**: each child starts from the top-left corner (or from its `anchors`), as always.
- **Not valid in `none`**: `align: "baseline"`, `justify: "space-between"`, `space-around` and `space-evenly` (a value error at validation), nor `gap`, `padding`, `reverse` and `wrap`.
- In a `formatVersion` from 1 to 3, `align` and `justify` in `none` are an error, `only allowed with formatVersion 4`, at the key's path (`template.layout.align`).

A badge centered on the right edge of an icon, with no `anchors` arithmetic:

```json
{
  "type": "frame",
  "name": "icon with badge",
  "width": 48,
  "height": 48,
  "layout": { "type": "none", "align": "center", "justify": "end" },
  "children": [
    {
      "type": "rect",
      "name": "badge",
      "width": 12,
      "height": 12,
      "cornerRadius": 6,
      "fill": "#B3261E"
    }
  ]
}
```

The badge is 12×12 and lands at mid-height (`align: center`) and flush right (`justify: end`). In the nine points of a 3×3, `align` and `justify` each take `start`, `center` and `end`. For a child that breaks the rule (a second badge in the top-right corner), `anchors: { "top": 0, "right": 0 }` is enough: it uses the anchors on both axes, and the first one stays aligned.

#### `clip` on the frame and the slot

- **The frame's `clip`** (`frame`): in all versions, a literal boolean; in `formatVersion` 4, also an expression (a `boolean` field or a condition). An expression that does not give a boolean takes the default (`true` at the root, `false` elsewhere). The clip includes the frame's stroke and shadow (see "Root clipping").
- **The slot's `clip`** (`formatVersion` 4, default `false`): boolean or expression. With a true `clip`, the **child** markings drawn inside the slot are clipped by the **slot's box**: a child entirely outside the box disappears and one that crosses the edge shows only the inside part, in the app, in the viewer and in the MCP's PNG (`render_container`, `render_marking`). Without `clip`, the child appears whole, as always. It is Compose's `LazyColumn` `clipToBounds` and CSS's `overflow: hidden`.
- **It does not scroll.** `clip` only hides what overflows; scrolling (a `LazyColumn` that moves) does not exist in the format.
- The drawing check does not change: a child that goes past the slot still warns `content larger than the box: slot`, with or without `clip`.
- In a `formatVersion` from 1 to 3, `clip` on the slot and `clip` by expression are an error, `only allowed with formatVersion 4`, at the key's path.

#### Grid: `layout.type: "grid"` (`formatVersion` 4)

The grid puts the children in **cells** of equal-size tracks, like CSS Grid's `grid-template-columns: repeat(n, 1fr)` and Compose's `LazyVerticalGrid`. It applies in a frame, in a slot, in a screen without geometry and in the `repeat` (`repeat.layout`).

```json
{
  "type": "frame",
  "name": "grid",
  "layout": { "type": "grid", "columns": 3, "gap": 8, "lineGap": 8, "padding": 10 },
  "children": [
    { "type": "rect", "name": "a", "height": 20, "span": 2, "fill": "#B3261E" },
    { "type": "rect", "name": "b", "height": 20, "fill": "#1565C0" }
  ]
}
```

**Tracks: exactly one of four keys.**

| Key              | Value                              | Grid                                                                                                                                 |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `columns`        | integer greater than or equal to 1 | **Vertical**: `n` equal columns; the children fill line by line, left to right.                                                      |
| `minColumnWidth` | number greater than 0              | **Adaptive** vertical: `max(1, floor((content + gap) / (minColumnWidth + gap)))` columns (the `GridCells.Adaptive`, the `auto-fit`). |
| `rows`           | integer greater than or equal to 1 | **Horizontal**: `n` equal rows; the children fill column by column, top to bottom (the `LazyHorizontalGrid`).                        |
| `minRowHeight`   | number greater than 0              | Adaptive horizontal: the same computation, with the height.                                                                          |

None or more than one, written out literally, is an error (`layout: provide exactly one of columns, minColumnWidth, rows and minRowHeight`); **several keys are only valid when all are expressions of the same orientation** (`columns` with `minColumnWidth`, or `rows` with `minRowHeight`), and the **first one that has a value** applies (an empty field, or an `$if` with no `else` that is not met, does not provide the key): this is how a type chooses between `GridCells.Fixed` (`columns`) and `GridCells.Adaptive` (`minColumnWidth`) by a field, like Material 3's `lazy-vertical-grid` (the order of preference is that of the table above). All four accept an expression; an invalid value coming from an expression falls back to a single track (`columns: 1`, or `rows: 1` in the horizontal one) and the engine warns `invalid value in layout.columns: <value>` (or `layout.minColumnWidth`, `layout.rows`, `layout.minRowHeight`). With a `type` by expression that resolves to `"grid"` without a valid track, `columns: 1` applies. `wrap`, `maxPerLine` and `maxLines` are not valid in the grid (validation error: not valid in a grid layout).

- **Spaces.** The `gap` stays between the **tracks** (the columns of the vertical grid) and the `lineGap` between the **flow lines** (the ones formed when filling), without requiring `wrap`. The `padding` is that of any frame. The tracks have **equal size**: `(content − gaps) / n`, the `1fr` of each.
- **Placement and `span`.** The **visible** children enter in template order (`reverse` reverses the list before placing: the last child goes to the first cell), filling each flow line from the start track to the end. `span` (integer greater than or equal to 1, number or expression, only on a child of `grid`) takes up neighboring tracks, limited to the number of tracks; a child that does not fit in what is left of the line goes to the next one and leaves the **hole** (without `dense`, like `LazyVerticalGrid` and CSS's automatic placement). By expression, a `span` that is not an integer greater than or equal to 1 is worth 1 and the engine warns `invalid value in span: <value>`. `span` on a child of another layout is an error (`span: only valid on a child of a grid layout`).
- **Each flow line** has the extent of its largest child (the `grid-auto-rows: auto`); the lines stack from the start, separated by the `lineGap`. A `fill` child on the lines' axis takes up the whole line, and on the tracks' axis the whole cell (it is the default for everything that is not text). `px` stays as written, `%` is a fraction of the cell and `hug` hugs the content; text is `hug` by default and is measured at the cell's width when it is `fill`.
- **Alignment in the cell.** `justify` (the tracks' axis) and `align` (the lines' axis) apply **within the cell**: `start` (default), `center`, `end` and `stretch`; the latter makes the `hug` child take up the cell. In the grid, `space-*` and `baseline` are a value error (literal) or the warning `invalid value in layout.justify: …` (expression), and `start` applies.
- **Grid size.** `fill`, px and `%` as in any frame. **`hug` on the tracks' axis** (the width of the vertical grid) is `n × the largest cell + gaps + padding`: **equal columns by the largest**, the `SegmentedButton`'s `IntrinsicSize.Min` with `weight(1f)`; a child with `span` contributes its part per track. With `minColumnWidth`, `n` comes from the limit the parent gives; with no limit, it is one column. **`hug` on the lines' axis** is the sum of the flow lines plus the `lineGap`s and the padding, with the children already measured at the cell's width (the text wraps). The width is resolved before the height.
- **Warning.** `content larger than the box: <frame>` when the sum of the lines exceeds the content, or when a child in px exceeds the cell, with a tolerance of 1 px when there is text among the children.
- **In the `repeat`** the grid comes through `repeat.layout` (see above). **In the slot** and **in the screen without geometry**, see "Size-based screen layout".
- In a `formatVersion` from 1 to 3, `grid`, the four track keys and `span` are an error, `only allowed with formatVersion 4`, at the key's path.

#### Weights: `weight`

A child of `row` or `column` (also of a `wrap` line) gets `weight` (a number greater than 0, literal or expression; `formatVersion` 4; default 1): what is left on the main axis after the fixed sizes and the `gap`s is split among the `fill` children **in proportion to the weights**. Three `fill`s with `weight` 1, 2 and 1 split the slack into 25%, 50% and 25%. It is Compose's `Modifier.weight(w)` and CSS's `flex-grow: w`, and the same freezing as before applies: a child that hits the `minWidth`/`maxWidth` (or `minHeight`/`maxHeight`) stays at the limit and the difference is split among the others in the same proportion, until it settles.

- **Only on a `fill` child on the main axis.** A `hug`, px or `%` child on the main axis, a child of `none` or of `grid` and a `fill` only on the cross axis, with a literal `weight`, is an error (`weight: only valid on a fill child on the main axis of a row or column`). A child with no `width`/`height` on the main axis counts as `fill` (the default for what is not text); a text with neither is `hug`. When the parent's `layout.type` or the child's size is an expression, the validator accepts it.
- **By expression**, a value that is not a finite number greater than 0 is ignored (weight 1) and the engine warns `invalid value in weight: <value>`.
- The `weight` belongs to **template nodes**. The child markings of a slot have no `weight` (see "Known limits").
- In a `formatVersion` from 1 to 3, `weight` is an error, `only allowed with formatVersion 4`.

### Anchors (`layout: none`)

In a `none` frame the children are not stacked: each one starts from the top-left corner (or from where the frame's `align`/`justify` puts it, see "Aligned overlay"), unless it has `anchors`, a fixed distance from the edge, like Figma's constraints.

```json
{
  "type": "ellipse",
  "name": "handle on",
  "width": 24,
  "height": 24,
  "anchors": { "right": 4, "centerY": true },
  "fill": "#FFFFFF"
}
```

- `left`/`right` (and `top`/`bottom`) are distances in px from the edge. **With both sides**, the child stretches between them, even if it has a fixed size (`left` + `right` and `top` + `bottom` make the child take up the whole parent minus the distances).
- `start`/`end` (`formatVersion` 4) are the same distances, but **logical**: they follow the reading direction (see "Reading direction").
- `centerX` and `centerY` center on the axis and ignore `left`/`right` or `top`/`bottom`.
- **Anchors win over the frame's alignment, per axis**: a child with `left` (or `right`, `centerX`) ignores the parent's `justify` horizontally, and with `top` (or `bottom`, `centerY`), the `align` vertically; on the axis without an anchor the frame's alignment applies.
- Anchors outside a `none` parent have no effect.
- **Anchor by expression (`formatVersion` 4).** `left`, `right`, `top` and `bottom` accept a number expression, and `centerX` and `centerY` a condition or boolean expression (`visible` has the same form). An expression that does not produce a number counts as a **missing anchor**, as if the key did not exist:

```json
{
  "type": "rect",
  "width": 12,
  "height": 12,
  "anchors": {
    "left": { "$mul": [{ "$size": "width" }, 0.5] },
    "centerY": { "$gt": [{ "$field": "n" }, 5] }
  }
}
```

Literals are checked as usual (`anchors.left: expected a number`). In a `formatVersion` lower than 4, the expression is an error (`template.children[0].anchors.left: only allowed with formatVersion 4`).

### Size-based screen layout

When the screen arrives **without geometry** (a backend JSON, for example), `layoutScreen` computes **sizes and positions** from each component's `sizing`. The input is a tree of nodes (type, values, children) plus the screen's roots; the output is the screen with each instance's rectangle.

The screen is the **root component**, in a column, with no padding or gap. The rules:

- **Spec per axis**: `sizing[axis]`, or `size[axis]` if missing. Every final size respects `minSize`.
- **`hug` is rounded up** (to the next integer), so the text does not wrap because of rounding. The rest stays exact.
- **A component with a slot** (a component with `slot`) has the slot's layout (`row`, `column` or `none`, with `gap`, `padding`, `align` and `justify`), which arranges the children. The `hug` of a component with a slot measures the **children already arranged**, so the card's height grows with the text it carries.
- **`fill` on the main axis inside a `hug` parent** has nowhere to take size from: the child **falls back to `hug`**. In a `hug` `column` this raises the warning `<id>: fill inside hug: using hug`; in a `hug` `row`, the `fill` width also falls back to `hug`, **without a warning**. On the cross axis of a `hug` `row`, the `fill` children receive the largest height of the other children.
- **`stretch` only affects `hug` children** (a fixed-size child keeps its own). A `hug` child in a `column` is limited to the content width.
- **An invisible slot** (`visible` false) **ignores the children**, with the warning `<id>: invisible slot: children ignored`.
- **An empty slot** counts only the slot's **padding**. (A card without actions ends up with the frame's `gap` extra at the bottom: a known issue.)
- **`none`** in a slot puts each child at the content's corner, without stacking. (With `align`/`justify` the `none` slot aligns the children in the slot's box, here too and in **Arrange**.)
- **`grid`** in a slot (`formatVersion` 4) arranges the children in the grid's cells (the four track keys, `gap`, `lineGap`, `padding`, `reverse`, `align` and `justify` in the cell): **each child takes up one cell** (the child marking has no `span`), keeps its size (`stretch` makes it take up the cell) and the flow lines have the extent of the largest child. It applies in `layoutScreen`, in `arrange` and in the app's Arrange. The new child of a marking with a grid slot goes into the **next free cell**: the first, in placement order, whose rectangle does not overlap any child; with all occupied, the first of the line after the last one.
- **`wrap`** in a `row`/`column` slot splits the children into lines by natural size on the main axis (the slot's space, or only the `maxPerLine` when the component is `hug` on that axis) and arranges each line as a slot without `wrap`; the lines stack with the `lineGap`, and the component's `hug` measures their sum. Children beyond `maxLines` lines get no rectangle, with the warning `<n> children outside maxLines: <component id>`.
- Content larger than the screen **warns** (`screen: content taller than the screen height`) and **neither clips nor refuses**.

### Screen anchors

A screen root can sit **outside the flow**, anchored to the screen (the bottom bar, the floating button, a modal sheet). A root without an anchor enters the column; one with an anchor is positioned by the anchor and by the `margin`.

| Anchor                                 | Position                            |
| -------------------------------------- | ----------------------------------- |
| `top-start`, `top`, `top-end`          | At the top, left, center, right.    |
| `start`, `center`, `end`               | At mid-height, left, center, right. |
| `bottom-start`, `bottom`, `bottom-end` | At the bottom, left, center, right. |

Anchors with `start` and `end` are **logical**: the table applies in `ltr`; in an `rtl` screen (`LayoutScreen.direction`), `start` is the **right** and `end` the left (see "Reading direction"). `top`, `center` and `bottom` do not change.

- `margin` (px, default 0) is the distance from the edges touched by the anchor. A root with `margin` and no `anchor` is a problem in the source: `margin is only valid with anchor`, at the root's `margin` path.
- On an anchored root, `fill` takes up the screen **minus the margin on both sides**; `hug` uses the content; px is px.
- A root can have a **scrim**: a component's type (`sdui-scrim`) drawn below the root, covering the whole screen. Its instance goes right before the root, with the id `<root id>#scrim`, with the fields' default values.
- What declares the roots, the anchors and the scrim is the specialization's **source** (`origins`, see [`SPEC-FORMAT.md`](SPEC-FORMAT.md)).

### Test case: the `hug` supporting text inside a `hug` column

A card (`fill` × `hug`) with a supporting text (`hug` in height, `fill` in width) inside a column (`fill` × `hug`), followed by another card. With a longer supporting text, the card, the column that contains it and the next sibling **grow by the same amount** (the height of the extra lines; in the test, with Node's approximate measurement, 80 px), and the width does not change. Nobody needs to tell the card how much it is worth.

The test that proves it is `tests/model/components/layout.test.ts` (group "Material 3 card inside a column", `the height of the card and the column grow with the body, and the sibling moves down by the same amount`). It also checks that the actions slot's button is at the card's bottom-right corner (`justify: end`), with 16 px of padding.

### Two ways to lay out

- **`layoutScreen`** (above): a screen without rectangles; computes sizes and positions. It feeds the screens coming from an external source.
- **`arrange`** (`arrange.ts`): instances that **already have a rectangle**; the slot's `layout` only **positions** the children (order among siblings, `gap`, `padding`, `align`, `justify`), rounding to whole px, and writes the rectangles. The rectangle remains the source of truth; the layout is an editing tool. A slot without a layout (or `none`) leaves the children where they are. With `grid`, `arrange` and Arrange write the children into the cells (see "Size-based screen layout"). With `wrap`, `arrange` and the app's Arrange put the children in lines (`lineGap`, `maxPerLine`, `justify` and `reverse` per line); children beyond `maxLines` lines stay where they are. The "Arrange" action in the app is from phase B3.

## Reading direction (`formatVersion` 4)

The instance is drawn **left to right** (`ltr`, the default) or **right to left** (`rtl`, Arabic, Hebrew, Persian). What says the direction is whoever instantiates: `instantiate`, `measureComponent`, `layoutScreen` and `arrange` receive `direction` (`"ltr"` or `"rtl"`), and the screen without geometry declares it in `LayoutScreen.direction` (the source, in `origins[].screen.direction`; see [`SPEC-FORMAT.md`](SPEC-FORMAT.md)). The component **has no language**: it only follows the direction it receives.

The `Screen` that `layoutScreen` returns carries the direction in `Screen.direction` (only `"rtl"`; in `ltr` the key does not exist): whoever draws the screen (the `ScreenRenderer`, in the viewer) uses it to instantiate the inside of each component, so that the boxes and the inside mirror together. The `ScreenRenderer.update`'s `direction` option, if given, wins over the screen's.

The final position remains **physical**: each node's rectangle carries the `x` measured from the **left** edge. The scene and the four renderers (Konva in the app, the MCP's raster, the embeddable viewer and the arrangement) know nothing about direction; only the text (`TextStyle.direction`, `"rtl"` when the node reads right to left) and the mirror (`mirror`, the matrix `[-sx, 0, 0, sy, x + w, y]`) reach them.

| Part of the format                                                         | What changes in `rtl`                                                                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout: row` (and each line of a `wrap`)                                  | Runs right to left: the first child is on the **right** and `justify: start` packs to the right.                                                      |
| `layout: column`                                                           | Still stacks top to bottom; `align: start` aligns to the **right** and, with `wrap`, the columns stack right to left.                                 |
| `layout: none` with `align`/`justify`                                      | The `justify` (horizontal) mirrors (`start` is the right); the `align` (vertical) does not change.                                                    |
| `layout: grid`                                                             | The tracks are filled right to left (in the horizontal grid, the flow lines).                                                                         |
| `anchors`                                                                  | `start` is the **right** edge and `end` the left; `left`, `right`, `top`, `bottom`, `centerX` and `centerY` do not change.                            |
| `font.align`                                                               | `start` (the default) draws on the right and `end` on the left; `left`, `center`, `right` and `justify` do not change.                                |
| `icon` and `path` with `mirror`                                            | The node is flipped horizontally inside its box.                                                                                                      |
| Screen anchors                                                             | `top-start`, `start` and `bottom-start` go to the right; `top-end`, `end` and `bottom-end`, to the left (`top`, `center` and `bottom` do not change). |
| `padding`, the vertical axis, `wrap-reverse` in a `row` and its cross axis | Nothing changes: the `padding` is **physical** (`[top, right, bottom, left]` as always).                                                              |

- **`reverse` composes with the direction.** In an `rtl` `row`, `reverse` runs left to right again, like `row-reverse` with `direction: rtl` in CSS: the two together cancel out.
- **Asymmetric indentation that follows the direction** comes from a condition, because the `padding` is physical: `"padding": { "$if": { "$direction": "rtl" }, "then": [0, 8, 0, 16], "else": [0, 16, 0, 8] }`.
- **In `ltr` nothing changes.** A component without `direction`, without `$direction` and without `mirror` draws exactly as before; `font.align` `start` in `ltr` is the usual `left`.

### Logical anchors: `anchors.start` and `anchors.end`

On the horizontal axis of a `none` frame, `start` is the edge where reading begins and `end` the opposite one: in `ltr` they are `left` and `right`; in `rtl`, `right` and `left`. `left` and `right` remain **physical** and, with both sides (one logical and one physical) falling on the same side, the **physical one wins**.

```json
{
  "type": "icon",
  "name": "chevron",
  "width": 24,
  "height": 24,
  "anchors": { "end": 8, "centerY": true },
  "mirror": true
}
```

- `start` together with `left` on the same node is an error (`anchors.start: cannot be combined with left`), and so is `end` together with `right` (`anchors.end: cannot be combined with right`). `start` with `right` (or `end` with `left`) is **not** an error: they are different sides in `ltr`.
- In a `formatVersion` lower than 4: `anchors.start: only allowed with formatVersion 4` (likewise `anchors.end`), at the key's path.

### `direction` on a node: fixing the subtree's direction

Any node (except the `repeat`) accepts `direction`, **literal** `"ltr"` or `"rtl"`: a phone number, an email address, a piece of code or a media controls bar that must stay in the same order in any language.

```json
{
  "type": "frame",
  "name": "phone",
  "direction": "ltr",
  "layout": { "type": "row", "gap": 4 },
  "children": [{ "type": "text", "text": { "$field": "fone" } }]
}
```

- The node **itself** is placed by the parent in the parent's direction (it is a child like the others); what is **inside** it follows the direction it fixes.
- In a `slot` node, "inside" is only the subtree of the template itself: the child markings that the screen puts in the slot follow the screen's direction, because each one is instantiated by whoever instantiates the screen, with its direction.
- In the `repeat`, `direction` remains the stacking of the rows (`"row"`/`"column"`, in every version): to fix the reading direction of the rows, put the `direction` on the `template`'s frame or on a frame around the `repeat`.
- A value outside the set: `expected one of: ltr, rtl`. In a `formatVersion` lower than 4: `direction: only allowed with formatVersion 4`, at the node's path.

### The `$direction` condition

`{ "$direction": "rtl" }` (or `"ltr"`) applies wherever a condition applies (`$if`, `visible`, `$and`, `$or`, `$not`) and is true when the **effective direction of the node the condition is in** is that one — the node's own, when it fixes it with `direction`, otherwise the inherited one. It serves what does not mirror by itself: `padding`, an asymmetric corner radius, a different path `d`, a supporting text.

```json
{
  "type": "rect",
  "cornerRadius": {
    "$if": { "$direction": "rtl" },
    "then": [8, 0, 0, 8],
    "else": [0, 8, 8, 0]
  }
}
```

### `mirror`: flipping what points

An arrow, a chevron, an "undo", a speech bubble with a tail: their drawing flips horizontally in `rtl`. A clock, camera or person icon does not.

- **In the icon set** (`mapping-icons` `formatVersion` 2), each icon carries `mirror?: boolean` (default `false`): whoever mirrors is marked once, in the set, and every component benefits.
- **On the node.** `mirror` on the `icon` node wins over the set's; `mirror` on the `path` node (default `false`) is the way to mirror a path written inside the component. Both accept a boolean expression.
- **Only what the template marks mirrors.** The `image` node does not mirror (there is no `mirror` on it) and a `path` without `mirror` stays as it is. In `ltr`, `mirror` does nothing.
- The mirror is drawing only: the node's box, the measurement and the layout do not change.

## Anchor (`formatVersion` 4)

A marking can declare another marking in the **same space** as its **anchor** (`anchor` on the marking: side, alignment and offset). The relation belongs to the project (`docs/FORMAT.md`); the component takes care of two things: saying **how it prefers to attach** (the root's `anchor` key) and **reading the anchor** to draw what depends on it (the `$anchor.*` pseudo-fields), like a tooltip's arrow.

### `anchor` at the file root

```json
{ "anchor": { "side": "top", "align": "center", "offset": { "main": 4, "cross": 0 } } }
```

| Key            | Values                          | Default  | Description                                                                                                  |
| -------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `side`         | `top`, `bottom`, `start`, `end` | `top`    | Which side of the anchor the marking sits on (outside it). `start` and `end` follow the effective direction. |
| `align`        | `start`, `center`, `end`        | `center` | The alignment along that side.                                                                               |
| `offset.main`  | number                          | `0`      | The distance from the anchor's edge, in **component units** (negative overlaps).                             |
| `offset.cross` | number                          | `0`      | The offset along the side, in units (logical: see below).                                                    |

The `offset.cross` is **logical**: with `side` `top` or `bottom`, positive goes in the reading direction (to the right in `ltr`, to the left in `rtl`); with `start` or `end`, positive goes down. The `offset.main` is always the distance outward from the anchor's edge.

Everything is optional (`anchor: {}` gives the defaults). They are the defaults of a marking that declares an anchor without saying the side, the alignment or the offset; what the marking says wins. The `offset` is in **units** (see "Units and density"): when applying, the container's density converts it to pixels (`componentAnchorDefaults(file, density)` returns the three defaults already in pixels). A value outside the set is an error (`expected one of: top, bottom, start, end`), and so is an unknown key; in a `formatVersion` 1 to 3 the error is `only allowed with formatVersion 4`, at the key's path (`anchor`).

### The `$anchor.*` pseudo-fields

The template reads the anchor as it reads a field, with `{ "$field": "$anchor.x" }`. There are five names, which **are not fields of the type** (the library validator accepts them without the type declaring them, and they do not count as a cited field):

| Name             | Value                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `$anchor.side`   | The **logical** side declared on the marking (or, without `side`, the component's default): `top`, `bottom`, `start` or `end`. Text.           |
| `$anchor.x`      | The anchor's **center** on the horizontal axis, in units, relative to the corner of the instance's box. It can be negative or go past the box. |
| `$anchor.y`      | The anchor's center on the vertical axis, in units, relative to the corner of the instance's box.                                              |
| `$anchor.width`  | The anchor's width, in units.                                                                                                                  |
| `$anchor.height` | The anchor's height, in units.                                                                                                                 |

They apply in `$field`, `$switch`, `$eq`, `$has` and in the `formatVersion` 4 operations (`$sub`, `$add`…), and wherever those apply (`anchors`, `width`, `visible`, `fill`…). **Without an anchor all five are empty**: the `$field` falls back to the `default`, the `$switch`, to the `default` (or to the place's default), the `$has` is false. A field of the type with the same name never sees them (names with `$` do not exist as a field; the engine shadows them, like the `$index`). Any other `$anchor.*` is a validator error (`field does not exist: $anchor.foo`); in a `formatVersion` 1 to 3, `only allowed with formatVersion 4`.

The `$anchor.side` is the **logical** side (`start`/`end`), not the physical one: the direction already mirrors what the template positions by `anchors.start`/`end`, and choosing by the logical side keeps a single template for `ltr` and `rtl`. The numbers are in **units**, like every number in the template, and relative to the instance's box, so they work directly in `anchors`. A tooltip's arrow under the anchor's center:

```json
{
  "type": "rect",
  "name": "arrow",
  "width": 16,
  "height": 8,
  "visible": { "$eq": ["$anchor.side", "top"] },
  "anchors": { "left": { "$sub": [{ "$field": "$anchor.x" }, 8] }, "top": 40 }
}
```

Whoever instantiates hands the anchor to the engine through the `anchor` option (`InstantiateOptions`; `anchorValues`, in `componentValues.ts`, builds it from the rectangles and the density); `instantiate` and `measureComponent` read it.

## Expressions and conditions

Almost every attribute accepts, in place of a literal, an **expression** over the annotation's fields.

| Expression                                                                | Result                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{ "$field": "label", "default": "Button" }`                              | The field's value. If the field is empty (`null`, missing or only whitespace), the `default` applies; without a `default`, the attribute's default applies.                                                                                                  |
| `{ "$if": <condition>, "then": …, "else": … }`                            | `then` if the condition holds; otherwise `else` (optional; without it the attribute's default applies). `then` and `else` are expressions.                                                                                                                   |
| `{ "$switch": "variant", "cases": { "a": …, "b": … }, "default": … }`     | The case whose name is the field's value; `default` (optional) if there is no such case or the field is empty.                                                                                                                                               |
| `{ "$concat": ["R$ ", { "$field": "preco" }] }`                           | Text only: joins the parts (numbers become text).                                                                                                                                                                                                            |
| `{ "$add": […] }`, `{ "$mul": […] }`, `{ "$sin": … }`…                    | `formatVersion` 4. Number math (see "Math and comparisons").                                                                                                                                                                                                 |
| `{ "$rows": "items" }`, `{ "$size": "width" }`                            | `formatVersion` 4. The number of rows of a `table` field and the width or height of the instance (see "Math and comparisons").                                                                                                                               |
| `{ "$lines": "msg" }`                                                     | `formatVersion` 4. The number of **measured** lines of the `text` node named `msg` (see "Math and comparisons" and "Height from content").                                                                                                                   |
| `{ "$token": "primary" }`                                                 | `formatVersion` 4. The value of the specialization's token in the drawing's mode (see "Design tokens (`$token`)"). Only where a color, number or font family is expected.                                                                                    |
| `{ "$provided": "content-color", "default": { "$token": "on-surface" } }` | `formatVersion` 4. The value that an ancestor offers through its slot's `provide` (only in a color position); with no ancestor offering it, the `default` applies (an expression), and without a `default`, the attribute's default (see "Inherited color"). |

```json
{
  "text": { "$concat": [{ "$field": "label" }, " (", { "$field": "count" }, ")"] },
  "visible": { "$has": "label" },
  "fill": { "$switch": "variant", "cases": { "filled": "#6750A4" }, "default": "none" }
}
```

**Conditions** (`$if`, `visible`, `italic`): an object with **one** operator.

| Condition                                  | True when                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `{ "$field": "selected" }`                 | The field is "truthy" (truthiness, below).                                                               |
| `{ "$eq": ["variant", "ghost"] }`          | The field equals the value (compared as text; an empty field is never equal).                            |
| `{ "$has": "label" }`                      | The field is not empty.                                                                                  |
| `{ "$not": <condition> }`                  | The condition is false.                                                                                  |
| `{ "$and": [<condition>, …] }`             | All hold.                                                                                                |
| `{ "$or": [<condition>, …] }`              | Any holds.                                                                                               |
| `{ "$gt": [a, b] }`, `$gte`, `$lt`, `$lte` | `formatVersion` 4. Number comparison; an operand with no value gives false (see "Math and comparisons"). |
| `{ "$direction": "rtl" }` (or `"ltr"`)     | `formatVersion` 4. The **node's effective** reading direction is this one (see "Reading direction").     |

**`$field` in a condition reads the field by truthiness**, never as text: the field is true when it is not empty and the value, ignoring case, is not `""`, `"não"`, `"nao"`, `"no"`, `"false"`, `"0"` or `"off"`; a number is true when different from 0. This is how booleans work: **a boolean is an `enum` field with `["sim", "não"]`**, and `{ "$field": "selected" }` holds for `sim`. The same applies in `visible: { "$field": "x" }`. The operators `$eq`, `$has`, `$not`, `$and`, `$or`, `$direction`, `$gt`, `$gte`, `$lt` and `$lte` can appear directly in `visible` and `italic`; `$field` stays an expression.

An expression that cites a field that the **type does not declare** is a library validator error (the drawing cannot find the value); a type field that the drawing does not use is a warning, **unless the type's `code` uses it**: a key of `params` or of `values`, the `field` of `variants` (or of its cases) or a whole word of the `notes` (this is the case of `width`, `height`, `weight` and `contentDescription`, which become a modifier or an argument in the code and do not change the drawing).

### Math and comparisons (`formatVersion` 4)

In `formatVersion` 4 expressions **compute**. Each operand is a number expression: a literal, `$field`, a numeric `$token`, another operation, `$if` or `$switch`. The operations apply wherever a number applies (sizes, `gap`, `padding`, `opacity`, `cornerRadius`, `font.size`…) and inside `$concat`.

| Operation                                        | Result                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `{ "$add": [a, b, …] }`, `{ "$mul": [a, b, …] }` | Sum and product of 2 or more operands.                                                 |
| `{ "$sub": [a, b] }`, `{ "$div": [a, b] }`       | Exactly 2 operands.                                                                    |
| `{ "$mod": [a, b] }`                             | Remainder with the **sign of the divisor** (`((a % b) + b) % b`): `-1 mod 12` is `11`. |
| `{ "$round": a }`, `$floor`, `$ceil`, `$abs`     | One operand.                                                                           |
| `{ "$min": [a, b, …] }`, `{ "$max": [a, b, …] }` | The smallest and the largest of 2 or more.                                             |
| `{ "$clamp": [value, min, max] }`                | The value clamped to the range.                                                        |
| `{ "$sin": a }`, `{ "$cos": a }`                 | Sine and cosine, with `a` in **degrees**.                                              |

```json
{ "width": { "$mul": [{ "$field": "progress" }, 200] } }
```

- **No number, no value.** An empty operand, or one whose trimmed text is not a number (the comma does not count: `"0,5"` is not a number), makes the operation **produce no value**, like an empty `$field` without `default`: the default for that spot applies. Division and remainder by zero too. The drawing does not warn; the validator rejects a **literal** operand that is not a number (`template.width.$add[1]: must be a number`) and a wrong arity (`template.width.$sub: needs 2 operands`).
- **Number in text.** In `$concat` and in `text`, a non-integer number comes out with up to 6 decimal places, without trailing zeros (`0.1 + 0.2` becomes `0.3`, not `0.30000000000000004`); an integer comes out as usual.
- **Comparisons** are conditions: `{ "$gt": [a, b] }`, `$gte`, `$lt` and `$lte`, each with two number operands. They apply in `$if`, `visible`, `$and`, `$or` and `$not`; an operand with no value gives **false**. `$eq` remains `[field, value]`.
- **`$rows` and `$size`.** `{ "$rows": "<table field>" }` is the field's **number of rows** (no rows, 0); the library validator rejects a field that is not a `table` of the type (`$rows counts the rows of "titulo", which is a string field of type "tabela", not a table`). `{ "$size": "width" }` or `"height"` is the **instance's width or height**, in image px (the marking's rectangle): this is what lets a carousel or a bar follow the available width, and `left: { "$mul": [{ "$size": "width" }, 0.5] }` follows the marking as it is resized. In the drawing proof and in the instance's `hug` measurement (`measureComponent`), the component's `size` applies. `$size` with another value is an error (`template.width.$size: expected "width" or "height"`).
- **`$lines`.** `{ "$lines": "<text node>" }` is the **number of measured lines** of the `text` node with that `name` (at most `maxLines`; empty text, 0). It applies wherever a number applies and in comparisons (`{ "$gt": [{ "$lines": "msg" }, 1] }`). The name must be that of a unique `text` node of the template: `text node "msg" does not exist` and `more than one text node "msg"` are validation errors, at the `$lines` path; inside a `repeat` the node of the same row applies (from outside the `repeat`, citing a node that is inside it is an error: `text node "cell" is inside a repeat`). `$lines` inside the cited node itself (in its `width`, for example) is an error (`the node cannot depend on its own lines`). See "Height from content".
- **Cited fields.** The fields inside an operation, a `$rows` or a comparison count for redrawing as in any other expression. `{ "$field": "$index" }` (the row index of a `repeat`) is not a field of the type.
- **Compute instead of enumerating.** Do not write a `$switch` with dozens of cases over a number (nor one `$eq` per value): use the math. In a `formatVersion` lower than 4, each new key is the error `only allowed with formatVersion 4`, at its path (`template.width.$mul`).

### Design tokens (`$token`, `formatVersion` 4)

`{ "$token": "<name>" }` reads a named value from the specialization's `tokens` key (its `formatVersion` 15, see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Design tokens"). The engine replaces each `$token` with the value before drawing, so the token applies anywhere the expression applies, including as the result of `$switch` and `$if`.

```json
{
  "type": "frame",
  "fill": { "$token": "primary" },
  "cornerRadius": { "$token": "radius-md" },
  "padding": { "$token": "space-4" },
  "children": [
    {
      "type": "text",
      "text": { "$field": "label" },
      "color": {
        "$switch": "variant",
        "cases": { "filled": { "$token": "on-primary" } },
        "default": { "$token": "primary" }
      },
      "font": { "family": { "$token": "font-mono" }, "size": 14 }
    }
  ]
}
```

- **Where it applies:** color (`fill`, `color`, `stroke.color`, `shadow.color`, the color of each gradient stop, `background` and `color` of a `runs` run), number (`gap`, `padding` (also the `padding` of a `runs` run), `font.size`, `font.weight`, `cornerRadius`, `minWidth`/`maxWidth`/`minHeight`/`maxHeight`, `width`/`height`, `opacity`…) and font family (`font.family`, a run's `family`). In an enum, boolean or text (`layout.type`, `visible`, `text`…) it is the error `$token only applies where a color, number or font family is expected`.
- **Also applies in:** `shadow.x`, `shadow.y`, `shadow.blur` and `shadow.spread` (also in each shadow of a list), in each item of the `cornerRadius` list, in each item of `stroke.dash` and in `stroke.offset` (number `$token` only, no other expression).
- **`alpha`** (opacity): in a color position, `{ "$token": "scrim", "alpha": 0.32 }` multiplies the alpha of the token's color (a `#rrggbbaa` with alpha 0.5 and `alpha` 0.5 gives 0.25; `alpha: 0` is transparent, useful at a gradient stop; `none` stays `none`). `alpha` is a number from 0 to 1 or a number `{ "$token": … }`. The engine returns `#rrggbbaa`, so the app, the viewer and the raster receive the finished color. Outside a color it is the error `alpha only applies to a color $token` (at the `…$token` path); outside 0 to 1, `expected a number between 0 and 1`.
- **`over`** (composited color, v4): in a color position, `{ "$token": "on-surface", "alpha": 0.38, "over": "surface" }` composites the token's color (already with the `alpha`) over the `over` color and delivers an **opaque color over an opaque base** (Compose's `compositeOver`; `on-surface` at 0.38 over white `surface` gives `#9e9e9e`). `over` is the name of a color token (the library rejects an unknown one, like any `$token`) or a literal color (`#fff`, `rgb(…)`); if the bottom color is not opaque, the result carries its alpha (it does not become opaque); `none` stays `none`. The computation is pure (the app, the viewer and the raster receive the finished color). Outside a color it is the error `over only applies to a color $token` (at the `…$token` path); an `over` that is not text, `expected a token name or color`.
- **Version:** only in the component's `formatVersion` 4; in versions 1 to 3 the error is `only allowed with formatVersion 4`, at the key's path. The name follows `[a-z0-9][a-z0-9-]*`; the object accepts only `$token` and, in a color, `alpha` and `over`.
- **Built-in tokens:** `font-sans` and `font-mono` (family) exist in every library and stand for the host's font: the app uses the theme's `--font-sans` and `--font-mono`, the viewer uses the stack of the app's tokens or the `fonts` option of `createViewer`, and the MCP uses the built-in Mapping Sans (Mapping Mono for `font-mono`; see "Text measurement"). The specialization can redefine them in `tokens.values`, and its definition wins over the host's. Text without `font.family` uses `font-sans`.
- **Mode:** the drawing follows the project's and the container's mode (`drawingMode`, see `docs/FORMAT.md`); with no mode chosen, it uses the **first** of `tokens.modes`, and an undeclared mode falls back to the first, without a warning.
- **Validation:** `parseComponent` checks the shape and the position and delivers the file's list of `$token`s; the library validator (`validate_library`, level 2) cross-checks it against the specialization's `tokens` and rejects a nonexistent token (`token "x" does not exist in the specialization tokens`) and one of the wrong type (`token "primary" is a color, but a number is expected here`), with the node's path (`template.children[0].fill`). Without `tokens` in the specialization, only the built-in ones exist.

### Inherited color (`provide` and `$provided`, `formatVersion` 4)

Text, icon and icon button inside a container (a surface, a scaffold, a card) have the **content** color that the container defines: in Compose, the `LocalContentColor` (a `CompositionLocal`). Without this, each child would repeat the color or receive a field just for it. The container **offers** the color in the `slot`, and the child **reads** it.

```json
{
  "format": "mapping-component",
  "formatVersion": 4,
  "id": "surface",
  "name": "Surface",
  "size": { "width": 200, "height": 80 },
  "template": {
    "type": "frame",
    "fill": { "$token": "surface" },
    "children": [
      {
        "type": "slot",
        "provide": {
          "content-color": {
            "$switch": "tone",
            "cases": { "inverse": { "$token": "inverse-on-surface" } },
            "default": { "$token": "on-surface" }
          }
        }
      }
    ]
  }
}
```

The child (here, the `texto` component) reads it with `$provided`:

```json
{
  "type": "text",
  "text": { "$field": "label" },
  "color": { "$provided": "content-color", "default": { "$token": "on-surface" } }
}
```

- **`provide`** (only on the `slot`, only in `formatVersion` 4): an object from name to a text or number expression. The name is free (no platform name) and cannot be empty (error `template…provide: empty name`). Each value is resolved **in the parent**, with its fields, tokens and mode, and reaches the child ready. A value that produces nothing (an empty `$field` without `default`) offers nothing. Inside `provide`, `$token` only applies to color; numeric operations apply.
- **`$provided`** (`{ "$provided": "<name>", "default": <expression> }`) only applies in a **color position** (the color of the text, the icon, the background, the stroke and the shadow); where it touches geometry (size, spacing, text) it is the error `$provided only applies where a color is expected`, and the `image`'s `src` stays literal or `{ "$field" }` only. The `default` is also an expression (it can be `$token` or `$field`). Without a name (empty or not text): `…$provided: expected the name of the provided color (non-empty text)`; another key next to `$provided` and `default`: `unknown key`.
- **Which one applies:** the **nearest** ancestor that offers that name, going up the containment tree (`parentId`), like Compose's `CompositionLocal`. An ancestor that does not offer the name is passed through; with parent and grandparent offering the same name, the parent's applies.
- **With no ancestor offering it** (a floating marking, a canvas marking with no parent, an instance at screen level, the drawing proof of the library examples and the Catalog): the `default` applies; without a `default`, the default for that spot, like an empty `$field`.
- **Redrawing:** the drawing cache also compares the offered values that the child reads. Changing the parent's field that changes the offered value redraws **only the children that read** that name; the others come back with the same drawing. In the viewer's and the lab's screens the inheritance comes from the instance's `parentId`. In the MCP, `render_marking` of a child alone uses the ancestor's value.
- **It is drawing only.** Inheritance does not change the type's `code` and there is no code parameter; the inherited color only decides what is seen.
- In a `formatVersion` 1 to 3, `provide` and `$provided` are the error `only allowed with formatVersion 4`, at the key's path (`…provide`, `…color.$provided`).
- **Pattern for the library:** the container (surface, scaffold) offers the content color (`content-color`, for example); the text, the icon and the icon button read it with `default` (the default for that spot, `on-surface`). That way loose text, with no container, keeps the usual color.

### Variables: `let` and `$var` (`formatVersion` 4)

A long subexpression that repeats (the width of a carousel's large item, the color of a state) can be written once, in a frame's `let`, and used by name with `$var`. The substitution happens **at read time**: `parseComponent` replaces each `$var` with the variable's content, like a macro, before checking the file, and returns the component **without** `let` or `$var`. The engine, the MCP raster, the viewer and the Catalog only see the already substituted component, so the drawing is the same as that of the component written by hand without variables.

```json
{
  "type": "frame",
  "let": {
    "gap": 8,
    "ink": { "$token": "on-surface" },
    "next": { "$add": [{ "$field": "$index" }, 1] }
  },
  "layout": { "type": "row", "gap": { "$var": "gap" } },
  "children": [
    {
      "type": "text",
      "text": { "$var": "next" },
      "color": { "$var": "ink" },
      "font": { "size": 12 }
    }
  ]
}
```

- **`let`** applies in any `frame` (the template root, the children and the `template` of a `repeat` that is a `frame`): an object from name to expression. The name follows `[a-z][a-zA-Z0-9]*` (no `$`, no hyphen); another name is the error `<node>.let.<name>: expected a variable name ([a-z][a-zA-Z0-9]*)`. On a node that is not a frame, `let` is `unknown key: let`; if the `let` is not an object, `expected an object`.
- **`{ "$var": "name" }`** applies wherever an expression or condition applies (number, color, text, `visible`, `$if`, `repeat.count`, anchors, `layout`…): it is an object with only that key and the name (text). Another key next to it is `unknown key`.
- **Scope.** The variable applies in all the keys of the **frame itself** (including `layout`, sizes, anchors and `visible`) and in those of the **descendants**, including a `repeat`'s `template`. An inner `let` hides the outer one with the same name; a sibling frame does not see the other's variables.
- **Free order inside the `let`.** A `$var` whose name is in the same `let` points to it, even if declared later (`b` can use `a` declared below); a name that is not in it is looked up in the outer `let`s, from the nearest to the farthest. A variable's content sees the `let` where it was declared and the outer ones, not those of the inner frames.
- **Macro: the place of use decides.** `$index`, the row columns (`$field` inside a `repeat`) and `$size` inside a variable are those of the **place of use**: a root `let` variable that cites `$index` is the index of the row where it is used, and can only be used inside a `repeat` (outside it, `$index only applies inside a repeat`, at the path of the use).
- **Checking at the place of use.** The content is checked where the variable is used, with the type that the position expects (number, color, text, condition). The error carries the path of the use with the segment `$var(<name>)`: `template.children[1].width.$var(gap).$add[0]: must be a number` (the `$add[0]` is from inside `gap`); when the `$var` is an operand, the segment comes at the end: `template.children[1].width.$add[0].$var(gap): must be a number`. Variables inside variables accumulate the segments. A variable **with no use** is not checked and produces no warning.
- **Expansion errors** (the file is not checked further, the problems in the rest of the root continue): `undefined variable: <name>` (at the path of the use); `variable cycle: a → b → a` (at the path of the `let` of the variable that closes the cycle, including one that uses itself: `a → a`); and `variable expansion too large (more than 100000 nodes)` (at the root), the cap so that a small file does not become a huge tree (it counts only the nodes that the variable substitution creates; a chain of more than 500 variables nested one inside another gives the same error).
- **`get_component` shows the file as it is**, with `let` and `$var`; the component that the engine uses and that `render_marking` draws is the substituted one.
- In a `formatVersion` 1 to 3, `let` and `$var` are the error `only allowed with formatVersion 4`, at the path of the `let` and of the `$var`. An MCP before 0.38.0 (or an earlier app) rejects the component with `unknown key: let`: see "Known limits".
- `docs/component.schema.json` accepts `let` in the frame and `$var` where there is an expression or condition (the name and the shape); that the variable exists, the cycle and the type at the place of use are up to `parseComponent`.

## Engine warnings

The engine **warns**; it does not clip or reject: content larger than the slot or the screen is drawn as requested and the warning accompanies it. The warnings are texts (in English) and come from three places.

**When drawing a component** (`instantiate`):

| Warning                                           | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field not provided: <key>`                       | The template cites a field that is not in the received values (the field exists in the type and the value did not come).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `fill inside hug becomes 0`                       | A `fill` child on the main axis of a `hug` frame (inside a template the `fill` is 0).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `text measured with width 0: <node>`              | A text with a defined width (`fill` or `%`) was measured with a maximum width of 0 (the parent has no width for it); it comes out broken letter by letter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `invalid value in <key>: <value>`                 | An expression of `layout.type`, `layout.align`, `layout.justify`, `width` or `height` (`formatVersion` 4), or of `layout.columns`, `layout.minColumnWidth`, `layout.rows`, `layout.minRowHeight`, `span` or `weight` (the invalid track falls back to `columns: 1`, or `rows: 1` in the horizontal grid; `span` and `weight` become 1), or the `sizing.width` / `sizing.height` (which falls back to the axis's `size`) resolved outside the set; the default applies. Also a negative `shadow.blur` (becomes 0), a negative `stroke.offset` (becomes 0) and a `stroke.dash` that is not a list of numbers greater than or equal to 0 (no dashing). |
| `text larger than the box: <node>`                | A text with defined width and height wraps into more lines than the height holds (1 px tolerance), or has a word wider than the node's width (the text only wraps between words; with `runs`, a run or chip wider than that), and has no `maxLines` or `ellipsis` that cuts it (`formatVersion` 4 or not).                                                                                                                                                                                                                                                                                                                                          |
| `<n> children beyond maxLines: <node>`            | The `maxLines` of a frame (or `repeat`) with `wrap` cut <n> children: they are not drawn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `$lines unstable: <node>`                         | The number of lines of a node cited by `$lines` changed from the first to the second pass (the second one's stays).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `content larger than the box: <frame>`            | The children (fixed sizes plus `gap`s) exceed the frame's content on the main axis, or a fixed child exceeds the content on the cross axis (1 px tolerance when there is text among the children). It also applies when the parent is `none`: a child's extent on an axis (start anchor + size + end anchor; only the size when the child is centered or aligned) exceeds the parent's content area, with the same 1 px tolerance when there is text among the children. Stroke and shadow are left out of the computation; the `shortfall` says how much is missing.                                                                               |
| `icon stretched: different scale on the two axes` | The box of a `path` or `icon` has a different proportion than the `viewBox`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `unknown icon: <name>`                            | The `name` of an `icon` node is not in the specialization's icon set (or it does not declare `icons`): the node becomes the placeholder (`formatVersion` 4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**When laying out a screen without geometry** (`layoutScreen`; the text carries the instance id in front):

| Warning                                           | When                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `<id>: type without component: <type>`            | The instance's type has no component (or the file was missing or invalid); the instance and the subtree are left out. |
| `<id>: children ignored (component without slot)` | The instance has children but its component has no slot.                                                              |
| `<id>: fill inside hug: using hug`                | A `fill` child on the height of a `hug` `column`.                                                                     |
| `<id>: invisible slot: children ignored`          | The slot has `visible` false.                                                                                         |
| `<id>#scrim: type without component: <type>`      | The requested scrim has no component.                                                                                 |
| `screen: content taller than the screen height`   | The flow's roots exceed the screen height.                                                                            |

**When translating an external JSON** (source): an external type without an annotation type (the node and the subtree are left out), an unknown property (one that is not a field's path nor in `ignore`), a value outside an `enum`'s `options`, an object where a simple value was expected, an invalid anchor (it uses `top-start`) and an invalid margin. The warnings carry the node's path (`content.children[1].props.foo`). See [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Sources".

The `none` parent's warning appears where the others appear: in the app's "The component does not fit" pending item, in the `component-overflow` (with `kind: content`) of `plan_changes`/`propose_changes` and in the `validate_library` warnings. A corner badge that is meant to overflow on purpose is not a component node: it is an anchored marking, not a node that leaves the box.

Warnings are not repeated. The same rule applies in the library validator's drawing proof (level 3), where each engine warning becomes a package warning. A component with a content-dependent axis (`sizing` `hug`, or px by expression) is also proved at the **fitted size** (the fit's size, with the case's values, in the first mode): the warning cites `fitted size W×H` instead of `initial size W×H`, and the case in `size` continues. The fit measures the content (the `min*` only increases it), so only what something holds is proved: the root's `maxWidth`/`maxHeight` on a `hug` axis or the px that an expression gives the axis. The proof runs each case **in each mode** of the specialization's `tokens`, with the mode's tokens resolved (the text's size and family come from the token); the warning cites the mode (`type "card", the preview, mode dark, initial size 300×120: …`) the same warning in all modes comes out once, with no mode, and, without `tokens`, the message carries no mode.

## Single-line text, ellipsis and `maxLines`

In `formatVersion` 4, the `text` node's `font` gains three keys (all accept an expression, and `$field`/`$switch` apply as in the others):

| Key        | Values                      | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrap`     | `"word"` (default) `"none"` | `"word"` wraps by word at the box's width. `"none"` is **one line per paragraph**: the text does not wrap. In a fixed-width box without `ellipsis`, the line that exceeds the box is **clipped by pixel** at the text's box (the letter comes out cut in half, like `white-space: nowrap; overflow: hidden`), with `align` `left`, `center` or `right`; in the app, in the viewer and in the MCP's PNG, which start each line in the same place (see "Where each line of clipped text starts"). |
| `ellipsis` | `true` / `false` (default)  | Text that does not fit ends in `…`: at the width, with `wrap: "none"`; at the height, after `maxLines` lines.                                                                                                                                                                                                                                                                                                                                                                                   |
| `maxLines` | integer ≥ 1                 | Maximum number of lines. The last allowed line carries the `…` (with `ellipsis`) or is cut (without). Zero, negative or fractional is an error.                                                                                                                                                                                                                                                                                                                                                 |

The text measurement (`hug`, wrapping and the drawing proof) receives the three keys and measures what the drawing shows: `wrap: "none"` measures a single line, and `maxLines` limits the height to `maxLines` × the line height. A single line wraps only when it exceeds the box's width by more than **0.5 px** (a single tolerance, the same in the engine, in the Konva measurer and in the drawing): the sum of the words' widths and the width measured by the DOM differ at the floating-point tip, and without the tolerance the last word would fall to the line below by a fraction of a pixel.

In a `formatVersion` lower than 4 they are an error (`template.children[0].font.wrap: only allowed with formatVersion 4`, also with an expression).

**Where each line of clipped text starts.** In a clipped text (`wrap: "none"` without `ellipsis`, fixed-width box) with several paragraphs, the lines align **with each other by the widest one** (the block) and the block aligns in the box by the `align`; a block wider than the box starts at the left edge, and the shortest line aligns inside it (`center` and `right`), not in the box. `justify` counts as `left`. This is what the app does and what the MCP's PNG draws. Text that is not clipped does not change.

**Only the lines that fit the height.** With a fixed height (`height > 0`), the app and the MCP's PNG draw only the lines that Konva keeps: the first always and each following one while `(k + 1) × lineHeight ≤ height` (3 lines in a box of 2 draw 2; in one of 2.5 lines, also 2), in every `verticalAlign`; `middle`, `bottom` and `cap-middle` count the drawn lines. With `ellipsis`, the cut by height applies as a `maxLines` equal to the lines that fit, and the last drawn line ends in `…`. The measurement (`hug`, wrapping, the `text larger than the box` warning) and `$lines` keep counting all the lines, and rich text (`runs`) is not cut by height.

When the wrapped lines exceed the node's height, or a word exceeds the node's width (the text only wraps between words, as in CSS with `overflow-wrap: normal`, and the whole word stays alone on the line, beyond the edge), and nothing cuts them (neither `maxLines` nor `ellipsis`), the drawing warns `text larger than the box: <node>`, which enters the "The component does not fit" pending item like `content larger than the box`. In both, the excess that **comes from text** has a tolerance of 1 px per text node (the DOM and the canvas differ by fractions of a pixel).

## Centering on the capital letter: `cap-middle` (`formatVersion` 4)

`font.verticalAlign` accepts, besides `top`, `middle` and `bottom`, the value `"cap-middle"` (literal or by expression: a `$switch`/`$if` can return it). It is opt-in: `middle` still centers the **line box** (like CSS and the app's DOM) and no drawing that does not use the new value changes.

**The rule.** The block that goes from the **top of the first line's capital letter** to the **baseline of the last line** is centered in the node's box. It measures `capHeight + (n − 1) × lineHeight`; the first baseline sits at `(height − block) / 2 + capHeight` and the following ones go down `lineHeight`. With a single line, the center of the capital letter's height falls on the box's center, whatever the font. Text taller than the box draws only the lines that fit (see "Only the lines that fit the height") and the centered block is that of those lines; the `text larger than the box` warning does not change. It also applies to `maxLines` (it centers the lines that remain) and to `runs`, with the `capHeight` of the node's base font and the baselines of the first and last line.

**Where the `capHeight` comes from.** It is the capital letter's height of the effective font at the node's size, in fractional px: in the app and in the viewer, the canvas's `measureText('H').actualBoundingBoxAscent` (without it, `0.7 × size`). The text measurement (`hug`, wrapping, warnings) does not change: only the drawing position.

In a `formatVersion` lower than 4 the literal is an error: `template.children[0].font.verticalAlign: only allowed with formatVersion 4`.

## Baseline: `baselinePadding` and `align: baseline` (`formatVersion` 4)

Text is positioned by the **baseline**, like Compose's `paddingFromBaseline` and `alignByBaseline` (and CSS's `align-items: baseline`). The model does not know the font: whoever knows the baseline is the injected measurer, which returns `firstBaseline` and `lastBaseline` (px from the top of the text's box, with the text at the top) and `lineCount`. The three measurers use the same computation (`lineBaseline`: the center of the line plus half of `ascent − descent`), each with its font's measurements: Konva uses the canvas's `ascent`/`descent`, the MCP server, those of the free font it draws with, and the approximate one, `ascent` 0.93 and `descent` 0.24 × the size (Roboto 14/20's baseline gives 14.83, close to Compose's 15). A measurer that does not report the baseline falls back to the approximate one's computation.

- **`baselinePadding`** on the `text` node: `{ "top"?: Expr<number>, "bottom"?: Expr<number> }`, px greater than or equal to 0.
  - In the height's `hug` the node measures `max(top, first) + (last − first) + max(bottom, height − last)`: the distance never gets smaller than the font's own. A `top` smaller than the font's baseline is then worth the font's.
  - The text is drawn with the first baseline at `top` (the app and the MCP's PNG, within ≤ 0.5 px, in any font and at any zoom). With a fixed height or `fill`, `font.verticalAlign` stops applying on the node that has `top`: the literal combination is an error (`baselinePadding.top: does not combine with verticalAlign`); coming from an expression, the `top` wins.
  - `bottom` only: the text stays at the top and the `hug` grows at the bottom.
- **`layout.align: "baseline"`** in a `row` frame, in a row `repeat` and in the `row` slot: the children align by the **first baseline**. A `text` child's baseline is its first one (with the `baselinePadding.top`, when there is one); a frame's is that of the first child, in order, that has one; a node without text (a `rect`, an icon) uses the bottom of the box, like CSS. The `hug` row on the height measures from the highest top to the lowest bottom after aligning.
  - In a `column`, a literal `"baseline"` is an error (`baseline only applies in row`); coming from an expression, it falls back to `start` with the warning `invalid value in layout.align: baseline`.
  - In the slot, a child marking's baseline is that of its drawing (the same plan that the proof uses); the layout (**Arrange**) follows the rule.
- **Rich text (`runs`):** the baseline of each line is that of the node's base font. Larger runs can exceed it (see "Known limits").
- In a `formatVersion` from 1 to 3, both keys fail with `only allowed with formatVersion 4`.

## Height from content: `$lines` and `sizing` by expression (`formatVersion` 4)

A component's height can depend on **how many lines** the text occupies: the snackbar measures 48 with one line, 68 with two and the lines' height with three or more.

```json
{
  "formatVersion": 4,
  "sizing": { "width": "fill", "height": "hug" },
  "template": {
    "type": "frame",
    "height": "hug",
    "minHeight": { "$if": { "$gt": [{ "$lines": "msg" }, 1] }, "then": 68, "else": 48 },
    "layout": { "type": "column", "padding": [14, 16] },
    "children": [
      {
        "type": "text",
        "name": "msg",
        "text": { "$field": "msg" },
        "width": "fill",
        "height": "hug"
      }
    ]
  }
}
```

- **Two passes.** The number of lines is only known after laying out. With `$lines` in the template, the engine lays out once with `$lines` = 1, reads the number of **measured** lines of each cited node (at its final width) and lays out again with those numbers. If the second pass measures a different number on a cited node, the second one's stays and the engine warns `$lines unstable: <node>` (no third pass). Without `$lines` in the template there is a single pass: no drawing today changes.
- **What `$lines` counts.** The measured lines, not those that fit in the box (the cut by height is only the drawing's). With `font.maxLines`, at most `maxLines`; empty text, 0. A node that is not drawn (`visible` false) is 0 in the second pass.
- **Root limits.** The root's `minWidth`, `maxWidth`, `minHeight` and `maxHeight` accept an expression (and therefore `$lines`) and apply on the measured axis: this is the snackbar's 48/68 and the limits of the `search-bar` and the `text-field`. They now also apply in the rectangle fit (the marking's fit to the content uses the same measurement function: `fitComponentSize`, in `src/model/components/sizing.ts`).
- **`sizing` by expression.** See "The instance": the axis takes the px, the `fill` or the `hug` that the expression gives, evaluated with the instance's values.
- **Only in `formatVersion` 4.** `$lines` and the expression in `sizing` in a `formatVersion` from 1 to 3 fail with `only allowed with formatVersion 4`, at the key's path.

## Rich text: runs and inline box

In `formatVersion` 4, the `text` node accepts `runs` **in place of** `text`: a non-empty list of **runs**, each with its own style, which wrap together as a single text. It serves for bold or color in the middle of a sentence and for the "chip" (a box with a background inside the line, like the `overdue` label of an invoice). Use `runs` instead of replacing the label with spaces and drawing the chip on top with another node: the chip follows the text when it wraps or changes width.

Each run is an object with `text` (required) and the keys below. All accept an expression, and the run's `text` accepts `$field`, `$concat` and the others, evaluated like the node's `text` (a number becomes text, empty becomes empty text).

| Key          | Values                                                                   | Effect                                                                                               |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `text`       | text, number or expression                                               | The run's text. Required.                                                                            |
| `weight`     | 100 to 900                                                               | Overrides the node's `font.weight`.                                                                  |
| `italic`     | `true` / `false`                                                         | Overrides the node's `font.italic`.                                                                  |
| `family`     | family or CSS stack                                                      | Overrides the node's `font.family` (family or CSS stack, as in `font`).                              |
| `size`       | number                                                                   | Overrides the node's `font.size`. The run's line height scales with it (see below).                  |
| `decoration` | `none`, `underline`, `line-through`                                      | Overrides the node's `font.decoration`.                                                              |
| `color`      | CSS color                                                                | Overrides the node's `color`.                                                                        |
| `background` | CSS color                                                                | **Makes the run a chip**: an inline box with that background. Without it, the run is just text.      |
| `radius`     | number greater than or equal to 0                                        | The chip's corner radius. Only applies with `background`. Default 0.                                 |
| `padding`    | number, or `[vertical, horizontal]` (numbers greater than or equal to 0) | The chip's breathing room: a number applies on both axes. Only applies with `background`. Default 0. |

Example, an invoice with the month in bold and a red chip at the end of the line:

```json
{
  "type": "text",
  "name": "aviso",
  "width": "fill",
  "color": "#1D1B20",
  "font": { "size": 14, "lineHeight": 20 },
  "runs": [
    { "text": "Invoice for " },
    { "text": { "$field": "mes" }, "weight": 700 },
    { "text": " " },
    {
      "text": "overdue",
      "color": "#FFFFFF",
      "background": "#B3261E",
      "radius": 8,
      "padding": [2, 6]
    }
  ]
}
```

**What belongs to the node and what to the run.** The node gives the base: the `font` and the `color`. The run overrides only `weight`, `italic`, `family`, `size`, `decoration` and `color`. `lineHeight`, `letterSpacing`, `align`, `verticalAlign`, `wrap`, `ellipsis` and `maxLines` are **the node's only** and apply to all runs (they do not exist on the run: unknown key).

**Line wrapping.** The runs wrap **as a single text, by word**, and not one run per line:

- The wrapping opportunities are the **spaces of runs without a background** and the **edges of a chip**. A word that crosses runs with no space between them (`"Pa"` and `"gar"`) is a single word: bold in the middle of the word does not split it.
- `\n` in a run without a background breaks the line; in a chip it becomes a space.
- A space at the start of the line is **discarded** in a run without a background and **kept** in a chip (the chip draws the whole text, with the leading space inside the padding). A space at the end of the line does not count toward the width.

**The chip.** It is an unbreakable atom: the width is the text's plus 2·h (the horizontal `padding`) and the height is the run's line height plus 2·v (the vertical). If it does not fit in the rest of the line, it goes **whole** to the line below; if it is larger than the whole line, it stays alone on the line and exceeds the width (it never breaks inside). A library component inside the line does not exist: the chip is a run, not a node.

**Line height.** A run's line height is the node's `lineHeight` times the run's size over the node's size (a run with `size` 21 in a node of 14 and `lineHeight` 20 has a line of 30). Each line has the greatest height among the node's and its pieces'; the chip counts with the vertical padding (a chip with `padding` `[2, 6]` on a line of 20 makes the line 24). The pieces are **vertically centered** on the line, not aligned by the baseline (see "Known limits").

**Ellipsis and maximum lines.** The node's `wrap`, `ellipsis` and `maxLines` apply to rich text. `ellipsis` removes characters from the end of the line's last text piece (it cuts in the middle of a run, if needed; a chip comes out whole, never cut) and the `…` uses that piece's font.

In a `formatVersion` lower than 4, `runs` is an error (`template.children[0].runs: only allowed with formatVersion 4`). Other errors: `text` and `runs` together (`template.children[0]: text and runs together: use one or the other`), an empty `runs` or one that is not a list (`template.children[0].runs: expected a non-empty list of runs`), a run without `text` (`template.children[0].runs[0].text: required field`) and an unknown key in the run (`template.children[0].runs[1].bogus: unknown key: bogus`).

## Text measurement

`hug`, line wrapping and the height of a text depend on the **text measurement**, which the engine receives from outside (a `TextMeasurer` function). There are two:

- **Real**, in the browser: Konva measures the text with the loaded font. It is the `konvaMeasurer`, used by the app and by the viewer. The line height follows CSS (see `lineHeight` in "Nodes"): the Chromium test (`tests/e2e/textMetrics.spec.ts`) checks that the canvas and the DOM measure the same height (2 lines of `lineHeight` 18.5 px = 37).
- **Free font, in the MCP server**: `createMeasurer` (`mcp/image/textMeasurer.ts`) measures with `opentype.js` and the built-in font (Mapping Sans and Mono, regular and bold) or the library's `fonts`, with kerning and `letterSpacing`; `render_marking`/`render_container` draw the letters with the same font, so measurement and drawing go together. Without the component's font (the app's system font), the width is that of the free font, not the app's.
- **Baseline:** the three measurers also return `firstBaseline`, `lastBaseline` and `lineCount` (see "Baseline"); the `ascent`/`descent` come from Konva's canvas, from the server's free font and, in the approximate one, from 0.93 and 0.24 × the size.
- **Approximate**, in Node (and in the model tests): `approximateMeasurer`, with no canvas. Width ≈ 0.55 × the font size per character (0.6 if the weight is 600 or more) plus the letter spacing; height = number of lines × line height; with a maximum width, it wraps by words; it respects `wrap`, `ellipsis` and `maxLines` and returns the lines already cut (`lines`).

Rich text (`runs`) uses the same measurement: the runs' layout measures each piece of a line with the measurer, in the run's font, and **the same layout** serves the `hug` measurement, the validator's drawing proof and the drawing. That is why the height of a `hug` text with `runs` is the sum of the lines (with the chip's height) and the width is that of the widest line. The MCP server also draws rich text with letters (`render_marking`, `render_container` and the `get_marking_image` of a container without a file), with the built-in free font.

Whoever reads a warning ending in **`(approximate)`** (the library validator's drawing proof, in the MCP server or in the skill) should understand that the text was measured by the approximation: a "content larger than the box" warning can disappear, or appear only at another size, when the browser measures with the real font. The warning is a signal to look, not a verdict. And the opposite also holds: without the warning, the browser may measure a little wider.

## Validation

`parseComponent(json)` (in `src/model/components/parseComponent.ts`) returns the same contract as `parseSpec`:

```ts
{ ok: true; component: ComponentFile }
| { ok: false; issues: { path: string; message: string }[]; errors: string[] }
```

- `errors[i]` is `"path: message"` (or just the message when the path is empty), with the JSON path of the problem: `template.children[1].text: expected text or number`.
- The format is **strict**: an unknown key in any node, expression, style or at the root is a problem (`unknown key: <key>`). Other problems: wrong `format`/`formatVersion` (`expected 1, 2, 3 or 4`), `image` in a `formatVersion` lower than 3 (`the image node only exists in formatVersion 3`), `src` outside the `image` node's rule, `width`/`height` `hug` on the `image` (and `min-content`/`max-content`: `the image node does not accept min-content or max-content: the layout does not depend on the downloaded image`), `repeat` in a `formatVersion` 1 (`the repeat node only exists in formatVersion 2`, at the node's path), the `icon` node, `runs`, `stroke.cap`, `stroke.join`, `stroke.sides`, `stroke.offset`, `stroke.gap`, `shadow.spread`, `shadow` as a list, `layout.reverse`, `layout.wrap`, `layout.lineGap`, `layout.maxPerLine` or `layout.maxLines` (also the four on the `repeat`), `stroke.dash` by expression, `layout.justify` `space-around` or `space-evenly`, `font.wrap`, `font.ellipsis` or `font.maxLines` (a `font.maxLines` that is not an integer greater than or equal to 1: `expected an integer greater than or equal to 1`), `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `repeat.distribute` or an expression in `layout.type`, `layout.align`, `layout.justify`, `width` or `height` in a `formatVersion` lower than 4 (`only allowed with formatVersion 4`, at the key's path), `width`/`height` `min-content` or `max-content` and `sizing.width`/`sizing.height` with them in a `formatVersion` lower than 4 (`only allowed with formatVersion 4`, at the key's path), `text` and `runs` together on the same node (`text and runs together: use one or the other`, at the node's path), an empty `runs` or one that is not a list (`expected a non-empty list of runs`), a run without `text` or with an unknown key, a run's negative `padding` or `radius`, `lineGap`, `maxPerLine` or `maxLines` without `wrap` (`layout.lineGap: only applies with wrap`), a literal `min` greater than the `max` of the same axis (`<node>.minWidth: cannot be greater than maxWidth`), a negative `minWidth`, `maxWidth`, `minHeight` or `maxHeight` or one that is not a number (`expected a number greater than or equal to 0`), `distribute` outside `none`/`fill`, an empty or repeated `sides` or one outside `top`/`right`/`bottom`/`left`, `sides` on `ellipse` or `path`, `stroke.offset` outside `frame`, `rect` and `ellipse` (`only applies in frame, rect and ellipse (this is <type>)`) or negative, `stroke.gap` outside `frame` and `rect` (`only applies in frame and rect (this is <type>)`), together with `sides` (`gap does not apply with sides`), without `node` (`required field`) or with a `node` that is not the name of a template node (`stroke.gap.node: node not found: <name>`), `shadow` an empty list or with more than 4 shadows (`shadow: expected 1 to 4 shadows`), the `$token`'s `alpha` outside a color (`alpha only applies to a color $token`) or outside 0 to 1, `over` outside a color (`over only applies to a color $token`), `font.align: justify` or `fit` `fill-width`, `fill-height`, `scale-down` or `none` in a `formatVersion` lower than 4 (`only allowed with formatVersion 4`, at the key's path), `repeat` without `field` or without `template`, `repeat` or `slot` inside a `repeat`, an `id` outside the pattern, invalid `size`/`minSize`, a `minSize` greater than `size`, a template root that is not a `frame`, `children` or `layout` on a node that is not a frame (the `slot` accepts `layout`), a node size outside `number`/`fill`/`hug`/`min-content`/`max-content`/`NN%` (`expected a number greater than or equal to 0, "fill", "hug", "min-content", "max-content" or "<number>%"`; in `sizing`, without the `"<number>%"`), an expression with more than one operator, a condition without an operator, a font weight outside 100 to 900, an empty color.
- **Reading direction (`formatVersion` 4):** `direction` on a node, `anchors.start`, `anchors.end`, `font.align` `start` or `end`, `mirror` (on the `icon` and on the `path`) and the `$direction` condition in a version lower than 4 are `only allowed with formatVersion 4`, at the key's path. The other problems: `direction` outside the set (`expected one of: ltr, rtl`), `anchors.start` together with `left` (`anchors.start: does not combine with left`) and `anchors.end` together with `right` (`anchors.end: does not combine with right`). In the icon set file (`mapping-icons`), a `mirror` that is not a boolean is `expected true or false`, `mirror` with `formatVersion` 1 is `only allowed with formatVersion 2` and a `formatVersion` outside 1 and 2 is `must be 1 or 2` (see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Icon set").
- **Variables (`let` and `$var`, `formatVersion` 4):** `parseComponent` replaces the `$var`s before checking (see "Variables: `let` and `$var`"); the new problems are the name outside the pattern (`expected a variable name ([a-z][a-zA-Z0-9]*)`), `undefined variable: <name>`, `variable cycle: a → b → a`, `variable expansion too large (more than 100000 nodes)` and `only allowed with formatVersion 4` on a `let` or `$var` of an earlier version. The paths of a variable's content carry `$var(<name>)`.
- `parseComponentText(text)` reads the JSON text (invalid JSON becomes a problem with an empty path) and `validateComponent(json)` returns only the `string[]` list.
- `docs/component.schema.json` mirrors the structure (for editors and generators); it does **not** replace the parser, and the code is the source of truth.
- The **library validator** (`src/model/library.ts`, see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Library validation") runs `parseComponent` on each component of the package and checks what depends on more than one file (the field cited by the drawing exists in the type, the declared `slot` exists in the template; in a `repeat`, the `field` is a `table` of the type and each key cited in the `template` is a column of it or a field of the type; the `preview` of a `table` is a list of rows with columns that exist).

## Known limits

- **One slot per component.** An instance's children always go to the template's first slot (depth-first search). Several slots are left for later.
- **Image only remote and only in the `image` node.** The component file does not carry a bitmap; the image comes from an `https://` URL (a `string` field) and is not saved in the project. A local image in the package is left for later (that is why a relative path is rejected in `src`). Ellipse and path do not accept an image as fill.
- **`formatVersion` 1, 2, 3 and 4.** Version 2 adds only the `repeat`, 3 only the `image`, 4 only `stroke.cap`, `stroke.join`, `stroke.sides`, `stroke.offset` and `stroke.gap`, `stroke.dash` by expression, `shadow.spread` and `shadow` as a list, `provide` on the slot and `$provided` (the inherited color), `$token` in shadow, radii and dashing, `alpha` and `over` on the color `$token`, `font.align: justify`, the image's new `fit`s, `layout.justify` `space-around`/`space-evenly`, `layout.reverse`, `layout.wrap`, `layout.lineGap`, `layout.maxPerLine`, `layout.maxLines`, `layout.align: baseline`, `baselinePadding`, `font.wrap`, `font.ellipsis` and `font.maxLines`, the expression in layout and size, `min-content` and `max-content`, `minWidth`/`maxWidth`/`minHeight`/`maxHeight`, `repeat.distribute`, `layout.align`/`layout.justify` on `none`, the slot's `clip` and by expression, the grid (`layout.type: "grid"`, `columns`, `minColumnWidth`, `rows`, `minRowHeight`), `span`, `weight` and `repeat.layout`, `runs` (rich text), `$token` (design tokens) and the `icon` node (the icon set), variables (`let` and `$var`), reading direction (`direction` on the node, `anchors.start`/`end`, `font.align` `start`/`end`, `mirror` on the `icon` and on the `path` and the `$direction` condition) (the two-pass measurement applies in all of them), and the earlier ones continue to be accepted unchanged. Changing the component format requires a new version and the decision to accept the old ones.
- **`min-content` and `max-content`: height is `hug`, `%` is 0, no `fit-content()`.** On the height both are the `hug` (the content's height at the already resolved width). A `"N%"` child contributes 0 to the measured parent, and there is no `fit-content()` (the `hug` limited by the parent's space is the `hug`).
- **Slot and `min-content`.** The slot is worth its content's width; in a component with a slot, the `min-content` uses the slot's content measured as `hug` (that of the laid-out children), not their `min-content`.
- **`hug` text in a `min-content` `row` does not shrink on its own.** The text's `hug` is the whole line; for the text to follow the row's minimum width, use `fill` on it.
- **Grid without areas, named tracks, `order`, `dense` or `align-content`.** The tracks always have equal size (`1fr`): there is no `grid-template-areas`, columns of different widths or named tracks. There is no per-child `order` (the order is the template's, with `reverse`), no `dense` placement (a `span` that does not fit leaves the hole) and no `align-content`/`justify-content` between lines: the flow lines stay together at the start, separated by the `lineGap`.
- **A slot's children's `weight` does not exist.** The `weight` belongs to template nodes (a `fill` child of `row`/`column`); Arrange does not read the children's fields, so the `weight` of Material 3's `row`, `column` and `box` types stays only in the label. In a slot's grid, the child takes one cell, without `span`.
- **The `none` slot's alignment only acts in Arrange.** With `align`/`justify` (`formatVersion` 4) the `none` slot puts each child alone in the slot's box when the person requests **Arrange** (`Alt+Shift+A`, the Details button, the context menu); a new child and a child moved by hand stay where they were put until the next Arrange. The children overlap (there is no `gap` or `padding` in `none`). Without `align`/`justify` (or both at `start`), Arrange does not touch the children. The **screen without geometry** (`layoutScreen`) aligns by the same `align`/`justify`, but only on the axes where the content has a known size (on a `hug` axis the alignment has no slack).
- **`clip` does not scroll and does not clip in screen pixels.** The slot's and the frame's `clip` only hide what exceeds the box; scrolling does not exist. The slot's clipping does not apply to drawing in screen pixels (`screen`).
- **New `formatVersion` 4 key in an old MCP.** Format 4 gains keys without bumping the version (`font.align: justify`, `over` on the `$token`, the new `fit`s, `shadow.spread`, the shadow list, `stroke.gap`, `provide` and `$provided`). An MCP earlier than the one that brought them reads a component that uses them and rejects the unknown key or value at its path (`expected one of: …`, `unknown key: over`); update the MCP before opening a library that uses them. It also applies to `provide` on the slot and `$provided` (the inherited color): the old MCP rejects the unknown key (`unknown key: provide`). The same goes for `align`/`justify` on `none` and for `clip` on the slot: an old MCP that reads a new v4 rejects the unknown key at its path (`unknown key: clip`). The same goes for the grid (`layout.type: "grid"` and the keys `columns`, `minColumnWidth`, `rows`, `minRowHeight`), `span`, `weight` and `repeat.layout`: the old MCP rejects the unknown value or key at its path (`expected one of: none, row, column`, `unknown key: span`).
- **`let` and `$var` in an earlier MCP or app.** Variables enter `formatVersion` 4 without bumping the version (decision of stage #1504). An MCP earlier than 0.38.0, or an app earlier than it, reads a component that uses them and rejects `unknown key: let` (and `unknown key: $var` where they appear); update the MCP before opening a library that uses them. Variables have no parameter (they are not functions), do not apply outside a `frame`, and are not shared between components nor declared in the specialization.
- **Math only with numbers, no dates or text.** The operations (`$add`, `$mul`, `$sin`…), the comparisons (`$gt`…), `$rows`, `$size`, the `repeat` by `count` with `$index` and the anchors by expression apply only in the component's `formatVersion` 4 and only over numbers: there is no date function (`$weekday`), nor text formatting beyond the number (fixed decimal places, leading zero, thousands separator). An MCP earlier than this version rejects the new key at its path.
- **Inherited color only applies between parent and child markings of the same drawing.** Only the component's first `slot` offers (its `provide` applies); the value is text or number, resolved in the parent, and there is no lookup between siblings or downward. A floating marking and a canvas marking without a parent always use the `default`.
- **An anchor that resizes is left out.** `$anchor.width` and `$anchor.height` let the template follow the anchor's size (the menu with the field's width), but the marking's rectangle does not change by itself: the anchor only **positions** (by action, "Snap to anchor"), never gives the size. Resizing the anchor also does not move the anchored one.
- **`rotation` is drawing only and rotates around the box's center.** It does not change layout or measurement; the content of a `slot` inside a rotated node does not rotate; the enlarged clip (stroke and shadow outside the box) of a frame with rotated children counts the rotated child's box, not what is inside it.
- Gradient only `linear`; shadow up to 4 per node, only on `frame`, `rect` and `ellipse` (see below); one border per node.
- **`shadow.spread` and shadow list only on `frame`, `rect` and `ellipse`.** On other node types the `spread` is ignored and a list draws only the first shadow (without a warning).
- Lists that become numbered fields (`label1`, `label2`…) are fragile: for data in table form (a screen's events, a call's properties), declare a `table` field and draw it with `repeat`. The Material 3 components (the navigation bar, the sheet with N items) still use numbered fields.
- The `repeat` does not nest in the validator (a `table` has no `table` inside; the engine expands a `repeat` inside another, but the file is rejected) and does not measure the table to grow the marking: the box belongs to the marking. A row drawing with columns of width aligned across rows (a grid) needs fixed or `%` widths; `hug` measures each row separately. For rows of equal height that fill the parent's space, use `distribute: "fill"` (`formatVersion` 4).
- **`fill` on the main axis of a `hug` parent is still 0** (with the warning `fill inside hug becomes 0`): there is nowhere to take the size from. What the two-pass measurement solves is `fill` and `%` on the **cross** axis, like a text that wraps in a `hug` column.
- Text measurement in Node is approximate (see above).
- **There is no inner shadow.** `shadow` is always outer; for a sunken-background effect, draw one more node.
- **`stroke.sides` with a color or width per side.** The requested sides share color, width, `align` and `dash`; for different values per side, use two nodes (each with its own `sides`).
- **`wrap` wraps only by the children's natural size.** The lines come from each child's size on the main axis (the `hug` of a `fill` child); a text that changes height when wrapping inside its own line does not change the lines. There is no `alignContent` (the lines stay together at the start of the cross axis, separated only by the `lineGap`), and `hug` on the main axis measures a single line. In the slot, children beyond `maxLines` lines stay where they are, and the new child of a `wrap-reverse` goes after the last (Arrange puts the new line at the top).
- **`$lines` in two passes, no third.** A template in which the number of lines changes the width of the text itself (or of a sibling that squeezes it) may not settle: the second pass's number stays and the engine warns `$lines unstable: <node>`. The `sizing` is evaluated before measuring, so it accepts neither `$lines` nor `$size`.
- **`middle` centers the line box, not the capital letter.** The line box has the font's ascent and descent, which vary from one font to another; a one-line label can end up a few tenths of a px above or below the letter's center. For a one-line label (button, chip, tab, field), use `cap-middle`; for a paragraph, or to match the DOM line by line, `middle`.
- **`cap-middle` with runs larger than the node's.** The `capHeight` is that of the node's base font; a run with a larger `size` can end up off-center.
- **Rich text aligns by the baseline only in the node's base font.** `baselinePadding` and `align: "baseline"` use the base font's baseline; the pieces of a line (text of different sizes and chips) stay vertically centered on the line. With runs of very different `size`, the letters may not touch the same baseline; for a large highlight, prefer a chip or a separate node.
- **A library component inside the text line does not exist.** The chip is a run with a background (text, color, radius and padding), not a node: an icon or another component in the middle of the text requires a `row` frame with neighboring nodes.
- **Reading direction without bidi or shaping.** `rtl` mirrors the **layout** (rows, grids, logical anchors, `font.align` and the `mirror` nodes); the writing of the text itself is left to whoever draws. In the app, the browser's canvas does what Konva's `direction` allows; the MCP's raster draws **glyph by glyph, without bidi** (opentype.js does not have it): Arabic comes out without the joined forms and a run of another direction in the middle of a line (a Latin number in Arabic text) is not reordered. The `image` node **does not mirror** (only `icon` and `path` have `mirror`) and the `padding` is physical. For a run that must stay in a fixed direction, use `direction` on its node.
- **Rich text in `rtl`: only the order of the pieces.** The `text` node with `runs` in `rtl` puts each line's pieces from right to left (the first run at the right edge) and Konva draws each piece with `direction: rtl`; the order of glyphs inside a piece is that of plain text (no bidi in the MCP's raster, see the item above) and line wrapping continues by the logical order of the words.
- **The MCP's image is not the app's.** `render_marking` and `render_container` draw with the built-in free font (or the library's `fonts`): the text's width differs from the app's system font, so a line break may fall elsewhere. The gradient is worth the first color, the remote image becomes a placeholder and the shadow has no inner version.
