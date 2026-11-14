// sombras.mjs: node sombras.mjs <library folder>
// Replaces the `card` of a copy of `m3-tokens` with a 300 × 120 format 4 component, white
// background, with the keys of the "faithful Material 3, the rest" epic (R25.79 onwards): the list
// of shadows with `shadow.spread` and the outline with a gap (`stroke.gap`). The nodes, in card units:
//   - the yellow rectangle `#FFEB3B` (node `sombras`, shadows) at (40, 20), 60 × 40, with TWO shadows: the first
//     (on top) is blue `#1976D2`, no blur, `spread` 4 (a ring of 4 around it, from x 36 to 104
//     and from y 16 to 64); the second is black, `y` 14, `blur` 4 and `spread` -6 (its shape goes from
//     x 46 to 94 and from y 40 to 68, and what sticks out below the blue ring is the ambient shadow);
//   - the 120 × 60 frame (node `contorno`, outline) at (150, 30), no fill, `cornerRadius` 8 and a 2 red
//     `#D32F2F` inside outline with `gap` on the `label` node and `padding` 4;
//   - the `label` (black `hug` text, font 12, line of 16) at (170, 22): its box crosses
//     the top side of the frame (y 30 to 32), and the outline disappears in that stretch plus 4 on each side
//     (from x 166 onwards; the end depends on the text width).
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
      {
        type: 'rect',
        name: 'sombras',
        anchors: { left: 40, top: 20 },
        width: 60,
        height: 40,
        fill: '#FFEB3B',
        shadow: [
          { color: '#1976D2', x: 0, y: 0, blur: 0, spread: 4 },
          { color: '#000000', x: 0, y: 14, blur: 4, spread: -6 },
        ],
      },
      {
        type: 'frame',
        name: 'contorno',
        anchors: { left: 150, top: 30 },
        width: 120,
        height: 60,
        cornerRadius: 8,
        stroke: {
          color: '#D32F2F',
          width: 2,
          align: 'inside',
          gap: { node: 'label', padding: 4 },
        },
      },
      {
        type: 'text',
        name: 'label',
        anchors: { left: 170, top: 22 },
        width: 'hug',
        height: 'hug',
        text: 'Nome',
        color: '#000000',
        font: { family: 'sans-serif', size: 12, lineHeight: 16 },
      },
    ],
  },
};
fs.writeFileSync(file, JSON.stringify(card, null, 2));
