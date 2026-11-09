// fiel.mjs: node fiel.mjs <pasta da biblioteca> [formatVersion]
import fs from 'node:fs';
const dir = process.argv[2] + '/components/';
const version = Number(process.argv[3] ?? 4);
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
      { type: 'rect', name: 'régua', width: 'fill', height: 6, fill: '#6D4C41' },
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
            { type: 'text', name: 'rótulo', text: { $field: 'label' }, color: '#000000' },
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
      { type: 'rect', name: 'régua', width: 'fill', height: 4, fill: '#E65100' },
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
      { type: 'rect', name: 'régua', width: 'fill', height: 4, fill: '#827717' },
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

// Os componentes mínimos acima não desenham o `interaction`: sem tirar o campo e os exemplos que o
// usam, o validador avisa "campo não usado" (R25.1).
const specFile = process.argv[2] + '/material3-compose.spec.json';
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
for (const layer of spec.layers)
  for (const type of layer.annotationTypes)
    if (
      ['card', 'checkbox', 'chip', 'list-item', 'navigation-bar', 'text-field'].includes(
        type.id,
      )
    ) {
      type.fields = type.fields.filter((f) => f.key !== 'interaction');
      type.examples = (type.examples ?? []).filter(
        (e) => e.values?.interaction === undefined,
      );
    }
fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));
