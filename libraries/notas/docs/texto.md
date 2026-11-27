# Text

Plain text on the canvas or inside a container: no background, no border and no shadow. Use it for what a mapping needs to say next to the drawing: the label of a column or of a row of a grid, the title of a page or of a section, a caption.

## Fields

- **Text** (required): the content. Accepts multiple lines: Shift+Enter breaks the line.
- **Size** (optional): the font size, in the units of the component. Empty draws **14**. In a container with a density, the size is multiplied by it, as for any component.
- **Weight** (optional): `regular` (400), `medium` (500), `semibold` (600) or `bold` (700). Empty draws `regular`.
- **Color** (optional): the name of a **color token** of an applied library (such as `on-surface`, so the text follows the theme) or a literal color as `#RRGGBB`. Empty draws `#1F1F1F`. A name that no applied library declares and that is not a color (such as `banana`) draws `#1F1F1F` too.
- **Width** (optional): the width mode, see below. Empty draws `auto`.
- **Family** (optional): the font family. Write the name of a **font-family token** of an applied library (such as `font-mono`, the embedded Mapping Mono) or a family or CSS stack (such as `Roboto Mono`). Empty draws `font-sans`, the embedded Mapping Sans.
- **Alignment** (optional): `start`, `center` or `end`, the side the lines gather at inside the box. It shows when the box is wider than the text, so `center` with `largura` `fixa` centers every line. Empty is `start`.

## The two width modes

- **`auto`** (default): the box follows the text. A line breaks only where a line break was typed (Shift+Enter), so the width is that of the longest line and the height is one line per typed line. A creation without a rectangle, **Arrange** in the app and `fit_marking` in the MCP give the box that size. Resizing the box by hand does not wrap the text.
- **`fixa`**: the text wraps at the marking's width, which **Arrange** and `fit_marking` keep. Only the height follows the content. Use it for a description or a paragraph.

## Where it lives

The text is a regular marking, not a floating one. Where it lives is decided by geometry, as for any marking:

- Created from the Palette, it is born in the selected container, otherwise in the container in view, otherwise on the canvas. Created by the MCP, it is born where `create_marking` says: with `container` and `rect` inside the container, or without `container`, on the canvas.
- A text on the canvas whose rectangle falls entirely inside a container settles into that container. From then on its position is in the container's pixels and the text follows the container when it is moved or scaled.
- Taking it out of the container is moving it out (or turning **Floating** on, below).

## Above everything: Floating

To make a text go above everything, as a note does, turn on **Floating** in Details (in the MCP, `update_marking` with `floating: true`). A floating text belongs to nothing: it is drawn above the containers, including photos, and neither carries nor is carried by what is underneath.

## Drawing

It is drawn like any component: over a photo container only with **Show components over photos** on, and the marking's border shows only on hover or selection.

## Containment

As a marking that is not floating, a text becomes the parent of what its rectangle fully contains, by the geometry rule. Keep the text box tight around the text (**Arrange**) so that it does not swallow another marking by accident.

## For the agent

Read the text with `get_marking`: the content and the options are in the values of the `texto` annotation (`texto`, `tamanho`, `peso`, `cor`, `largura`, `familia` and `alinhamento`), and `floating` is `false` unless it was turned on. This is the mapping's **own** text, a label or a title of the design page: for the text the screen really has, use the text type of the screen's library.
