// fx.mjs: node fx.mjs <library folder>
// Replaces the `card` of a copy of `m3-tokens` with a format 4 component with the new keys of the
// "format 4, extensions" epic (R25.71 to R25.74): `stroke.offset`, a clipped `wrap: none`,
// `$token` with `alpha` and radius by `$token`, and `space-evenly` with `reverse`.
import fs from 'node:fs';

const file = process.argv[2] + '/components/card.json';
const rect = (left, top, width, height, extra) => ({
  type: 'rect',
  anchors: { left, top },
  width,
  height,
  ...extra,
});
const card = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'card',
  name: 'Card',
  size: { width: 300, height: 120 },
  template: {
    type: 'frame',
    fill: '#FFFFFF',
    layout: { type: 'none' },
    children: [
      // The ring 4 away from the shape, on the outside (radius 8 + 4).
      rect(30, 30, 80, 30, {
        cornerRadius: 8,
        fill: '#E0E0E0',
        stroke: { color: '#000000', width: 2, align: 'outside', offset: 4 },
      }),
      // The line that overflows the 40 px box comes out cut in the middle of a letter.
      {
        type: 'text',
        anchors: { left: 150, top: 20 },
        width: 40,
        height: 20,
        text: 'HHHHHHHHHHHHHHHH',
        color: '#000000',
        font: {
          family: 'sans-serif',
          size: 16,
          lineHeight: 20,
          wrap: 'none',
          // A single line, cut by the box on purpose: maxLines tells the engine so, which then does not
          // warn "text larger than the box" (R25.71 expects only the parameter-outside-the-sheet warnings).
          maxLines: 1,
        },
      },
      // Radius and color by token; the color at half alpha.
      rect(30, 85, 60, 25, {
        cornerRadius: { $token: 'corner-small' },
        fill: { $token: 'primary', alpha: 0.5 },
      }),
      // Two squares with equal gaps around them, in reversed order (the blue one comes first).
      {
        type: 'frame',
        anchors: { left: 120, top: 70 },
        width: 150,
        height: 30,
        layout: { type: 'row', justify: 'space-evenly', reverse: true, align: 'center' },
        children: [
          { type: 'rect', width: 20, height: 20, fill: '#D32F2F' },
          { type: 'rect', width: 20, height: 20, fill: '#1976D2' },
        ],
      },
    ],
  },
};
fs.writeFileSync(file, JSON.stringify(card, null, 2));
