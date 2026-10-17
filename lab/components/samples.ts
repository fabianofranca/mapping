/**
 * Exemplos embutidos do laboratório "Componentes": uma especialização com seis tipos, cada um
 * apontando para o próprio arquivo de componente, e uma tela montada só com instâncias (sem
 * imagem). Os mesmos arquivos podem ser baixados como pasta (zip) para editar e reabrir.
 */
import {
  COMPONENT_FORMAT,
  COMPONENT_FORMAT_VERSION,
  type ComponentFile,
  type Expr,
  type Color,
} from '../../src/model/components/componentFormat';
import type { Screen } from '../../src/model/components/screen';

const base = {
  format: COMPONENT_FORMAT,
  formatVersion: COMPONENT_FORMAT_VERSION,
} as const;

const BLUE = '#1A63CC';
const TEXT = '#1F2937';
const MUTED = '#6B7280';
const BORDER = '#C4C9D4';
const DANGER = '#D32F2F';
const WHITE = '#FFFFFF';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** Cor do texto do botão por variante. */
const buttonText: Expr<Color> = {
  $switch: 'variant',
  cases: { secondary: BLUE, ghost: BLUE },
  default: WHITE,
};

export const BUTTON: ComponentFile = {
  ...base,
  id: 'button',
  name: 'Botão',
  description: 'Ação principal ou secundária; rótulo e ícone opcional.',
  size: { width: 132, height: 44 },
  minSize: { width: 56, height: 32 },
  preview: { label: 'Entrar', variant: 'primary', icon: 'não', disabled: 'não' },
  template: {
    type: 'frame',
    name: 'botão',
    layout: { type: 'row', gap: 8, padding: [0, 20], align: 'center', justify: 'center' },
    cornerRadius: 10,
    opacity: { $if: { $field: 'disabled' }, then: 0.4, else: 1 },
    fill: {
      $switch: 'variant',
      cases: { primary: BLUE, secondary: '#E8EEF9', danger: DANGER, ghost: 'none' },
      default: BLUE,
    },
    stroke: {
      color: { $if: { $eq: ['variant', 'ghost'] }, then: BLUE, else: TRANSPARENT },
      width: 2,
    },
    children: [
      {
        type: 'path',
        name: 'ícone',
        visible: { $field: 'icon' },
        width: 16,
        height: 16,
        viewBox: [16, 16],
        d: 'M5 2L11 8L5 14',
        fill: 'none',
        stroke: { color: buttonText, width: 2, align: 'center' },
      },
      {
        type: 'text',
        name: 'rótulo',
        text: { $field: 'label', default: 'Botão' },
        font: { size: 14, weight: 600 },
        color: buttonText,
      },
    ],
  },
};

export const TEXT_FIELD: ComponentFile = {
  ...base,
  id: 'text-field',
  name: 'Campo de texto',
  description: 'Rótulo, caixa com valor ou dica, e texto de ajuda ou erro.',
  size: { width: 280, height: 72 },
  minSize: { width: 120, height: 44 },
  preview: {
    label: 'E-mail',
    placeholder: 'nome@exemplo.com',
    value: '',
    state: 'normal',
    help: '',
  },
  template: {
    type: 'frame',
    name: 'campo',
    layout: { type: 'column', gap: 6 },
    children: [
      {
        type: 'text',
        name: 'rótulo',
        visible: { $has: 'label' },
        text: { $field: 'label' },
        font: { size: 12, weight: 600 },
        color: { $if: { $eq: ['state', 'error'] }, then: DANGER, else: TEXT },
      },
      {
        type: 'frame',
        name: 'caixa',
        width: 'fill',
        height: 40,
        layout: { type: 'row', padding: [0, 12], align: 'center' },
        cornerRadius: 8,
        fill: { $if: { $eq: ['state', 'disabled'] }, then: '#F3F4F6', else: WHITE },
        stroke: {
          color: {
            $switch: 'state',
            cases: { focus: BLUE, error: DANGER },
            default: BORDER,
          },
          width: { $if: { $eq: ['state', 'focus'] }, then: 2, else: 1 },
        },
        children: [
          {
            type: 'text',
            name: 'valor',
            width: 'fill',
            text: {
              $if: { $has: 'value' },
              then: { $field: 'value' },
              else: { $field: 'placeholder', default: '' },
            },
            font: { size: 14 },
            color: { $if: { $has: 'value' }, then: TEXT, else: '#9CA3AF' },
          },
        ],
      },
      {
        type: 'text',
        name: 'ajuda',
        visible: { $has: 'help' },
        text: { $field: 'help' },
        font: { size: 11 },
        color: { $if: { $eq: ['state', 'error'] }, then: DANGER, else: MUTED },
      },
    ],
  },
};

