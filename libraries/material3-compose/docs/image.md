# Image

An image with scale and description. Use it for photos, covers and illustrations, from a local resource or from a URL.

Annotation type: `image` (Content layer).

## Fields

| Key                  | Label       | Type   | Required | Options                                                                  | Default | Description                                                                                                          |
| -------------------- | ----------- | ------ | -------- | ------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `url`                | Image URL   | string | yes      |                                                                          |         | https:// address of the image. The component shows it on the canvas; in code it goes through the app's image loader. |
| `contentDescription` | Description | string | no       |                                                                          |         | Accessibility text of the image. Empty = decorative (null).                                                          |
| `contentScale`       | Scale       | enum   | no       | `Crop`, `Fit`, `FillBounds`, `FillWidth`, `FillHeight`, `Inside`, `None` | `Fit`   | How the image fills the space (ContentScale).                                                                        |
| `width`              | Width       | enum   | no       | `wrap`, `fill`, `fixed`                                                  | `wrap`  | wrap fits the content, fill takes all the available width and fixed uses the marking width (dp).                     |
| `height`             | Height      | enum   | no       | `wrap`, `fill`, `fixed`                                                  | `wrap`  | wrap fits the content, fill takes all the available height and fixed uses the marking height (dp).                   |
| `weight`             | Weight      | number | no       |                                                                          |         | Share of the leftover space in a Row or Column (Modifier.weight). Empty = no weight.                                 |

## Compose

- Symbol: `androidx.compose.foundation.Image`
- File (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/Image.kt`

How the annotation becomes the call (the values below are examples; the parameter names and expressions are those of `params` and `values` in `code`):

```kotlin
// local resource
Image(
    painter = painterResource(R.drawable.cover),
    contentDescription = "Album cover",
    contentScale = ContentScale.Crop,
    modifier = Modifier.fillMaxWidth().height(180.dp),
)

// remote url: the app's loader (here, Coil), outside androidx
AsyncImage(
    model = "https://example.com/cover.jpg",
    contentDescription = "Album cover",
    contentScale = ContentScale.Crop,
    modifier = Modifier.fillMaxWidth().height(180.dp),
)
```

Notes from `code` (what the tool hands to the agent):

> `Image` takes a `Painter`: a local image is `Image(painter = painterResource(R.drawable.x), contentDescription, contentScale)`; the remote `url` uses the app's image loader (for example Coil `AsyncImage(model = <url>, contentDescription, contentScale)`), which lives outside androidx and this library. Size: `fill` becomes `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` becomes `Modifier.width(<marking width>.dp)`/`height(<marking height>.dp)` and `weight` becomes `Modifier.weight(<weight>f)` (only inside a Row, Column or FlowRow).

## Examples

- **Cropped cover**: url=https://example.com/cover.jpg, contentDescription=Album cover, contentScale=Crop, width=fill, height=fixed
- **Whole illustration**: url=https://example.com/illustration.png, contentScale=Fit, width=fill

## Fidelity

Reference: Compose `foundation` of commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (the library pins Compose `material3` 1.4.0 at that commit). 1 dp = 1 component unit; the container density converts it to image pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The `image` is from Foundation (`Image` and, for a URL, the `AsyncImage` of the app's image loader): Material 3 has no image tokens, and this drawing has no `material3` token values to follow.

**Files used**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/Image.kt` (`Image(painter, contentDescription, modifier, alignment, contentScale, alpha, colorFilter)`; the default `contentScale` is `ContentScale.Fit`).
- `compose/ui/ui/src/commonMain/kotlin/androidx/compose/ui/layout/ContentScale.kt` (`Crop`, `Fit`, `FillBounds`, `FillWidth`, `FillHeight`, `Inside` and `None`).

**How the drawing follows Compose**

- Each `contentScale` goes to the `fit` of the format 4 `image` node: `Crop` to `cover`, `Fit` to `contain`, `FillBounds` to `fill`, `FillWidth` to `fill-width`, `FillHeight` to `fill-height`, `Inside` to `scale-down` and `None` to `none` (`ContentScale.kt`). `None` and `scale-down` use the natural size of the downloaded image.
- The image comes from an `https` URL through the format's `image` node; the background behind it (and the placeholder, before it loads) uses the `surface-variant` token, which changes with light and dark mode. There is no literal color.
- Without a URL, the caption shows the description and the measures, in `on-surface-variant`, with the `label-small` style of the tokens (no `family`).

**What still differs from Compose**

- The MCP server draws the image placeholder (without the real image), so the new `fit` values only show in the app and in the viewer.
- `alpha` is a field and code, but the drawing does not use it; there is no `alignment` or `colorFilter` (they are not fields of the type).
- The image is only requested from the network with the origin's permission in the app, and the MCP server always draws the placeholder; Compose loads the image through the app's loader.
- The `surface-variant` background is a drawing choice: Compose's `Image` has no background or placeholder.

**Accessibility** (stage #1081; the unit is the dp, 1 dp = 1 component unit): the type has `accessibility.role` `image` and reads the accessible name from `contentDescription`, which is optional (a decorative image needs none).
