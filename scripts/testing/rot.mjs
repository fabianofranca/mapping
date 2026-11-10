// rot.mjs: node rot.mjs <pasta da biblioteca>
// Troca o `card` de uma cópia de `m3-tokens` por um componente de formato 4 com as chaves do
// épico "expressões que calculam" (R25.75 ao R25.78): a largura de uma barra por `$size` e
// `$mul` (metade da largura da instância) e um retângulo com `rotation` 45.
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
      // A barra azul começa em x 20 e tem metade da largura da instância (150 de 300).
      {
        type: 'rect',
        anchors: { left: 20, top: 20 },
        width: { $mul: [{ $size: 'width' }, 0.5] },
        height: 10,
        fill: '#1976D2',
      },
      // 60 × 20 em (200, 60), girado 45° em volta do centro (230, 70): só desenho.
      {
        type: 'rect',
        anchors: { left: 200, top: 60 },
        width: 60,
        height: 20,
        fill: '#D32F2F',
        rotation: 45,
      },
    ],
  },
};
fs.writeFileSync(file, JSON.stringify(card, null, 2));