export const CARD: ComponentFile = {
  ...base,
  id: 'card',
  name: 'Cartão',
  description: 'Superfície com título, subtítulo e um espaço para conteúdo.',
  size: { width: 320, height: 200 },
  minSize: { width: 160, height: 96 },
  preview: { title: 'Título', subtitle: 'Subtítulo do cartão', elevated: 'sim' },
  template: {
    type: 'frame',
    name: 'cartão',
    layout: { type: 'column', gap: 8, padding: 16 },
    fill: WHITE,
    cornerRadius: 16,
    stroke: {
      color: { $if: { $field: 'elevated' }, then: TRANSPARENT, else: '#E5E7EB' },
      width: 1,
    },
    shadow: {
      color: {
        $if: { $field: 'elevated' },
        then: 'rgba(0, 0, 0, 0.12)',
        else: TRANSPARENT,
      },
      y: 4,
      blur: 16,
    },
    children: [
      {
        type: 'text',
        name: 'título',
        width: 'fill',
        text: { $field: 'title', default: 'Título' },
        font: { size: 18, weight: 600 },
        color: TEXT,
      },
      {
        type: 'text',
        name: 'subtítulo',
        width: 'fill',
        visible: { $has: 'subtitle' },
        text: { $field: 'subtitle' },
        font: { size: 13 },
        color: MUTED,
      },
      {
        type: 'slot',
        name: 'conteúdo',
        width: 'fill',
        height: 'fill',
        label: 'conteúdo',
      },
    ],
  },
};

export const AVATAR: ComponentFile = {
  ...base,
  id: 'avatar',
  name: 'Avatar',
  description: 'Círculo com iniciais e indicador de presença.',
  size: { width: 48, height: 48 },
  minSize: { width: 24, height: 24 },
  preview: { initials: 'MS', color: 'azul', online: 'sim' },
  template: {
    type: 'frame',
    name: 'avatar',
    clip: false,
    layout: { type: 'none' },
    children: [
      {
        type: 'ellipse',
        name: 'fundo',
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        fill: {
          $switch: 'color',
          cases: {
            azul: {
              type: 'linear',
              angle: 45,
              stops: [
                { offset: 0, color: '#5B9BFF' },
                { offset: 1, color: '#1A63CC' },
              ],
            },
            roxo: {
              type: 'linear',
              angle: 45,
              stops: [
                { offset: 0, color: '#B39DDB' },
                { offset: 1, color: '#7E57C2' },
              ],
            },
            verde: {
              type: 'linear',
              angle: 45,
              stops: [
                { offset: 0, color: '#81C784' },
                { offset: 1, color: '#2E7D32' },
              ],
            },
            laranja: {
              type: 'linear',
              angle: 45,
              stops: [
                { offset: 0, color: '#FFB74D' },
                { offset: 1, color: '#E65100' },
              ],
            },
          },
          default: '#9CA3AF',
        },
      },
      {
        type: 'text',
        name: 'iniciais',
        anchors: { centerX: true, centerY: true },
        text: { $field: 'initials', default: '?' },
        font: { size: 16, weight: 600 },
        color: WHITE,
      },
      {
        type: 'ellipse',
        name: 'presença',
        visible: { $field: 'online' },
        width: 12,
        height: 12,
        anchors: { right: 0, bottom: 0 },
        fill: '#2E7D32',
        stroke: { color: WHITE, width: 2, align: 'inside' },
      },
    ],
  },
};

