// justificado.mjs: node justificado.mjs <library folder>
// Replaces the `card` of a copy of `m3-tokens` with a 300 × 120 format 4 component, white
// background, with the keys of the "faithful Material 3, the rest" epic that R25.87 onwards
// checks: justified text (`font.align` `justify`) and the composite color (`over` on the `$token`).
// The nodes, in card units:
//   - the paragraph `par` at (20, 20), 120 wide with 16 lines, red text `#D32F2F`
//     (Roboto 12, the default font) with seven `WWW` words: three fit per line (about 108 of
//     ink, 12 short of the width), so there are three lines (3, 3 and 1 word); the ink of the first
//     two goes up to x 140 (justified) and that of the last, a single word, stays on the left;
//   - the black stripe `#000000` (node `faixa`) at (180, 20), 100 × 80;
//   - the `véu` (veil) at (200, 30), 60 × 20, with fill `{ $token: primary, alpha: 0.5, over: '#FFFFFF' }`:
//     the primary (`#6750A4`) at 50% composited over white, opaque (`#B3A7D1`), not letting the stripe through;
//   - the `translúcido` (translucent) at (200, 60), 60 × 20, with the same `$token` and `alpha`, but without `over`: the
//     primary at 50% over the black stripe (`#33284F`).
// It also removes the `interaction` field from `card` (the minimal component does not draw it), like
// `tokens.mjs` of R25.22; no effect if the copy no longer has it.
import fs from 'node:fs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node justificado.mjs <library folder>');
const specFile = dir + '/material3-compose.spec.json';
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
for (const layer of spec.layers)
  for (const type of layer.annotationTypes)
    if (type.id === 'card') {
      type.fields = type.fields.filter((f) => f.key !== 'interaction');
      type.examples = (type.examples ?? []).filter(
        (e) => e.values?.interaction === undefined,
      );
    }
fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));

const file = dir + '/components/card.json';
const primary = { $token: 'primary', alpha: 0.5 };
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
        type: 'text',
        name: 'par',
        anchors: { left: 20, top: 20 },
        width: 120,
        height: 'hug',
        text: 'WWW WWW WWW WWW WWW WWW WWW',
        color: '#D32F2F',
        font: { size: 12, lineHeight: 16, align: 'justify' },
      },
      {
        type: 'rect',
        name: 'faixa',
        anchors: { left: 180, top: 20 },
        width: 100,
        height: 80,
        fill: '#000000',
      },
      {
        type: 'rect',
        name: 'véu',
        anchors: { left: 200, top: 30 },
        width: 60,
        height: 20,
        fill: { ...primary, over: '#FFFFFF' },
      },
      {
        type: 'rect',
        name: 'translúcido',
        anchors: { left: 200, top: 60 },
        width: 60,
        height: 20,
        fill: primary,
      },
    ],
  },
};
fs.writeFileSync(file, JSON.stringify(card, null, 2));
