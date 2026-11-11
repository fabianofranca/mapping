// tokens.mjs: node scripts/testing/tokens.mjs <pasta da biblioteca> [ok|erro]
import fs from 'node:fs';
const dir = process.argv[2];
const erro = process.argv[3] === 'erro';
const specFile = dir + '/material3-compose.spec.json';
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
spec.formatVersion = 15;
// O card.json mínimo mais abaixo não desenha o `interaction`: sem tirar o campo do tipo, o validador avisa.
for (const layer of spec.layers)
  for (const type of layer.annotationTypes)
    if (type.id === 'card') {
      type.fields = type.fields.filter((f) => f.key !== 'interaction');
      type.examples = type.examples.filter((e) => e.values?.interaction === undefined);
    }
// O pacote já traz `tokens` (~170 chaves) e `icons`: os quatro valores abaixo são MESCLADOS nos
// existentes (trocar `spec.tokens` inteiro apaga os que os outros componentes usam).
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
const template = erro
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
          fill: { $token: 'inexistente' },
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
        { type: 'rect', name: 'régua', width: 100, height: 4, fill: '#FFEB3B' },
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
