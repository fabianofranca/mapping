// fiel.mjs: node fiel.mjs <library folder> [formatVersion]
import fs from 'node:fs';
const usage = (reason) => {
  console.error(`Usage: node fiel.mjs <library folder> [formatVersion]\n${reason}`);
  process.exit(2);
};
const folder = process.argv[2];
if (!folder) usage('Missing the library folder.');
const dir = folder + '/components/';
if (!fs.existsSync(dir)) usage(`No components/ folder in ${folder}.`);
const version = Number(process.argv[3] ?? 4);
if (version !== 3 && version !== 4) {
  usage(`formatVersion must be 3 or 4, got ${process.argv[3]}.`);
}
const INK = '#B3261E';
const bar = (name, top, cap) => ({
  type: 'path',
  name,
  d: 'M 12 10 L 88 10',
  viewBox: [100, 20],
  anchors: { left: 10, top },
  width: 100,
  height: 20,
  stroke: { color: INK, width: 12, align: 'center', cap },
});
const corner = (name, left, join) => ({
  type: 'path',
  name,
  d: 'M 14 36 L 14 14 L 36 14',
  viewBox: [40, 40],
  anchors: { left, top: 90 },
  width: 40,
  height: 40,
  stroke: { color: INK, width: 16, align: 'center', join },
});
const write = (id, name, size, template, extra = {}) =>
  fs.writeFileSync(
    dir + id + '.json',
    JSON.stringify(
      {
        format: 'mapping-component',
        formatVersion: version,
        id,
        name,
        size,
        ...extra,
        template,
      },
      null,
      2,
    ),
  );
