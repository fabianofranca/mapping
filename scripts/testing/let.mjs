// let.mjs: node let.mjs <library folder> [case]
// Replaces the `card` of a copy of `m3-tokens` with a format 4 component with variables (`let` and
// `$var`, R25.121 to R25.126). Without `case`, the card is valid; with `case`, the card comes out with an error:
//   indefinida  the `$var` of a name that no `let` declares (undefined)
//   ciclo       two variables that use each other (a → b → a) (cycle)
//   tipo        a type error inside the variable (text in a calculation) (type)
//   nome        a variable name outside [a-z][a-zA-Z0-9]* (name)
//   v3          the same card in formatVersion 3
// The valid card (300 × 120 units) draws:
//   - four 20 squares in a row, starting at (20, 20), gap 10 (variable `gap`): the first two red
//     and the last two blue, because the `dot` variable of the root `let` uses the `$index` of the
//     row where it is used; the size 20 comes from the `let` of the repeat template;
//   - a green rectangle at (170, 20), 60 × 40, with the `tone` of the inner frame's `let`, and an
//     orange one at (240, 20), 40 × 40, with the root's `tone` (the inner one hides the outer one);
//   - a purple bar at (0, 100), height 10 and half the width of the instance (`$size` in the
//     `half` variable): 150 out of 300.
import fs from 'node:fs';

const file = process.argv[2] + '/components/card.json';
const kind = process.argv[3];

const card = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'card',
  name: 'Card',
  size: { width: 300, height: 120 },
  template: {
    type: 'frame',
    let: {
      gap: 10,
      tone: '#FF9800',
      dot: {
        $if: { $lt: [{ $field: '$index' }, 2] },
        then: '#D32F2F',
        else: '#1976D2',
      },
      half: { $mul: [{ $size: 'width' }, 0.5] },
    },
    fill: '#FFFFFF',
    layout: { type: 'none' },
    children: [
      {
        type: 'frame',
        anchors: { left: 20, top: 20 },
        width: 110,
        height: 20,
        layout: { type: 'column' },
        children: [
          {
            type: 'repeat',
            count: 4,
            direction: 'row',
            gap: { $var: 'gap' },
            template: {
              type: 'frame',
              let: { side: 20 },
              width: { $var: 'side' },
              height: { $var: 'side' },
              fill: { $var: 'dot' },
            },
          },
        ],
      },
      {
        type: 'frame',
        let: { tone: '#2E7D32' },
        anchors: { left: 170, top: 20 },
        width: 60,
        height: 40,
        layout: { type: 'none' },
        children: [
          {
            type: 'rect',
            anchors: { left: 0, top: 0 },
            width: 60,
            height: 40,
            fill: { $var: 'tone' },
          },
        ],
      },
      {
        type: 'rect',
        anchors: { left: 240, top: 20 },
        width: 40,
        height: 40,
        fill: { $var: 'tone' },
      },
      {
        type: 'rect',
        anchors: { left: 0, top: 100 },
        width: { $var: 'half' },
        height: 10,
        fill: '#6A1B9A',
      },
    ],
  },
};

const repeat = card.template.children[0].children[0];
const roots = card.template.let;
const variants = {
  indefinida: () => {
    repeat.gap = { $var: 'space' };
  },
  ciclo: () => {
    roots.a = { $add: [{ $var: 'b' }, 1] };
    roots.b = { $mul: [{ $var: 'a' }, 2] };
    repeat.gap = { $var: 'a' };
  },
  tipo: () => {
    roots.gap = { $mul: ['larga', 0.5] };
  },
  nome: () => {
    roots.Gap = 10;
  },
  v3: () => {
    card.formatVersion = 3;
  },
};

if (kind !== undefined) {
  const apply = variants[kind];
  if (apply === undefined) {
    console.error(`unknown case: ${kind} (${Object.keys(variants).join(', ')})`);
    process.exit(2);
  }
  apply();
}
fs.writeFileSync(file, JSON.stringify(card, null, 2));