export const APP_BAR: ComponentFile = {
  ...base,
  id: 'app-bar',
  name: 'Barra do app',
  description: 'Barra superior com voltar, título e ações.',
  size: { width: 390, height: 56 },
  minSize: { width: 200, height: 40 },
  preview: { title: 'Título da tela', back: 'sim', actions: 'sim' },
  template: {
    type: 'frame',
    name: 'barra',
    layout: { type: 'row', gap: 12, padding: [0, 16], align: 'center' },
    fill: BLUE,
    children: [
      {
        type: 'path',
        name: 'voltar',
        visible: { $field: 'back' },
        width: 24,
        height: 24,
        viewBox: [24, 24],
        d: 'M15 5L8 12L15 19',
        fill: 'none',
        stroke: { color: WHITE, width: 2, align: 'center' },
      },
      {
        type: 'text',
        name: 'título',
        width: 'fill',
        text: { $field: 'title', default: 'Título' },
        font: { size: 18, weight: 600 },
        color: WHITE,
      },
      {
        type: 'path',
        name: 'ações',
        visible: { $field: 'actions' },
        width: 24,
        height: 24,
        viewBox: [24, 24],
        d: 'M12 5A1.5 1.5 0 1 1 12 8A1.5 1.5 0 1 1 12 5ZM12 10.5A1.5 1.5 0 1 1 12 13.5A1.5 1.5 0 1 1 12 10.5ZM12 16A1.5 1.5 0 1 1 12 19A1.5 1.5 0 1 1 12 16Z',
        fill: WHITE,
      },
    ],
  },
};

export const SWITCH: ComponentFile = {
  ...base,
  id: 'switch',
  name: 'Interruptor',
  description: 'Ligado/desligado com rótulo.',
  size: { width: 200, height: 28 },
  minSize: { width: 48, height: 24 },
  preview: { label: 'Lembrar de mim', on: 'sim' },
  template: {
    type: 'frame',
    name: 'interruptor',
    layout: { type: 'row', gap: 12, align: 'center' },
    children: [
      {
        type: 'frame',
        name: 'trilho',
        width: 48,
        height: 28,
        layout: { type: 'none' },
        cornerRadius: 14,
        fill: { $if: { $field: 'on' }, then: BLUE, else: '#C4C9D4' },
        children: [
          {
            type: 'ellipse',
            name: 'botão desligado',
            visible: { $not: { $field: 'on' } },
            width: 22,
            height: 22,
            anchors: { left: 3, centerY: true },
            fill: WHITE,
          },
          {
            type: 'ellipse',
            name: 'botão ligado',
            visible: { $field: 'on' },
            width: 22,
            height: 22,
            anchors: { right: 3, centerY: true },
            fill: WHITE,
          },
        ],
      },
      {
        type: 'text',
        name: 'rótulo',
        visible: { $has: 'label' },
        width: 'fill',
        text: { $field: 'label' },
        font: { size: 14 },
        color: TEXT,
      },
    ],
  },
};

export const SAMPLE_COMPONENTS: readonly ComponentFile[] = [
  APP_BAR,
  AVATAR,
  BUTTON,
  CARD,
  SWITCH,
  TEXT_FIELD,
];

const yesNo = (key: string, label: string, def: 'sim' | 'não') => ({
  key,
  label,
  type: 'enum',
  options: ['sim', 'não'],
  default: def,
});

/**
 * Especialização de exemplo: `formatVersion` 4 (experimental) só pela chave `component` em cada
 * tipo. O resto segue `docs/SPEC-FORMAT.md`.
 */
export const SAMPLE_SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'lab-components',
  name: 'Laboratório de componentes',
  version: 1,
  description:
    'Componentes genéricos desenhados por template; cada um no próprio arquivo.',
  layers: [
    {
      id: 'componentes',
      name: 'Componentes',
      color: '#1E88E5',
      annotationTypes: [
        {
          id: 'app-bar',
          name: 'Barra do app',
          labelField: 'title',
          component: 'components/app-bar.json',
          fields: [
            { key: 'title', label: 'Título', type: 'string', required: true },
            yesNo('back', 'Botão voltar', 'sim'),
            yesNo('actions', 'Menu de ações', 'não'),
          ],
        },
        {
          id: 'avatar',
          name: 'Avatar',
          labelField: 'initials',
          component: 'components/avatar.json',
          fields: [
            { key: 'initials', label: 'Iniciais', type: 'string', required: true },
            {
              key: 'color',
              label: 'Cor',
              type: 'enum',
              options: ['azul', 'roxo', 'verde', 'laranja'],
              default: 'azul',
            },
            yesNo('online', 'Online', 'não'),
          ],
        },
        {
          id: 'button',
          name: 'Botão',
          labelField: 'label',
          component: 'components/button.json',
          fields: [
            { key: 'label', label: 'Rótulo', type: 'string', required: true },
            {
              key: 'variant',
              label: 'Variante',
              type: 'enum',
              options: ['primary', 'secondary', 'danger', 'ghost'],
              default: 'primary',
            },
            yesNo('icon', 'Ícone', 'não'),
            yesNo('disabled', 'Desabilitado', 'não'),
            {
              key: 'action',
              label: 'Ação',
              type: 'string',
              description: 'Só dado: não aparece no desenho.',
            },
          ],
        },
        {
          id: 'card',
          name: 'Cartão',
          labelField: 'title',
          component: 'components/card.json',
          fields: [
            { key: 'title', label: 'Título', type: 'string', required: true },
            { key: 'subtitle', label: 'Subtítulo', type: 'string' },
            yesNo('elevated', 'Elevado', 'sim'),
          ],
        },
        {
          id: 'switch',
          name: 'Interruptor',
          labelField: 'label',
          component: 'components/switch.json',
          fields: [
            { key: 'label', label: 'Rótulo', type: 'string' },
            yesNo('on', 'Ligado', 'não'),
          ],
        },
        {
          id: 'text-field',
          name: 'Campo de texto',
          labelField: 'label',
          component: 'components/text-field.json',
          fields: [
            { key: 'label', label: 'Rótulo', type: 'string', required: true },
            { key: 'placeholder', label: 'Dica', type: 'string' },
            { key: 'value', label: 'Valor', type: 'string' },
            {
              key: 'state',
              label: 'Estado',
              type: 'enum',
              options: ['normal', 'focus', 'error', 'disabled'],
              default: 'normal',
            },
            { key: 'help', label: 'Ajuda ou erro', type: 'string' },
          ],
        },
      ],
    },
  ],
};