write(
  'divider',
  'Divider',
  { width: 140, height: 140 },
  {
    type: 'frame',
    name: 'tracos',
    width: 140,
    height: 140,
    layout: { type: 'none' },
    fill: '#FFFFFF',
    children: [
      bar('butt', 0, 'butt'),
      bar('round', 30, 'round'),
      bar('square', 60, 'square'),
      corner('miter', 5, 'miter'),
      corner('round', 50, 'round'),
      corner('bevel', 95, 'bevel'),
    ],
  },
);
write(
  'text-field',
  'Text field',
  { width: 240, height: 56 },
  {
    type: 'frame',
    name: 'campo',
    width: 240,
    height: 56,
    layout: { type: 'none' },
    children: [
      {
        type: 'rect',
        name: 'fundo',
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        fill: '#E6E0E9',
        stroke: { color: '#6750A4', width: 3, align: 'inside', sides: ['bottom'] },
      },
    ],
  },
);
write(
  'card',
  'Card',
  { width: 200, height: 100 },
  {
    type: 'frame',
    name: 'cartao',
    width: 200,
    height: 100,
    fill: '#FFFFFF',
    stroke: { color: '#1B5E20', width: 8, align: 'outside' },
  },
);
write(
  'list-item',
  'List item',
  { width: 240, height: 120 },
  {
    type: 'frame',
    name: 'cartao-de-texto',
    width: 240,
    height: 120,
    fill: '#FFFFFF',
    layout: { type: 'column', gap: 8, padding: 20 },
    children: [
      { type: 'rect', name: 'ruler', width: 'fill', height: 6, fill: '#6D4C41' },
      {
        type: 'frame',
        name: 'cartao',
        width: 'hug',
        height: 'hug',
        fill: '#4FC3F7',
        layout: { type: 'column', padding: 8 },
        children: [
          {
            type: 'text',
            name: 'texto',
            text: 'Quando o cartão abraça o texto longo',
            width: 'fill',
            color: '#000000',
            font: { size: 14, lineHeight: 20 },
          },
        ],
      },
    ],
  },
);
write(
  'navigation-bar',
  'Navigation bar',
  { width: 240, height: 180 },
  {
    type: 'frame',
    name: 'lista',
    width: 240,
    height: 180,
    fill: '#FFFFFF',
    layout: { type: 'column', padding: 10 },
    children: [
      {
        type: 'repeat',
        name: 'linhas',
        field: 'items',
        direction: 'column',
        gap: 10,
        distribute: 'fill',
        template: {
          type: 'frame',
          name: 'linha',
          layout: { type: 'row', padding: [0, 12], align: 'center' },
          fill: {
            $switch: 'label',
            cases: { A: '#D81B60', B: '#F9A825', C: '#00897B' },
            default: '#9E9E9E',
          },
          children: [
            { type: 'text', name: 'label', text: { $field: 'label' }, color: '#000000' },
          ],
        },
      },
    ],
  },
  { preview: { items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] } },
);
write(
  'checkbox',
  'Checkbox',
  { width: 240, height: 60 },
  {
    type: 'frame',
    name: 'limite',
    width: 240,
    height: 60,
    fill: '#FFFFFF',
    layout: { type: 'row', gap: 10, padding: 10 },
    children: [
      { type: 'rect', name: 'com-limite', width: 'fill', maxWidth: 60, fill: '#8E24AA' },
      { type: 'rect', name: 'sem-limite', width: 'fill', fill: '#FB8C00' },
    ],
  },
);
write(
  'text',
  'Text',
  { width: 110, height: 142 },
  {
    type: 'frame',
    name: 'textos',
    width: 110,
    height: 142,
    fill: '#FFFFFF',
    layout: { type: 'column', gap: 4, padding: 5 },
    children: [
      { type: 'rect', name: 'ruler', width: 'fill', height: 4, fill: '#E65100' },
      {
        type: 'text',
        name: 'linha',
        text: 'Oi supercalifragilisticoexpialidocioso demais',
        width: 'fill',
        height: 20,
        color: '#0D47A1',
        font: { size: 14, lineHeight: 20, wrap: 'none', ellipsis: true },
      },
      {
        type: 'text',
        name: 'paragrafo',
        text: 'Um dois tres quatro cinco seis sete oito nove dez',
        width: 'fill',
        height: 60,
        color: '#4A148C',
        font: {
          size: 14,
          lineHeight: 20,
          maxLines: { $field: 'maxLines', default: 2 },
          ellipsis: true,
        },
      },
      {
        type: 'text',
        name: 'solto',
        text: 'Texto solto',
        width: 'fill',
        height: 'fill',
        color: '#000000',
        font: { size: 14, lineHeight: 20 },
      },
    ],
  },
  { minSize: { width: 60, height: 40 } },
);
write(
  'chip',
  'Chip',
  { width: 260, height: 116 },
  {
    type: 'frame',
    name: 'trechos',
    width: 260,
    height: 116,
    fill: '#FFFFFF',
    layout: { type: 'column', gap: 8, padding: 10 },
    children: [
      { type: 'rect', name: 'ruler', width: 'fill', height: 4, fill: '#827717' },
      {
        type: 'text',
        name: 'linha',
        width: 'fill',
        height: 'hug',
        color: '#455A64',
        font: { size: 14, lineHeight: 20 },
        runs: [
          { text: 'Mmmm ' },
          { text: 'Mmmm', weight: 700, color: '#2E7D32' },
          { text: ' ' },
          {
            text: { $field: 'label' },
            color: '#FFFFFF',
            background: '#00ACC1',
            radius: 8,
            padding: [3, 6],
          },
        ],
      },
      {
        type: 'text',
        name: 'quebra',
        width: 100,
        height: 'hug',
        color: '#880E4F',
        font: { size: 14, lineHeight: 20 },
        runs: [
          { text: 'WWWWWW' },
          {
            text: ' novo',
            color: '#000000',
            background: '#C0CA33',
            radius: 8,
            padding: [3, 6],
          },
        ],
      },
    ],
  },
  { preview: { label: 'novo' } },
);

