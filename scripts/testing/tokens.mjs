// tokens.mjs: node scripts/testing/tokens.mjs <library folder> [ok|error]
import fs from 'node:fs';
const dir = process.argv[2];
const failing = process.argv[3] === 'error';
const specFile = dir + '/material3-compose.spec.json';
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
spec.formatVersion = Math.max(spec.formatVersion, 15);
// The minimal card.json further below does not draw `interaction`: without removing the field from the type, the validator warns.
for (const layer of spec.layers)
  for (const type of layer.annotationTypes)
    if (type.id === 'card') {
      type.fields = type.fields.filter((f) => f.key !== 'interaction');
      type.examples = type.examples.filter((e) => e.values?.interaction === undefined);
    }
// The package already carries `tokens` (~170 keys) and `icons`: the four values below are MERGED into the
// existing ones (replacing the whole `spec.tokens` deletes the ones the other components use).
const base = spec.tokens ?? { modes: ['light', 'dark'], values: {} };
spec.tokens = {
  modes: base.modes,
  values: {
    ...base.values,
    primary: { light: '#6750A4', dark: '#D0BCFF' },
    'on-primary': { light: '#FFFFFF', dark: '#381E72' },
    'radius-md': 12,
    'space-4': 16,
  },
};
fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));
const line = (name, text, color, family) => ({
  type: 'text',
  name,
  text,
  color,
  font: { size: 14, lineHeight: 20, ...(family ? { family } : {}) },
});
const mono = { $token: 'font-mono' };
const template = failing
  ? {
      type: 'frame',
      name: 'cartao',
      width: 240,
      height: 176,
      layout: { type: 'column', gap: 8 },
      children: [
        {
          type: 'rect',
          name: 'sem-token',
          width: 50,
          height: 20,
          fill: { $token: 'missing' },
        },
        {
          type: 'rect',
          name: 'tipo-errado',
          width: 50,
          height: 20,
          cornerRadius: { $token: 'primary' },
        },
      ],
    }
  : {
      type: 'frame',
      name: 'cartao',
      width: 240,
      height: 176,
      fill: { $token: 'primary' },
      cornerRadius: { $token: 'radius-md' },
      layout: { type: 'column', gap: 8, padding: { $token: 'space-4' } },
      children: [
        { type: 'rect', name: 'ruler', width: 100, height: 4, fill: '#FFEB3B' },
        line('i-sans', 'iiiiiiiiii', '#00E5FF'),
        line('w-sans', 'WWWWWWWWWW', '#76FF03'),
        line('i-mono', 'iiiiiiiiii', '#FF4081', mono),
        line('w-mono', 'WWWWWWWWWW', '#FFAB40', mono),
        {
          type: 'rect',
          name: 'amostra',
          width: 20,
          height: 20,
          fill: { $token: 'on-primary' },
        },
      ],
    };
fs.writeFileSync(
  dir + '/components/card.json',
  JSON.stringify(
    {
      format: 'mapping-component',
      formatVersion: 4,
      id: 'card',
      name: 'Card',
      size: { width: 240, height: 176 },
      template,
    },
    null,
    2,
  ),
);
