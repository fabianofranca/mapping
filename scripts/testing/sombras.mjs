// sombras.mjs: node sombras.mjs <pasta da biblioteca>
// Troca o `card` de uma cópia de `m3-tokens` por um componente de formato 4 de 300 × 120, de fundo
// branco, com as chaves do épico "Material 3 fiel, o resto" (R25.79 em diante): a lista de
// sombras com `shadow.spread` e o contorno com vão (`stroke.gap`). Os nós, em unidades do card:
//   - o retângulo amarelo `#FFEB3B` em (40, 20), de 60 × 40, com DUAS sombras: a primeira
//     (por cima) é azul `#1976D2`, sem desfoque, `spread` 4 (um anel de 4 em volta, de x 36 a 104
//     e de y 16 a 64); a segunda é preta, `y` 14, `blur` 4 e `spread` -6 (a forma dela vai de
//     x 46 a 94 e de y 40 a 68, e o que passa do anel azul embaixo é a sombra ambiente);
//   - o quadro de 120 × 60 em (150, 30), sem preenchimento, de `cornerRadius` 8 e contorno
//     vermelho `#D32F2F` de 2 por dentro com `gap` no nó `label` e `padding` 4;
//   - o rótulo `label` (texto preto `hug`, fonte 12, linha de 16) em (170, 22): a caixa dele cruza
//     o lado de cima do quadro (y 30 a 32), e o contorno some nesse trecho mais 4 de cada lado
//     (de x 166 em diante; o fim depende da largura do texto).
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