// MC0 (R25.91 and R25.92): the `badge` becomes two 40 × 28 text boxes in a 140 × 50 piece. The one on
// the left (blue `#0D47A1`, at 10, 10) is a clipped text (`wrap` `none`) of two paragraphs with
// `align` `center`: `HHHHHHH` (about 50 wide, wider than the box) and `H`, so the short line
// starts at the block, not at the center of the box. The one on the right (red `#B71C1C`, at 90, 10) is a
// three-line `cap-middle` in a two-line box: only two are drawn, centered by their block
// (`maxLines` 3 only silences the `text larger than the box` warning: it cuts nothing).
// Only in version 4 (the two keys do not exist before it; R25.2 still has the eight pieces and 15 errors).
if (version >= 4) {
  const box = (name, left, color, text, font) => ({
    type: 'text',
    name,
    text,
    anchors: { left, top: 10 },
    width: 40,
    height: 28,
    color,
    font: { size: 10, lineHeight: 14, ...font },
  });
  write(
    'badge',
    'Badge',
    { width: 140, height: 50 },
    {
      type: 'frame',
      name: 'cortes',
      width: 140,
      height: 50,
      layout: { type: 'none' },
      fill: '#FFFFFF',
      children: [
        box('cortado', 10, '#0D47A1', 'HHHHHHH\nH', { align: 'center', wrap: 'none' }),
        box('cap', 90, '#B71C1C', 'HHH\nHHH\nHHH', {
          verticalAlign: 'cap-middle',
          maxLines: 3,
        }),
      ],
    },
  );
}

// MC1 (R25.93 to R25.95): the `snackbar` becomes a 140 × 80 piece with the baseline. On the left, a
// red `H` (`#B71C1C`, at 10, 0, in a 40 × 60 box) with `baselinePadding.top` 30: the foot of the
// letter sits 30 from the top of the node. On the right, a `hug` `row` (at 70, 10) with `align` `baseline` and two
// `H`, a blue one (`#0D47A1`, 14/20) and a green one (`#1B5E20`, 22/28): both feet sit on the same line.
// Only in version 4 (the keys do not exist before it; R25.2 still has the eight pieces and 15 errors).
if (version >= 4) {
  const letter = (name, color, size, lineHeight, extra = {}) => ({
    type: 'text',
    name,
    text: 'H',
    color,
    font: { size, lineHeight, family: 'sans-serif' },
    ...extra,
  });
  write(
    'snackbar',
    'Snackbar',
    { width: 140, height: 80 },
    {
      type: 'frame',
      name: 'base',
      width: 140,
      height: 80,
      layout: { type: 'none' },
      fill: '#FFFFFF',
      children: [
        letter('top30', '#B71C1C', 13, 15.6, {
          anchors: { left: 10, top: 0 },
          width: 40,
          height: 60,
          baselinePadding: { top: 30 },
        }),
        {
          type: 'frame',
          name: 'fileira',
          anchors: { left: 70, top: 10 },
          width: 'hug',
          height: 'hug',
          layout: { type: 'row', gap: 4, align: 'baseline' },
          children: [
            letter('pequeno', '#0D47A1', 14, 20),
            letter('grande', '#1B5E20', 22, 28),
          ],
        },
      ],
    },
  );
}

// MC2 (R25.95 and R25.96): the `top-app-bar` becomes a 140 × 100 piece with the height by lines. A
// red box (`#B71C1C`) `hug` in height, with `minHeight` 48 or 68 by the `$lines` of the `msg` text,
// and the text of 1, 2 or 3 lines (white `H`s, 20 line height, 14 of breathing room above and below)
// by the `style` (`small`, `center` and `medium`): the box measures 48, 68 and 88. Only in version 4 (`$lines` does not
// exist before it; R25.2 still has the eight pieces and 15 errors).
if (version >= 4) {
  write(
    'top-app-bar',
    'Top app bar',
    { width: 140, height: 100 },
    {
      type: 'frame',
      name: 'linhas',
      width: 140,
      height: 100,
      layout: { type: 'column', align: 'start' },
      fill: '#FFFFFF',
      children: [
        {
          type: 'frame',
          name: 'caixa',
          width: 'fill',
          height: 'hug',
          minHeight: { $if: { $gt: [{ $lines: 'msg' }, 1] }, then: 68, else: 48 },
          layout: { type: 'column', padding: [14, 0] },
          fill: '#B71C1C',
          children: [
            {
              type: 'text',
              name: 'msg',
              text: {
                $switch: 'style',
                cases: { small: 'H', center: 'H\nH', medium: 'H\nH\nH' },
                default: 'H',
              },
              color: '#FFFFFF',
              width: 'fill',
              height: 'hug',
              font: { size: 13, lineHeight: 20, family: 'sans-serif' },
            },
          ],
        },
      ],
    },
  );
}