/** Arquivos como ficariam na pasta: a especialização e um componente por arquivo. */
export const SAMPLE_FILES: readonly { readonly path: string; readonly text: string }[] = [
  { path: 'lab-components.spec.json', text: JSON.stringify(SAMPLE_SPEC, null, 2) },
  ...SAMPLE_COMPONENTS.map((c) => ({
    path: `components/${c.id}.json`,
    text: JSON.stringify(c, null, 2),
  })),
];

/** Tela de login montada só com instâncias: cada uma é um retângulo com valores de campos. */
export const SAMPLE_SCREEN: Screen = {
  id: 'login',
  name: 'Entrar',
  width: 390,
  height: 844,
  background: '#F6F7FB',
  instances: [
    {
      id: 'i-bar',
      typeId: 'app-bar',
      box: { x: 0, y: 0, width: 390, height: 56 },
      values: { title: 'Entrar', back: 'não', actions: 'sim' },
    },
    {
      id: 'i-avatar',
      typeId: 'avatar',
      box: { x: 155, y: 96, width: 80, height: 80 },
      values: { initials: 'MS', color: 'roxo', online: 'sim' },
    },
    {
      id: 'i-card',
      typeId: 'card',
      box: { x: 20, y: 208, width: 350, height: 372 },
      values: {
        title: 'Bem-vinda de volta',
        subtitle: 'Use seu e-mail e senha para continuar.',
        elevated: 'sim',
      },
    },
    {
      id: 'i-email',
      typeId: 'text-field',
      box: { x: 36, y: 292, width: 318, height: 66 },
      values: {
        label: 'E-mail',
        placeholder: 'nome@exemplo.com',
        value: 'maria@exemplo.com',
        state: 'normal',
        help: '',
      },
    },
    {
      id: 'i-password',
      typeId: 'text-field',
      box: { x: 36, y: 368, width: 318, height: 84 },
      values: {
        label: 'Senha',
        placeholder: '••••••••',
        value: '',
        state: 'error',
        help: 'Senha incorreta. Tente de novo.',
      },
    },
    {
      id: 'i-remember',
      typeId: 'switch',
      box: { x: 36, y: 462, width: 200, height: 28 },
      values: { label: 'Lembrar de mim', on: 'sim' },
    },
    {
      id: 'i-enter',
      typeId: 'button',
      box: { x: 36, y: 508, width: 318, height: 44 },
      values: { label: 'Entrar', variant: 'primary', icon: 'sim', disabled: 'não' },
    },
    {
      id: 'i-create',
      typeId: 'button',
      box: { x: 36, y: 612, width: 318, height: 44 },
      values: { label: 'Criar conta', variant: 'ghost', icon: 'não', disabled: 'não' },
    },
    {
      id: 'i-forgot',
      typeId: 'button',
      box: { x: 36, y: 664, width: 318, height: 44 },
      values: {
        label: 'Esqueci a senha',
        variant: 'secondary',
        icon: 'não',
        disabled: 'não',
      },
    },
  ],
};
