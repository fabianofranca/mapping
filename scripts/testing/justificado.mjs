// justificado.mjs: node justificado.mjs <pasta da biblioteca>
// Troca o `card` de uma cópia de `m3-tokens` por um componente de formato 4 de 300 × 120, de fundo
// branco, com as chaves do épico "Material 3 fiel, o resto" que o R25.87 em diante confere: o texto
// justificado (`font.align` `justify`) e a cor composta (`over` no `$token`). Os nós, em unidades
// do card:
//   - o parágrafo `par` em (20, 20), de 120 de largura e linhas de 16, texto vermelho `#D32F2F`
//     (Roboto 12, a fonte padrão) com sete palavras `WWW`: cabem três por linha (cerca de 108 de
//     tinta, a 12 da largura), então são três linhas (3, 3 e 1 palavra); a tinta das duas primeiras
//     vai até x 140 (justificadas) e a da última, de uma palavra só, fica à esquerda;
//   - a faixa preta `#000000` em (180, 20), de 100 × 80;
//   - o `véu` em (200, 30), de 60 × 20, de fill `{ $token: primary, alpha: 0.5, over: '#FFFFFF' }`:
//     o primary (`#6750A4`) a 50% composto sobre branco, opaco (`#B3A7D1`), sem deixar a faixa passar;
//   - o `translúcido` em (200, 60), de 60 × 20, com o mesmo `$token` e `alpha`, mas sem `over`: o
//     primary a 50% sobre a faixa preta (`#33284F`).
// Também tira o campo `interaction` do `card` (o componente mínimo não o desenha), como o
// `tokens.mjs` do R25.22; sem efeito se a cópia já não o tem.
import fs from 'node:fs';

const dir = process.argv[2];
if (!dir) throw new Error('uso: node justificado.mjs <pasta da biblioteca>');
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