// MC3 (R25.97 and R25.98): the `button` becomes a 120 × 40 piece with the height by the label. A
// red box (`#B71C1C`) `hug` in height (`sizing.height` `hug`, `minSize` 48 × 40), with the label in
// white `H`s (20 line height, 10 of breathing room above and below): 1 line measures 40, 2 lines 60,
// 3 lines 80. The type's "Long label" example is removed (the piece only fits the long text at the adjusted size). Only in version 4
// (`sizing` with `hug` in height is only valid in format 4; R25.2 still has the eight pieces and 15 errors).
if (version >= 4) {
  write(
    'button',
    'Button',
    { width: 120, height: 40 },
    {
      type: 'frame',
      name: 'botao',
      width: 'fill',
      height: 'hug',
      layout: { type: 'column', padding: [10, 8] },
      fill: '#B71C1C',
      children: [
        {
          type: 'text',
          name: 'rotulo',
          text: { $field: 'label', default: '' },
          color: '#FFFFFF',
          width: 'fill',
          height: 'hug',
          font: { size: 13, lineHeight: 20, family: 'sans-serif' },
        },
      ],
    },
    {
      minSize: { width: 48, height: 40 },
      sizing: { height: 'hug' },
      preview: {
        label: 'H H H',
        style: 'filled',
        enabled: 'true',
        icon: '',
      },
    },
  );
}

// MC4 (R25.98 and R25.99): the `flow-row` becomes a 140 × 80 piece with the row wrap. A `hug` `row`
// (at 10, 10, 120 wide) with `wrap`, `gap` 4 and `lineGap` 6 and five 36 × 20 boxes of different
// colors (`#B71C1C`, `#0D47A1`, `#1B5E20`, `#E65100` and `#4A148C`): three on the first line (x 10,
// 50 and 90; y 10) and two on the second (x 10 and 50; y 36). Only in version 4 (`wrap` does not exist before it; R25.2
// still has the eight pieces and 15 errors).
if (version >= 4) {
  const box = (name, color) => ({
    type: 'rect',
    name,
    width: 36,
    height: 20,
    fill: color,
  });
  write(
    'flow-row',
    'FlowRow',
    { width: 140, height: 80 },
    {
      type: 'frame',
      name: 'quebra',
      width: 140,
      height: 80,
      layout: { type: 'none' },
      fill: '#FFFFFF',
      children: [
        {
          type: 'frame',
          name: 'fileira',
          anchors: { left: 10, top: 10 },
          width: 120,
          height: 'hug',
          layout: { type: 'row', gap: 4, wrap: 'wrap', lineGap: 6 },
          children: [
            box('k1', '#B71C1C'),
            box('k2', '#0D47A1'),
            box('k3', '#1B5E20'),
            box('k4', '#E65100'),
            box('k5', '#4A148C'),
          ],
        },
      ],
    },
  );
}

// The minimal components above do not draw `interaction`: without removing the field and the examples that
// use it, the validator warns "unused field" (R25.1).
const specFile = process.argv[2] + '/material3-compose.spec.json';
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
for (const layer of spec.layers)
  for (const type of layer.annotationTypes)
    if (
      [
        'button',
        'card',
        'checkbox',
        'chip',
        'list-item',
        'navigation-bar',
        'text-field',
      ].includes(type.id)
    ) {
      type.fields = type.fields.filter((f) => f.key !== 'interaction');
      type.examples = (type.examples ?? []).filter(
        (e) => e.values?.interaction === undefined,
      );
    }
// The swapped `top-app-bar` has no slot: the type's named slots (formatVersion 17) would have no component to hold them.
// Only from version 4, where the component swap happens.
if (version >= 4)
  for (const layer of spec.layers)
    for (const type of layer.annotationTypes)
      if (type.id === 'top-app-bar') delete type.slots;
// The `button`'s long-label example only fits the adjusted size, and the proof at `size` warns (MC3).
for (const layer of spec.layers)
  for (const type of layer.annotationTypes)
    if (version >= 4 && type.id === 'button') {
      const before = (type.examples ?? []).length;
      type.examples = (type.examples ?? []).filter((e) => e.name !== 'Long label');
      if (type.examples.length === before)
        throw new Error('example "Long label" of the button not found');
    }
fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));
