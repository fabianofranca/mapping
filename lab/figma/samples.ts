/**
 * Exemplos embutidos do laboratório: o mesmo cartão em duas formas, como o Figma entrega.
 * O SVG segue o que "Copy as SVG" produz (com "Include id attribute" ligado): `<tspan>` com a
 * linha de base, filtro de sombra em `<g>`, gradiente em `userSpaceOnUse`. O JSON segue a
 * resposta de `GET /v1/files/:key/nodes?ids=…&geometry=paths` (com `relativeTransform`).
 */

export const SAMPLE_SVG = `<svg width="360" height="220" viewBox="0 0 360 220" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Card" filter="url(#filter0_d_1_2)">
<rect id="Background" x="16" y="12" width="328" height="188" rx="16" fill="white"/>
</g>
<circle id="Avatar" cx="56" cy="56" r="20" fill="url(#paint0_linear_1_2)"/>
<text id="Title" fill="#1F2937" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="18" font-weight="600" letter-spacing="0em"><tspan x="88" y="52.5455">Maria Souza</tspan></text>
<text id="Subtitle" fill="#6B7280" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="13" letter-spacing="0em"><tspan x="88" y="72.7273">Designer de produto</tspan></text>
<rect id="Divider" x="40" y="100" width="280" height="1" fill="#E5E7EB"/>
<g id="Button">
<rect id="Button/bg" x="40" y="132" width="132" height="44" rx="10" fill="#1A63CC"/>
<text id="Button/label" fill="white" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="14" font-weight="600" letter-spacing="0em"><tspan x="86" y="159.091">Seguir</tspan></text>
<path id="Button/icon" d="M60 146L68 154L60 162" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<g id="Pill">
<rect id="Pill/bg" x="189" y="133" width="130" height="42" rx="21" stroke="#1A63CC" stroke-width="2"/>
<path id="Pill/star" fill-rule="evenodd" clip-rule="evenodd" d="M212 144L214.47 149.53L220.5 150.18L216 154.27L217.27 160.2L212 157.2L206.73 160.2L208 154.27L203.5 150.18L209.53 149.53L212 144Z" fill="#1A63CC"/>
<text id="Pill/label" fill="#1A63CC" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="14" font-weight="500" letter-spacing="0em"><tspan x="230" y="159.091">Mensagem</tspan></text>
</g>
<defs>
<filter id="filter0_d_1_2" x="0" y="0" width="360" height="220" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="4"/>
<feGaussianBlur stdDeviation="8"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.12 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1_2"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_1_2" result="shape"/>
</filter>
<linearGradient id="paint0_linear_1_2" x1="36" y1="36" x2="76" y2="76" gradientUnits="userSpaceOnUse">
<stop stop-color="#5B9BFF"/>
<stop offset="1" stop-color="#7E57C2"/>
</linearGradient>
</defs>
</svg>
`;

const rgb = (hex: string, a = 1) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  a,
});
const solid = (hex: string, opacity?: number) => ({
  blendMode: 'NORMAL',
  type: 'SOLID',
  color: rgb(hex),
  ...(opacity === undefined ? {} : { opacity }),
});
const at = (x: number, y: number) => [
  [1, 0, x],
  [0, 1, y],
];
const box = (x: number, y: number, width: number, height: number) => ({
  absoluteBoundingBox: { x, y, width, height },
  size: { x: width, y: height },
});
/** `x`/`y` relativos ao pai; `parent` é a origem absoluta do pai (a caixa absoluta precisa bater). */
const text = (
  id: string,
  name: string,
  characters: string,
  x: number,
  y: number,
  parent: { x: number; y: number },
  width: number,
  height: number,
  color: string,
  fontSize: number,
  fontWeight: number,
) => ({
  id,
  name,
  type: 'TEXT',
  characters,
  fills: [solid(color)],
  strokes: [],
  effects: [],
  relativeTransform: at(x, y),
  ...box(parent.x + x, parent.y + y, width, height),
  style: {
    fontFamily: 'Inter',
    fontPostScriptName: fontWeight >= 600 ? 'Inter-SemiBold' : null,
    fontWeight,
    fontSize,
    textAlignHorizontal: 'LEFT',
    textAlignVertical: 'TOP',
    letterSpacing: 0,
    lineHeightPx: Math.round(fontSize * 1.21 * 100) / 100,
    lineHeightPercent: 100,
    lineHeightUnit: 'INTRINSIC_%',
  },
});

/** Origens absolutas dos contêineres do exemplo (o Card fica em 16,12 na página). */
const CARD = { x: 16, y: 12 };
const BUTTON = { x: 40, y: 132 };
const PILL = { x: 188, y: 132 };

