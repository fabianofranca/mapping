// let.mjs: node let.mjs <pasta da biblioteca> [caso]
// Troca o `card` de uma cópia de `m3-tokens` por um componente de formato 4 com variáveis (`let` e
// `$var`, R25.121 ao R25.126). Sem `caso`, o card é válido; com `caso`, o card sai com um erro:
//   indefinida  o `$var` de um nome que nenhum `let` declara
//   ciclo       duas variáveis que se usam (a → b → a)
//   tipo        um erro de tipo dentro da variável (texto numa conta)
//   nome        um nome de variável fora de [a-z][a-zA-Z0-9]*
//   v3          o mesmo card na formatVersion 3
// O card válido (300 × 120 unidades) desenha:
//   - quatro quadrados de 20 em fileira, a partir de (20, 20), vão 10 (variável `gap`): os dois
//     primeiros vermelhos e os dois últimos azuis, porque a variável `dot` do `let` da raiz usa o
//     `$index` da linha em que é usada; o tamanho 20 vem do `let` do template do repeat;
//   - um retângulo verde em (170, 20), 60 × 40, com a `tone` do `let` do quadro de dentro, e um
//     laranja em (240, 20), 40 × 40, com a `tone` da raiz (o de dentro esconde o de fora);
//   - uma barra roxa em (0, 100), de altura 10 e metade da largura da instância (`$size` na
//     variável `half`): 150 em 300.
import fs from 'node:fs';

const file = process.argv[2] + '/components/card.json';
const kind = process.argv[3];

const card = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'card',
  name: 'Card',
  size: { width: 300, height: 120 },
  template: {
    type: 'frame',
    let: {
      gap: 10,
      tone: '#FF9800',
      dot: {
        $if: { $lt: [{ $field: '$index' }, 2] },
        then: '#D32F2F',
        else: '#1976D2',
      },
      half: { $mul: [{ $size: 'width' }, 0.5] },
    },
    fill: '#FFFFFF',
    layout: { type: 'none' },
    children: [
      {
        type: 'frame',
        anchors: { left: 20, top: 20 },
        width: 110,
        height: 20,
        layout: { type: 'column' },
        children: [
          {
            type: 'repeat',
            count: 4,
            direction: 'row',
            gap: { $var: 'gap' },
            template: {
              type: 'frame',
              let: { side: 20 },
              width: { $var: 'side' },
              height: { $var: 'side' },
              fill: { $var: 'dot' },
            },
          },
        ],
      },
      {
        type: 'frame',
        let: { tone: '#2E7D32' },
        anchors: { left: 170, top: 20 },
        width: 60,
        height: 40,
        layout: { type: 'none' },
        children: [
          {
            type: 'rect',
            anchors: { left: 0, top: 0 },
            width: 60,
            height: 40,
            fill: { $var: 'tone' },
          },
        ],
      },
      {
        type: 'rect',
        anchors: { left: 240, top: 20 },
        width: 40,
        height: 40,
        fill: { $var: 'tone' },
      },
      {
        type: 'rect',
        anchors: { left: 0, top: 100 },
        width: { $var: 'half' },
        height: 10,
        fill: '#6A1B9A',
      },
    ],
  },
};

const repeat = card.template.children[0].children[0];
const roots = card.template.let;
const variants = {
  indefinida: () => {
    repeat.gap = { $var: 'space' };
  },
  ciclo: () => {
    roots.a = { $add: [{ $var: 'b' }, 1] };
    roots.b = { $mul: [{ $var: 'a' }, 2] };
    repeat.gap = { $var: 'a' };
  },
  tipo: () => {
    roots.gap = { $mul: ['larga', 0.5] };
  },
  nome: () => {
    roots.Gap = 10;
  },
  v3: () => {
    card.formatVersion = 3;
  },
};

if (kind !== undefined) {
  const apply = variants[kind];
  if (apply === undefined) {
    console.error(`caso desconhecido: ${kind} (${Object.keys(variants).join(', ')})`);
    process.exit(2);
  }
  apply();
}
fs.writeFileSync(file, JSON.stringify(card, null, 2));
