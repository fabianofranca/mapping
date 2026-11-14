// rot.mjs: node rot.mjs <library folder>
// Replaces the `card` of a copy of `m3-tokens` with a format 4 component with the keys of the
// "expressions that calculate" epic (R25.75 to R25.78): the width of a bar by `$size` and
// `$mul` (half the width of the instance) and a rectangle with `rotation` 45.
import fs from 'node:fs';

const file = process.argv[2] + '/components/card.json';
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
      // The blue bar starts at x 20 and has half the width of the instance (150 of 300).
      {
        type: 'rect',
        anchors: { left: 20, top: 20 },
        width: { $mul: [{ $size: 'width' }, 0.5] },
        height: 10,
        fill: '#1976D2',
      },
      // 60 × 20 at (200, 60), rotated 45° around the center (230, 70): drawing only.
      {
        type: 'rect',
        anchors: { left: 200, top: 60 },
        width: 60,
        height: 20,
        fill: '#D32F2F',
        rotation: 45,
      },
    ],
  },
};
fs.writeFileSync(file, JSON.stringify(card, null, 2));
