// herdada.mjs: node herdada.mjs <pasta da biblioteca>
// Prepara uma cópia de `m3-tokens` para o épico "Material 3 fiel, o resto" (R25.83 em diante): a
// cor herdada da `formatVersion` 4 (`provide` no slot e `$provided` na filha). Troca dois
// componentes e acrescenta o campo `ink` ao tipo `card`:
//   - `card` (300 × 120, fundo `#FFF8E1`): um `slot` `conteudo` (10 de folga nos quatro lados,
//     layout `none`) que oferece `content-color`, com `{ "$field": "ink", "default": "#1976D2" }`:
//     a cor do campo `ink` do Card, ou azul se ele estiver vazio;
//   - `text` (200 × 70): um texto `HHHH` em negrito de 56 px (o campo `text`, padrão `HHHH`) cuja
//     `color` é `{ "$provided": "content-color", "default": "#2E7D32" }`: a cor que o ancestral
//     mais próximo oferece, ou verde se nenhum oferece.
// Um Text dentro do Card sai azul (ou da cor do `ink`); um Text solto na tela sai verde.
// Também tira o campo `interaction` do `card` (o componente mínimo não o desenha), como o
// `tokens.mjs` do R25.22; sem efeito se a cópia já não o tem.
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
        label: 'Tinta',
        type: 'string',
        description:
          'Cor (#RRGGBB) que o Card oferece ao conteúdo dele (content-color); vazia, vale o azul #1976D2.',
      });
      type.examples = (type.examples ?? []).filter(
        (e) => e.values?.interaction === undefined,
      );
    }
    // O `text` mínimo (200 × 70, texto de 56 px) não comporta os exemplos do Material 3: sem eles a
    // prova de desenho não avisa `conteúdo maior que a caixa`.
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
