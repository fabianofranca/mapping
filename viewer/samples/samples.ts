/**
 * Built-in examples of the viewer demo: a specialization with six types, each one
 * pointing to its own component file, and a screen made only of instances (no
 * image). The same files can be downloaded as a folder (zip) to edit and reopen.
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

/** Button text color per variant. */
const buttonText: Expr<Color> = {
  $switch: 'variant',
  cases: { secondary: BLUE, ghost: BLUE },
  default: WHITE,
};

export const BUTTON: ComponentFile = {
  ...base,
  id: 'button',
  name: 'Button',
  description: 'Primary or secondary action; label and optional icon.',
  size: { width: 132, height: 44 },
  minSize: { width: 56, height: 32 },
  preview: { label: 'Sign in', variant: 'primary', icon: 'no', disabled: 'no' },
  template: {
    type: 'frame',
    name: 'button',
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
        name: 'icon',
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
        name: 'label',
        text: { $field: 'label', default: 'Button' },
        font: { size: 14, weight: 600 },
        color: buttonText,
      },
    ],
  },
};

export const TEXT_FIELD: ComponentFile = {
  ...base,
  id: 'text-field',
  name: 'Text field',
  description: 'Label, box with a value or hint, and help or error text.',
  size: { width: 280, height: 72 },
  minSize: { width: 120, height: 44 },
  preview: {
    label: 'Email',
    placeholder: 'name@example.com',
    value: '',
    state: 'normal',
    help: '',
  },
  template: {
    type: 'frame',
    name: 'field',
    layout: { type: 'column', gap: 6 },
    children: [
      {
        type: 'text',
        name: 'label',
        visible: { $has: 'label' },
        text: { $field: 'label' },
        font: { size: 12, weight: 600 },
        color: { $if: { $eq: ['state', 'error'] }, then: DANGER, else: TEXT },
      },
      {
        type: 'frame',
        name: 'box',
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
            name: 'value',
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
        name: 'help',
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
  name: 'Card',
  description: 'Surface with a title, a subtitle and a space for content.',
  size: { width: 320, height: 200 },
  minSize: { width: 160, height: 96 },
  preview: { title: 'Title', subtitle: 'Card subtitle', elevated: 'yes' },
  template: {
    type: 'frame',
    name: 'card',
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
        name: 'title',
        width: 'fill',
        text: { $field: 'title', default: 'Title' },
        font: { size: 18, weight: 600 },
        color: TEXT,
      },
      {
        type: 'text',
        name: 'subtitle',
        width: 'fill',
        visible: { $has: 'subtitle' },
        text: { $field: 'subtitle' },
        font: { size: 13 },
        color: MUTED,
      },
      {
        type: 'slot',
        name: 'content',
        width: 'fill',
        height: 'fill',
        label: 'content',
      },
    ],
  },
};

export const AVATAR: ComponentFile = {
  ...base,
  id: 'avatar',
  name: 'Avatar',
  description: 'Circle with initials and a presence indicator.',
  size: { width: 48, height: 48 },
  minSize: { width: 24, height: 24 },
  preview: { initials: 'MS', color: 'blue', online: 'yes' },
  template: {
    type: 'frame',
    name: 'avatar',
    clip: false,
    layout: { type: 'none' },
    children: [
      {
        type: 'ellipse',
        name: 'background',
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        fill: {
          $switch: 'color',
          cases: {
            blue: {
              type: 'linear',
              angle: 45,
              stops: [
                { offset: 0, color: '#5B9BFF' },
                { offset: 1, color: '#1A63CC' },
              ],
            },
            purple: {
              type: 'linear',
              angle: 45,
              stops: [
                { offset: 0, color: '#B39DDB' },
                { offset: 1, color: '#7E57C2' },
              ],
            },
            green: {
              type: 'linear',
              angle: 45,
              stops: [
                { offset: 0, color: '#81C784' },
                { offset: 1, color: '#2E7D32' },
              ],
            },
            orange: {
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
        name: 'initials',
        anchors: { centerX: true, centerY: true },
        text: { $field: 'initials', default: '?' },
        font: { size: 16, weight: 600 },
        color: WHITE,
      },
      {
        type: 'ellipse',
        name: 'presence',
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
  name: 'App bar',
  description: 'Top bar with back, title and actions.',
  size: { width: 390, height: 56 },
  minSize: { width: 200, height: 40 },
  preview: { title: 'Screen title', back: 'yes', actions: 'yes' },
  template: {
    type: 'frame',
    name: 'bar',
    layout: { type: 'row', gap: 12, padding: [0, 16], align: 'center' },
    fill: BLUE,
    children: [
      {
        type: 'path',
        name: 'back',
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
        name: 'title',
        width: 'fill',
        text: { $field: 'title', default: 'Title' },
        font: { size: 18, weight: 600 },
        color: WHITE,
      },
      {
        type: 'path',
        name: 'actions',
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
  name: 'Switch',
  description: 'On/off with a label.',
  size: { width: 200, height: 28 },
  minSize: { width: 48, height: 24 },
  preview: { label: 'Remember me', on: 'yes' },
  template: {
    type: 'frame',
    name: 'switch',
    layout: { type: 'row', gap: 12, align: 'center' },
    children: [
      {
        type: 'frame',
        name: 'track',
        width: 48,
        height: 28,
        layout: { type: 'none' },
        cornerRadius: 14,
        fill: { $if: { $field: 'on' }, then: BLUE, else: '#C4C9D4' },
        children: [
          {
            type: 'ellipse',
            name: 'button off',
            visible: { $not: { $field: 'on' } },
            width: 22,
            height: 22,
            anchors: { left: 3, centerY: true },
            fill: WHITE,
          },
          {
            type: 'ellipse',
            name: 'button on',
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
        name: 'label',
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

const yesNo = (key: string, label: string, def: 'yes' | 'no') => ({
  key,
  label,
  type: 'enum',
  options: ['yes', 'no'],
  default: def,
});

/**
 * Example specialization: `formatVersion` 4 (experimental) only through the `component` key in each
 * type. The rest follows `docs/SPEC-FORMAT.md`.
 */
export const SAMPLE_SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'lab-components',
  name: 'Component lab',
  version: 1,
  description: 'Generic components drawn from a template; each in its own file.',
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#1E88E5',
      annotationTypes: [
        {
          id: 'app-bar',
          name: 'App bar',
          labelField: 'title',
          component: 'components/app-bar.json',
          fields: [
            { key: 'title', label: 'Title', type: 'string', required: true },
            yesNo('back', 'Back button', 'yes'),
            yesNo('actions', 'Actions menu', 'no'),
          ],
        },
        {
          id: 'avatar',
          name: 'Avatar',
          labelField: 'initials',
          component: 'components/avatar.json',
          fields: [
            { key: 'initials', label: 'Initials', type: 'string', required: true },
            {
              key: 'color',
              label: 'Color',
              type: 'enum',
              options: ['blue', 'purple', 'green', 'orange'],
              default: 'blue',
            },
            yesNo('online', 'Online', 'no'),
          ],
        },
        {
          id: 'button',
          name: 'Button',
          labelField: 'label',
          component: 'components/button.json',
          fields: [
            { key: 'label', label: 'Label', type: 'string', required: true },
            {
              key: 'variant',
              label: 'Variant',
              type: 'enum',
              options: ['primary', 'secondary', 'danger', 'ghost'],
              default: 'primary',
            },
            yesNo('icon', 'Icon', 'no'),
            yesNo('disabled', 'Disabled', 'no'),
            {
              key: 'action',
              label: 'Action',
              type: 'string',
              description: 'Data only: does not appear in the drawing.',
            },
          ],
        },
        {
          id: 'card',
          name: 'Card',
          labelField: 'title',
          component: 'components/card.json',
          fields: [
            { key: 'title', label: 'Title', type: 'string', required: true },
            { key: 'subtitle', label: 'Subtitle', type: 'string' },
            yesNo('elevated', 'Elevated', 'yes'),
          ],
        },
        {
          id: 'switch',
          name: 'Switch',
          labelField: 'label',
          component: 'components/switch.json',
          fields: [
            { key: 'label', label: 'Label', type: 'string' },
            yesNo('on', 'On', 'no'),
          ],
        },
        {
          id: 'text-field',
          name: 'Text field',
          labelField: 'label',
          component: 'components/text-field.json',
          fields: [
            { key: 'label', label: 'Label', type: 'string', required: true },
            { key: 'placeholder', label: 'Hint', type: 'string' },
            { key: 'value', label: 'Value', type: 'string' },
            {
              key: 'state',
              label: 'State',
              type: 'enum',
              options: ['normal', 'focus', 'error', 'disabled'],
              default: 'normal',
            },
            { key: 'help', label: 'Help or error', type: 'string' },
          ],
        },
      ],
    },
  ],
};

/** Files as they would be in the folder: the specialization and one component per file. */
export const SAMPLE_FILES: readonly { readonly path: string; readonly text: string }[] = [
  { path: 'lab-components.spec.json', text: JSON.stringify(SAMPLE_SPEC, null, 2) },
  ...SAMPLE_COMPONENTS.map((c) => ({
    path: `components/${c.id}.json`,
    text: JSON.stringify(c, null, 2),
  })),
];

/** Login screen made only of instances: each one is a rectangle with field values. */
export const SAMPLE_SCREEN: Screen = {
  id: 'login',
  name: 'Sign in',
  width: 390,
  height: 844,
  background: '#F6F7FB',
  instances: [
    {
      id: 'i-bar',
      typeId: 'app-bar',
      box: { x: 0, y: 0, width: 390, height: 56 },
      values: { title: 'Sign in', back: 'no', actions: 'yes' },
    },
    {
      id: 'i-avatar',
      typeId: 'avatar',
      box: { x: 155, y: 96, width: 80, height: 80 },
      values: { initials: 'MS', color: 'purple', online: 'yes' },
    },
    {
      id: 'i-card',
      typeId: 'card',
      box: { x: 20, y: 208, width: 350, height: 372 },
      values: {
        title: 'Welcome back',
        subtitle: 'Use your email and password to continue.',
        elevated: 'yes',
      },
    },
    {
      id: 'i-email',
      typeId: 'text-field',
      box: { x: 36, y: 292, width: 318, height: 66 },
      values: {
        label: 'Email',
        placeholder: 'name@example.com',
        value: 'maria@example.com',
        state: 'normal',
        help: '',
      },
    },
    {
      id: 'i-password',
      typeId: 'text-field',
      box: { x: 36, y: 368, width: 318, height: 84 },
      values: {
        label: 'Password',
        placeholder: '••••••••',
        value: '',
        state: 'error',
        help: 'Wrong password. Try again.',
      },
    },
    {
      id: 'i-remember',
      typeId: 'switch',
      box: { x: 36, y: 462, width: 200, height: 28 },
      values: { label: 'Remember me', on: 'yes' },
    },
    {
      id: 'i-enter',
      typeId: 'button',
      box: { x: 36, y: 508, width: 318, height: 44 },
      values: { label: 'Sign in', variant: 'primary', icon: 'yes', disabled: 'no' },
    },
    {
      id: 'i-create',
      typeId: 'button',
      box: { x: 36, y: 612, width: 318, height: 44 },
      values: { label: 'Create account', variant: 'ghost', icon: 'no', disabled: 'no' },
    },
    {
      id: 'i-forgot',
      typeId: 'button',
      box: { x: 36, y: 664, width: 318, height: 44 },
      values: {
        label: 'Forgot password',
        variant: 'secondary',
        icon: 'no',
        disabled: 'no',
      },
    },
  ],
};
