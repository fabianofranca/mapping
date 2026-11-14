// herdada.mjs: node herdada.mjs <library folder>
// Prepares a copy of `m3-tokens` for the "faithful Material 3, the rest" epic (R25.83 onwards): the
// inherited color of `formatVersion` 4 (`provide` on the slot and `$provided` on the child). It
// replaces two components and adds the `ink` field to the `card` type:
//   - `card` (300 × 120, background `#FFF8E1`): a `slot` `conteudo` (10 of margin on all four sides,
//     layout `none`) that offers `content-color`, with `{ "$field": "ink", "default": "#1976D2" }`:
//     the color of the Card's `ink` field, or blue if it is empty;
//   - `text` (200 × 70): a 56 px bold `HHHH` text (the `text` field, default `HHHH`) whose
//     `color` is `{ "$provided": "content-color", "default": "#2E7D32" }`: the color the nearest
//     ancestor offers, or green if none does.
// A Text inside the Card comes out blue (or in the `ink` color); a Text loose on the screen comes
// out green.
// It also removes the `interaction` field from `card` (the minimal component does not draw it), like
// `tokens.mjs` of R25.22; no effect if the copy no longer has it.
import fs from 'node:fs';

const dir = process.argv[2];
const specFile = dir + '/material3-compose.spec.json';
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
for (const layer of spec.layers)
  for (const type of layer.annotationTypes)
    if (type.id === 'card') {
      type.fields = type.fields.filter((f) => f.key !== 'interaction' && f.key !== 'ink');
      type.fields.push({
        key: 'ink',
        label: 'Ink',
        type: 'string',
        description:
          'Color (#RRGGBB) the Card offers to its content (content-color); when empty, the blue #1976D2 applies.',
      });
      type.examples = (type.examples ?? []).filter(
        (e) => e.values?.interaction === undefined,
      );
    }
    // The minimal `text` (200 × 70, 56 px text) does not fit the Material 3 examples: without them the
    // drawing proof does not warn `content larger than the box`.
    else if (type.id === 'text') delete type.examples;
fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));

const component = (id, name, size, template) => ({
  format: 'mapping-component',
  formatVersion: 4,
  id,
  name,
  size,
  template,
});

const card = component(
  'card',
  'Card',
  { width: 300, height: 120 },
  {
    type: 'frame',
    fill: '#FFF8E1',
    layout: { type: 'none' },
    children: [
      {
        type: 'slot',
        name: 'conteudo',
        anchors: { left: 10, top: 10, right: 10, bottom: 10 },
        layout: { type: 'none' },
        provide: { 'content-color': { $field: 'ink', default: '#1976D2' } },
      },
    ],
  },
);

const text = component(
  'text',
  'Text',
  { width: 200, height: 70 },
  {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'text',
        name: 'texto',
        anchors: { left: 0, top: 0 },
        width: 'hug',
        height: 'hug',
        text: { $field: 'text', default: 'HHHH' },
        color: { $provided: 'content-color', default: '#2E7D32' },
        font: { family: 'sans-serif', size: 56, weight: 700, lineHeight: 64 },
      },
    ],
  },
);

for (const c of [card, text])
  fs.writeFileSync(dir + '/components/' + c.id + '.json', JSON.stringify(c, null, 2));