/** Um `FRAME` "Card" com os mesmos elementos do SVG, em coordenadas relativas ao pai. */
const sampleNodes = {
  name: 'Exemplo',
  lastModified: '2026-10-16T12:00:00Z',
  version: '1',
  nodes: {
    '1:2': {
      document: {
        id: '1:2',
        name: 'Card',
        type: 'FRAME',
        clipsContent: false,
        cornerRadius: 16,
        fills: [solid('#FFFFFF')],
        strokes: [],
        effects: [
          {
            type: 'DROP_SHADOW',
            visible: true,
            color: { r: 0, g: 0, b: 0, a: 0.12 },
            blendMode: 'NORMAL',
            offset: { x: 0, y: 4 },
            radius: 16,
            spread: 0,
          },
        ],
        relativeTransform: at(16, 12),
        ...box(16, 12, 328, 188),
        children: [
          {
            id: '1:3',
            name: 'Avatar',
            type: 'ELLIPSE',
            fills: [
              {
                blendMode: 'NORMAL',
                type: 'GRADIENT_LINEAR',
                gradientHandlePositions: [
                  { x: 0, y: 0 },
                  { x: 1, y: 1 },
                  { x: 0, y: 1 },
                ],
                gradientStops: [
                  { color: rgb('#5B9BFF'), position: 0 },
                  { color: rgb('#7E57C2'), position: 1 },
                ],
              },
            ],
            strokes: [],
            effects: [],
            relativeTransform: at(20, 24),
            ...box(36, 36, 40, 40),
          },
          text('1:4', 'Title', 'Maria Souza', 72, 24, CARD, 160, 22, '#1F2937', 18, 600),
          text(
            '1:5',
            'Subtitle',
            'Designer de produto',
            72,
            48,
            CARD,
            160,
            16,
            '#6B7280',
            13,
            400,
          ),
          {
            id: '1:6',
            name: 'Divider',
            type: 'RECTANGLE',
            fills: [solid('#E5E7EB')],
            strokes: [],
            effects: [],
            cornerRadius: 0,
            relativeTransform: at(24, 88),
            ...box(40, 100, 280, 1),
          },
          {
            id: '1:7',
            name: 'Button',
            type: 'INSTANCE',
            componentId: '9:1',
            clipsContent: false,
            cornerRadius: 10,
            fills: [solid('#1A63CC')],
            strokes: [],
            effects: [],
            relativeTransform: at(24, 120),
            ...box(40, 132, 132, 44),
            children: [
              {
                id: 'I1:7;9:2',
                name: 'Icon',
                type: 'VECTOR',
                fills: [],
                strokes: [solid('#FFFFFF')],
                strokeWeight: 2,
                strokeAlign: 'CENTER',
                strokeCap: 'ROUND',
                strokeJoin: 'ROUND',
                effects: [],
                relativeTransform: at(20, 14),
                ...box(60, 146, 8, 16),
                fillGeometry: [],
                strokeGeometry: [
                  {
                    path: 'M0.29 0.29C0.68 -0.1 1.32 -0.1 1.71 0.29L8.71 7.29C9.1 7.68 9.1 8.32 8.71 8.71L1.71 15.71C1.32 16.1 0.68 16.1 0.29 15.71C-0.1 15.32 -0.1 14.68 0.29 14.29L6.59 8L0.29 1.71C-0.1 1.32 -0.1 0.68 0.29 0.29Z',
                    windingRule: 'NONZERO',
                  },
                ],
              },
              text(
                'I1:7;9:3',
                'Label',
                'Seguir',
                46,
                13,
                BUTTON,
                60,
                17,
                '#FFFFFF',
                14,
                600,
              ),
            ],
          },
          {
            id: '1:8',
            name: 'Pill',
            type: 'FRAME',
            clipsContent: false,
            cornerRadius: 21,
            fills: [],
            strokes: [solid('#1A63CC')],
            strokeWeight: 2,
            strokeAlign: 'INSIDE',
            effects: [],
            relativeTransform: at(172, 120),
            ...box(188, 132, 132, 44),
            children: [
              {
                id: '1:9',
                name: 'Star',
                type: 'STAR',
                fills: [solid('#1A63CC')],
                strokes: [],
                effects: [],
                relativeTransform: at(15, 12),
                ...box(203, 144, 17, 16.2),
                fillGeometry: [
                  {
                    path: 'M8.5 0L10.97 5.53L17 6.18L12.5 10.27L13.77 16.2L8.5 13.2L3.23 16.2L4.5 10.27L0 6.18L6.03 5.53L8.5 0Z',
                    windingRule: 'EVENODD',
                  },
                ],
              },
              text('1:10', 'Label', 'Mensagem', 42, 13, PILL, 80, 17, '#1A63CC', 14, 500),
            ],
          },
          {
            id: '1:11',
            name: 'Foto',
            type: 'RECTANGLE',
            fills: [
              {
                blendMode: 'NORMAL',
                type: 'IMAGE',
                scaleMode: 'FILL',
                imageRef: 'a1b2c3d4e5f6',
              },
            ],
            strokes: [],
            effects: [],
            cornerRadius: 8,
            relativeTransform: at(256, 24),
            ...box(272, 36, 56, 40),
          },
        ],
      },
    },
  },
};

export const SAMPLE_JSON = JSON.stringify(sampleNodes, null, 2);
