// Ícones em SVG inline (sem dependências), na cor do texto (`currentColor`).
// Conjunto original da interface 2.0: grade de 16px, traço de 1,25 e pontas redondas.
// O tamanho em tela vem do CSS (`--density-icon`: 16px no desktop, 20px no celular).
import type { JSX } from 'preact';
import { LOCK_PATHS, UNLOCK_PATHS } from '../utils/lockGlyph';

interface IconShape {
  /** Traços (atributo `d` de cada `<path>`), na grade de 16 x 16. */
  readonly d: readonly string[];
  /** Pontos cheios (centros); os ícones de lista, "mais" e alça usam. */
  readonly dots?: readonly (readonly [number, number])[];
}

/** Círculo como traço (o `Icon` só desenha `<path>` e pontos). */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

const SHAPES = {
  // Edição
  undo: { d: ['M5.5 3 2.5 6l3 3', 'M2.5 6h6a4 4 0 0 1 0 8H7'] },
  redo: { d: ['m10.5 3 3 3-3 3', 'M13.5 6h-6a4 4 0 0 0 0 8H9'] },
  edit: {
    d: ['M2.5 13.5 3.2 10.2 10.2 3.2a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2L5.8 12.8Z'],
  },
  copy: {
    d: [
      'M6.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z',
      'M10.5 5.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1',
    ],
  },
  trash: {
    d: [
      'M2.5 4.5h11',
      'M6.5 7v4.5',
      'M9.5 7v4.5',
      'M4 4.5l.7 8.5h6.6l.7-8.5',
      'M6 4.5v-2h4v2',
    ],
  },
  plus: { d: ['M8 3v10', 'M3 8h10'] },
  minus: { d: ['M3 8h10'] },
  check: { d: ['m3 8.5 3.2 3.2L13 4.8'] },
  close: { d: ['m3.5 3.5 9 9', 'm12.5 3.5-9 9'] },
  refresh: { d: ['M13 3.5v3h-3', 'M12.6 6.5A5 5 0 1 0 13 8.5'] },

  // Ferramentas
  pan: {
    d: [
      'M8 2v12',
      'M2 8h12',
      'm6 4 2-2 2 2',
      'm6 12 2 2 2-2',
      'm4 6-2 2 2 2',
      'm12 6 2 2-2 2',
    ],
  },
  pointer: { d: ['M3 2.5l9 4-3.8 1.4L6.6 12Z'] },
  draw: {
    d: ['M2.5 6V2.5H6', 'M9 2.5h3.5V6', 'M2.5 9v4.5H6', 'M11.5 9v5', 'M9 11.5h5'],
  },
  marking: { d: ['M2.5 4h11v8h-11Z'] },
  crop: { d: ['M4.5 1.5v10h10', 'M1.5 4.5h10v10'] },
  text: { d: ['M3 5V3h10v2', 'M6 13h4', 'M8 3v10'] },
  fit: { d: ['M2.5 6V2.5H6', 'M13.5 6V2.5H10', 'M2.5 10v3.5H6', 'M13.5 10v3.5H10'] },
  zoomIn: { d: [circle(7, 7, 4.5), 'm10.5 10.5 3 3', 'M5 7h4', 'M7 5v4'] },
  zoomOut: { d: [circle(7, 7, 4.5), 'm10.5 10.5 3 3', 'M5 7h4'] },
  search: { d: [circle(7, 7, 4.5), 'm10.5 10.5 3 3'] },
  locate: { d: [circle(8, 8, 4), 'M8 1.5v3', 'M8 11.5v3', 'M1.5 8h3', 'M11.5 8h3'] },
  filter: { d: ['M2.5 3.5h11L9.5 8.5V13l-3-1.5V8.5Z'] },

  // Navegação
  menu: { d: ['M2.5 4h11', 'M2.5 8h11', 'M2.5 12h11'] },
  chevronUp: { d: ['m4 10 4-4 4 4'] },
  chevronDown: { d: ['m4 6 4 4 4-4'] },
  chevronLeft: { d: ['m10 4-4 4 4 4'] },
  chevronRight: { d: ['m6 4 4 4-4 4'] },
  arrowUp: { d: ['M8 13.5v-11', 'm3.5 7 4.5-4.5L12.5 7'] },
  arrowDown: { d: ['M8 2.5v11', 'm3.5 9 4.5 4.5L12.5 9'] },
  arrowLeft: { d: ['M13.5 8h-11', 'm7 3.5-4.5 4.5L7 12.5'] },
  arrowRight: { d: ['M2.5 8h11', 'm9 3.5 4.5 4.5L9 12.5'] },
  collapseAll: { d: ['m4.5 7 3.5-3.5L11.5 7', 'm4.5 12.5 3.5-3.5 3.5 3.5'] },
  expandAll: { d: ['m4.5 3.5 3.5 3.5 3.5-3.5', 'm4.5 9 3.5 3.5L11.5 9'] },
  maximize: {
    d: ['M9.5 2.5h4v4', 'M13.5 2.5 9 7', 'M6.5 13.5h-4v-4', 'm2.5 13.5 4.5-4.5'],
  },
  minimize: { d: ['M13.5 6.5h-4v-4', 'm9.5 6.5 4-4', 'M2.5 9.5h4v4', 'm6.5 9.5-4 4'] },
  externalLink: {
    d: [
      'M9.5 2.5h4v4',
      'M13.5 2.5 7.5 8.5',
      'M12 9v3.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H7',
    ],
  },
  home: { d: ['M2.5 7.5 8 2.5l5.5 5', 'M4 6.5V13h8V6.5', 'M6.5 13V9.5h3V13'] },

  // Janelas e painéis
  panelLeft: { d: ['M2.5 3h11v10h-11Z', 'M6 3v10'] },
  panelRight: { d: ['M2.5 3h11v10h-11Z', 'M10 3v10'] },
  panelBottom: { d: ['M2.5 3h11v10h-11Z', 'M2.5 10h11'] },
  minimap: { d: ['M2.5 3h11v10h-11Z', 'M7 6h4.5v4H7Z'] },
  tree: {
    d: [
      'M5.5 2.5h5v3h-5Z',
      'M8 5.5V8',
      'M4.5 8h7',
      'M4.5 8v2',
      'M11.5 8v2',
      'M2.5 10h4v3.5h-4Z',
      'M9.5 10h4v3.5h-4Z',
    ],
  },
  layers: { d: ['m8 2.5 6 3-6 3-6-3Z', 'm2 8.5 6 3 6-3', 'm2 11 6 3 6-3'] },
  list: {
    d: ['M6 4h7.5', 'M6 8h7.5', 'M6 12h7.5'],
    dots: [
      [3, 4],
      [3, 8],
      [3, 12],
    ],
  },
  table: { d: ['M2.5 3h11v10h-11Z', 'M2.5 6.5h11', 'M2.5 9.8h11', 'M6.5 6.5V13'] },
  checklist: {
    d: ['m2.5 4.5 1 1 2-2', 'm2.5 10.5 1 1 2-2', 'M8 4.5h5.5', 'M8 10.5h5.5'],
  },
  diagnostics: { d: ['M2 8h3l2-4.5 2 9 2-4.5h3'] },
  specialization: {
    d: [
      'M2.5 2.5h4.5v4.5h-4.5Z',
      circle(11.25, 4.75, 2.25),
      'M8 13.5l3-5 3 5Z',
      'M2.5 9h4.5v4.5h-4.5Z',
    ],
  },
  more: {
    d: [],
    dots: [
      [3.5, 8],
      [8, 8],
      [12.5, 8],
    ],
  },
  moreVertical: {
    d: [],
    dots: [
      [8, 3.5],
      [8, 8],
      [8, 12.5],
    ],
  },
  grip: {
    d: [],
    dots: [
      [6, 4],
      [10, 4],
      [6, 8],
      [10, 8],
      [6, 12],
      [10, 12],
    ],
  },

  // Arquivos e dados
  addImage: {
    d: ['M2.5 3.5h7.5v9.5h-7.5Z', 'M2.5 11 5 8.5l3 3', 'M13 2v4', 'M11 4h4'],
  },
  image: {
    d: ['M2.5 3.5h11v9h-11Z', 'm2.5 11 3.5-3.5 3 3 1.5-1.5 3 3'],
    dots: [[10.5, 6.2]],
  },
  folder: {
    d: [
      'M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z',
    ],
  },
  file: {
    d: [
      'M4 2.5h5l3.5 3.5V13a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z',
      'M9 2.5V6h3.5',
    ],
  },
  save: {
    d: [
      'M3 2.5h8.5l2 2V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z',
      'M5 2.5v3.5h5V2.5',
      'M5 13.5V9h6v4.5',
    ],
  },
  export: {
    d: [
      'M8 2.5v7',
      'm4.8 6.8 3.2 3.2 3.2-3.2',
      'M2.5 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1',
    ],
  },
  upload: {
    d: [
      'M8 10V3',
      'm4.8 5.8 3.2-3.2 3.2 3.2',
      'M2.5 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1',
    ],
  },
  tag: { d: ['M2.5 2.5H8l5.5 5.5-5.5 5.5L2.5 8Z'], dots: [[5.3, 5.3]] },
  link: {
    d: [
      'M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5L8 4.5',
      'M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.5-.5',
    ],
  },
  share: {
    d: [
      circle(4, 8, 1.8),
      circle(12, 4, 1.8),
      circle(12, 12, 1.8),
      'm5.6 7.1 4.8-2.2',
      'm5.6 8.9 4.8 2.2',
    ],
  },

  // Estado e ajuda
  eye: {
    d: ['M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z', circle(8, 8, 2)],
  },
  eyeOff: {
    d: [
      'M1.5 8S4 3.5 8 3.5c1 0 1.9.3 2.7.7',
      'M14.5 8S12 12.5 8 12.5c-1 0-1.9-.3-2.7-.7',
      'm3 2.5 10 11',
    ],
  },
  lock: { d: LOCK_PATHS },
  unlock: { d: UNLOCK_PATHS },
  info: { d: [circle(8, 8, 6), 'M8 7.5V11'], dots: [[8, 5.2]] },
  warning: { d: ['M8 2.5 14 13H2Z', 'M8 6.5v3'], dots: [[8, 11.2]] },
  error: { d: [circle(8, 8, 6), 'M8 5v3.5'], dots: [[8, 10.8]] },
  help: {
    d: [circle(8, 8, 6), 'M6.5 6.3a1.5 1.5 0 1 1 2.2 1.3c-.5.3-.7.6-.7 1.2'],
    dots: [[8, 11.2]],
  },
  settings: {
    d: [
      circle(5.5, 4.5, 1.5),
      'M2.5 4.5H4',
      'M7 4.5h6.5',
      circle(10.5, 11.5, 1.5),
      'M2.5 11.5H9',
      'M12 11.5h1.5',
    ],
  },
  keyboard: {
    d: [
      'M2.5 4.5h11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z',
      'M5 10h6',
    ],
    dots: [
      [4.5, 7],
      [7, 7],
      [9.5, 7],
      [12, 7],
    ],
  },
  sun: {
    d: [
      circle(8, 8, 2.5),
      'M8 1.5V3',
      'M8 13v1.5',
      'M1.5 8H3',
      'M13 8h1.5',
      'm3.4 3.4 1 1',
      'm11.6 11.6 1 1',
      'm12.6 3.4-1 1',
      'm4.4 11.6-1 1',
    ],
  },
  moon: { d: ['M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z'] },
  globe: {
    d: [
      circle(8, 8, 6),
      'M2 8h12',
      'M8 2c2 1.8 2.5 3.5 2.5 6S10 12.2 8 14c-2-1.8-2.5-3.5-2.5-6S6 3.8 8 2Z',
    ],
  },
} as const satisfies Record<string, IconShape>;

export type IconName = keyof typeof SHAPES;

/** Nomes de todos os ícones (para testes e para a documentação). */
export const ICON_NAMES = Object.keys(SHAPES) as readonly IconName[];

export function Icon({ name }: { readonly name: IconName }): JSX.Element {
  const shape: IconShape = SHAPES[name];
  return (
    <svg
      class="icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {shape.d.map((d) => (
        <path key={d} d={d} />
      ))}
      {shape.dots?.map(([cx, cy]) => (
        <circle
          key={`${cx},${cy}`}
          cx={cx}
          cy={cy}
          r="0.9"
          fill="currentColor"
          stroke="none"
        />
      ))}
    </svg>
  );
}
