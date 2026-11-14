// fx.mjs: node fx.mjs <pasta da biblioteca>
// Troca o `card` de uma cópia de `m3-tokens` por um componente de formato 4 com as chaves novas
// do épico "formato 4, extensões" (R25.71 ao R25.74): `stroke.offset`, `wrap: none` cortado,
// `$token` com `alpha` e raio por `$token`, e `space-evenly` com `reverse`.
import fs from 'node:fs';

const file = process.argv[2] + '/components/card.json';
const rect = (left, top, width, height, extra) => ({
  type: 'rect',
  anchors: { left, top },
  width,
  height,
  ...extra,
});
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
      // O anel afastado 4 da forma, por fora (raio 8 + 4).
      rect(30, 30, 80, 30, {
        cornerRadius: 8,
        fill: '#E0E0E0',
        stroke: { color: '#000000', width: 2, align: 'outside', offset: 4 },
      }),
      // A linha que passa da caixa de 40 px sai cortada no meio da letra.
      {
        type: 'text',
        anchors: { left: 150, top: 20 },
        width: 40,
        height: 20,
        text: 'HHHHHHHHHHHHHHHH',
        color: '#000000',
        font: {
          family: 'sans-serif',
          size: 16,
          lineHeight: 20,
          wrap: 'none',
          // Uma linha só, cortada pela caixa de propósito: o maxLines diz isso ao motor, que não avisa
          // "texto maior que a caixa" (o R25.71 espera só os avisos de parâmetro fora da ficha).
          maxLines: 1,
        },
      },
      // Raio e cor por token; a cor com metade do alfa.
      rect(30, 85, 60, 25, {
        cornerRadius: { $token: 'corner-small' },
        fill: { $token: 'primary', alpha: 0.5 },
      }),
      // Dois quadrados com vão igual em volta, na ordem invertida (o azul vem primeiro).
      {
        type: 'frame',
        anchors: { left: 120, top: 70 },
        width: 150,
        height: 30,
        layout: { type: 'row', justify: 'space-evenly', reverse: true, align: 'center' },
        children: [
          { type: 'rect', width: 20, height: 20, fill: '#D32F2F' },
          { type: 'rect', width: 20, height: 20, fill: '#1976D2' },
        ],
      },
    ],
  },
};
fs.writeFileSync(file, JSON.stringify(card, null, 2));
