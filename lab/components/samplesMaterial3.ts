/**
 * Design system público escrito no formato do laboratório: **Material Design 3** (baseline,
 * tema claro), a partir das especificações em m3.material.io e dos tokens padrão do Compose e
 * do Flutter. Serve para ver se o formato genérico representa um design system de verdade.
 *
 * Tokens (md.sys.color, tema claro baseline): primary #6750A4, on-primary #FFFFFF,
 * primary-container #EADDFF, on-primary-container #21005D, secondary-container #E8DEF8,
 * on-secondary-container #1D192B, surface #FEF7FF, surface-container #F3EDF7,
 * surface-container-low #F7F2FA, surface-container-highest #E6E0E9, on-surface #1D1B20,
 * on-surface-variant #49454F, outline #79747E, outline-variant #CAC4D0, error #B3261E.
 * Tipografia Roboto: title-large 22/28 400, title-medium 16/24 500, body-large 16/24 400,
 * body-medium 14/20 400, body-small 12/16 400, label-large 14/20 500, label-medium 12/16 500.
 * Formas: extra-small 4, small 8, medium 12, large 16, full.
 * Ícones: caminhos dos Material Icons (Apache 2.0), viewBox 24.
 */
import {
  COMPONENT_FORMAT,
  COMPONENT_FORMAT_VERSION,
  type ComponentFile,
  type Expr,
  type Color,
  type PathTemplate,
  type TextTemplate,
} from '../../src/model/components/componentFormat';
import type { Screen } from '../../src/model/components/screen';

const base = {
  format: COMPONENT_FORMAT,
  formatVersion: COMPONENT_FORMAT_VERSION,
} as const;

const C = {
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  secondaryContainer: '#E8DEF8',
  onSecondaryContainer: '#1D192B',
  surface: '#FEF7FF',
  surfaceContainer: '#F3EDF7',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainerHighest: '#E6E0E9',
  onSurface: '#1D1B20',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  error: '#B3261E',
  /** on-surface a 12 % (contêiner desabilitado) e a 38 % (conteúdo desabilitado). */
  disabledContainer: 'rgba(29, 27, 32, 0.12)',
  disabledContent: 'rgba(29, 27, 32, 0.38)',
  transparent: 'rgba(0, 0, 0, 0)',
  shadow: 'rgba(0, 0, 0, 0.3)',
} as const;

const FONT = 'Roboto';
const T = {
  titleLarge: { family: FONT, size: 22, weight: 400, lineHeight: 28 },
  titleMedium: { family: FONT, size: 16, weight: 500, lineHeight: 24 },
  bodyLarge: { family: FONT, size: 16, weight: 400, lineHeight: 24 },
  bodyMedium: { family: FONT, size: 14, weight: 400, lineHeight: 20 },
  bodySmall: { family: FONT, size: 12, weight: 400, lineHeight: 16 },
  labelLarge: { family: FONT, size: 14, weight: 500, lineHeight: 20 },
  labelMedium: { family: FONT, size: 12, weight: 500, lineHeight: 16 },
} as const;

/** Material Icons (Apache 2.0), viewBox 24. */
export const ICONS: Readonly<Record<string, string>> = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  search:
    'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  person:
    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  menu: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  favorite:
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  notifications:
    'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  chevron: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  settings:
    'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
};
export const ICON_NAMES = Object.keys(ICONS);

/** Ícone por campo: o `d` do caminho sai de um `$switch` sobre o nome do ícone. */
function icon(
  field: string,
  size: number,
  color: Expr<Color>,
  extra: Partial<PathTemplate> = {},
): PathTemplate {
  return {
    type: 'path',
    name: 'ícone',
    width: size,
    height: size,
    viewBox: [24, 24],
    d: { $switch: field, cases: { ...ICONS }, default: ICONS.more ?? '' },
    fill: color,
    ...extra,
  };
}

function text(
  name: string,
  value: Expr<string | number>,
  style: (typeof T)[keyof typeof T],
  color: Expr<Color>,
  extra: Partial<TextTemplate> = {},
): TextTemplate {
  return { type: 'text', name, text: value, font: { ...style }, color, ...extra };
}

// ---------------------------------------------------------------------------------------

const buttonLabelColor: Expr<Color> = {
  $if: { $field: 'disabled' },
  then: C.disabledContent,
  else: {
    $switch: 'variant',
    cases: { filled: C.onPrimary, tonal: C.onSecondaryContainer },
    default: C.primary,
  },
};

export const M3_BUTTON: ComponentFile = {
  ...base,
  id: 'm3-button',
  name: 'Button',
  description:
    'Common button: filled, tonal, outlined, text ou elevated; 40 dp, forma full.',
  size: { width: 120, height: 40 },
  minSize: { width: 48, height: 40 },
  sizing: { width: 'hug', height: 40 },
  preview: { label: 'Label', variant: 'filled', icon: '', disabled: 'não' },
  template: {
    type: 'frame',
    name: 'button',
    layout: { type: 'row', gap: 8, padding: [0, 24], align: 'center', justify: 'center' },
    cornerRadius: 20,
    fill: {
      $if: { $field: 'disabled' },
      then: {
        $switch: 'variant',
        cases: { outlined: C.transparent, text: C.transparent },
        default: C.disabledContainer,
      },
      else: {
        $switch: 'variant',
        cases: {
          filled: C.primary,
          tonal: C.secondaryContainer,
          elevated: C.surfaceContainerLow,
        },
        default: C.transparent,
      },
    },
    stroke: {
      color: {
        $if: { $eq: ['variant', 'outlined'] },
        then: { $if: { $field: 'disabled' }, then: C.disabledContainer, else: C.outline },
        else: C.transparent,
      },
      width: 1,
    },
    shadow: {
      color: {
        $if: {
          $and: [{ $eq: ['variant', 'elevated'] }, { $not: { $field: 'disabled' } }],
        },
        then: C.shadow,
        else: C.transparent,
      },
      y: 1,
      blur: 3,
    },
    children: [
      icon('icon', 18, buttonLabelColor, { visible: { $has: 'icon' } }),
      text(
        'label',
        { $field: 'label', default: 'Label' },
        T.labelLarge,
        buttonLabelColor,
      ),
    ],
  },
};

export const M3_FAB: ComponentFile = {
  ...base,
  id: 'm3-fab',
  name: 'FAB',
  description:
    'Floating action button: 56 dp, forma large (16), primary container; extended com rótulo.',
  size: { width: 56, height: 56 },
  minSize: { width: 40, height: 40 },
  sizing: { width: 56, height: 56 },
  preview: { icon: 'add', label: '', color: 'primary' },
  template: {
    type: 'frame',
    name: 'fab',
    layout: {
      type: 'row',
      gap: 12,
      padding: [0, 16],
      align: 'center',
      justify: 'center',
    },
    cornerRadius: 16,
    fill: {
      $switch: 'color',
      cases: { secondary: C.secondaryContainer, surface: C.surfaceContainerLow },
      default: C.primaryContainer,
    },
    shadow: { color: C.shadow, y: 2, blur: 6 },
    children: [
      icon('icon', 24, {
        $switch: 'color',
        cases: { secondary: C.onSecondaryContainer, surface: C.primary },
        default: C.onPrimaryContainer,
      }),
      text('label', { $field: 'label' }, T.labelLarge, C.onPrimaryContainer, {
        visible: { $has: 'label' },
      }),
    ],
  },
};

export const M3_TOP_APP_BAR: ComponentFile = {
  ...base,
  id: 'm3-top-app-bar',
  name: 'Top app bar',
  description:
    'Small top app bar: 64 dp, surface, ícone de navegação, título title-large e ação.',
  size: { width: 412, height: 64 },
  minSize: { width: 200, height: 48 },
  sizing: { width: 'fill', height: 64 },
  preview: { title: 'Title', navigation: 'menu', action: 'more', align: 'start' },
  template: {
    type: 'frame',
    name: 'top app bar',
    layout: { type: 'row', gap: 4, padding: [0, 4], align: 'center' },
    fill: C.surface,
    children: [
      {
        type: 'frame',
        name: 'navegação',
        width: 48,
        height: 48,
        visible: { $has: 'navigation' },
        layout: { type: 'row', align: 'center', justify: 'center' },
        children: [icon('navigation', 24, C.onSurface)],
      },
      {
        type: 'frame',
        name: 'título',
        width: 'fill',
        height: 'fill',
        layout: { type: 'row', padding: [0, 12], align: 'center' },
        children: [
          text(
            'título',
            { $field: 'title', default: 'Title' },
            T.titleLarge,
            C.onSurface,
            {
              width: 'fill',
              font: {
                ...T.titleLarge,
                align: {
                  $if: { $eq: ['align', 'center'] },
                  then: 'center',
                  else: 'left',
                },
              },
            },
          ),
        ],
      },
      {
        type: 'frame',
        name: 'ação',
        width: 48,
        height: 48,
        visible: { $has: 'action' },
        layout: { type: 'row', align: 'center', justify: 'center' },
        children: [icon('action', 24, C.onSurfaceVariant)],
      },
    ],
  },
};

const fieldStroke: Expr<Color> = {
  $switch: 'state',
  cases: { focused: C.primary, error: C.error, disabled: C.disabledContainer },
  default: C.outline,
};
const fieldLabelColor: Expr<Color> = {
  $switch: 'state',
  cases: { focused: C.primary, error: C.error, disabled: C.disabledContent },
  default: C.onSurfaceVariant,
};

export const M3_TEXT_FIELD: ComponentFile = {
  ...base,
  id: 'm3-text-field',
  name: 'Text field',
  description:
    'Outlined text field: caixa de 56 dp, forma extra-small (4), rótulo flutuante e texto de apoio.',
  size: { width: 280, height: 80 },
  minSize: { width: 120, height: 56 },
  sizing: { width: 'fill', height: 56 },
  preview: {
    label: 'Label',
    value: 'Input text',
    placeholder: '',
    supporting: 'Supporting text',
    state: 'enabled',
    trailing: '',
  },
  template: {
    type: 'frame',
    name: 'text field',
    clip: false,
    layout: { type: 'column', gap: 4 },
    children: [
      {
        type: 'frame',
        name: 'contêiner',
        width: 'fill',
        height: 56,
        clip: false,
        layout: { type: 'none' },
        children: [
          {
            type: 'rect',
            name: 'outline',
            anchors: { left: 0, right: 0, top: 8, bottom: 0 },
            cornerRadius: 4,
            fill: C.transparent,
            stroke: {
              color: fieldStroke,
              width: { $if: { $eq: ['state', 'focused'] }, then: 2, else: 1 },
              align: 'inside',
            },
          },
          {
            type: 'frame',
            name: 'rótulo',
            anchors: { left: 12, top: 0 },
            width: 'hug',
            height: 'hug',
            layout: { type: 'row', padding: [0, 4] },
            fill: C.surface,
            visible: { $has: 'label' },
            children: [text('rótulo', { $field: 'label' }, T.bodySmall, fieldLabelColor)],
          },
          {
            type: 'frame',
            name: 'conteúdo',
            anchors: { left: 16, right: 12, top: 8, bottom: 0 },
            layout: { type: 'row', gap: 12, align: 'center' },
            children: [
              text(
                'texto',
                {
                  $if: { $has: 'value' },
                  then: { $field: 'value' },
                  else: { $field: 'placeholder', default: '' },
                },
                T.bodyLarge,
                {
                  $if: { $eq: ['state', 'disabled'] },
                  then: C.disabledContent,
                  else: {
                    $if: { $has: 'value' },
                    then: C.onSurface,
                    else: C.onSurfaceVariant,
                  },
                },
                { width: 'fill' },
              ),
              icon('trailing', 24, C.onSurfaceVariant, { visible: { $has: 'trailing' } }),
            ],
          },
        ],
      },
      text(
        'apoio',
        { $field: 'supporting' },
        T.bodySmall,
        { $if: { $eq: ['state', 'error'] }, then: C.error, else: C.onSurfaceVariant },
        { visible: { $has: 'supporting' }, width: 'fill' },
      ),
    ],
  },
};

export const M3_SWITCH: ComponentFile = {
  ...base,
  id: 'm3-switch',
  name: 'Switch',
  description:
    'Switch: trilho 52 × 32, alça 24 (ligado) ou 16 (desligado); rótulo opcional.',
  size: { width: 200, height: 32 },
  minSize: { width: 52, height: 32 },
  sizing: { width: 'fill', height: 32 },
  preview: { label: 'Label', selected: 'sim', icon: 'não' },
  template: {
    type: 'frame',
    name: 'switch',
    layout: { type: 'row', gap: 16, align: 'center' },
    children: [
      text('rótulo', { $field: 'label' }, T.bodyLarge, C.onSurface, {
        visible: { $has: 'label' },
        width: 'fill',
      }),
      {
        type: 'frame',
        name: 'trilho',
        width: 52,
        height: 32,
        layout: { type: 'none' },
        cornerRadius: 16,
        fill: {
          $if: { $field: 'selected' },
          then: C.primary,
          else: C.surfaceContainerHighest,
        },
        stroke: {
          color: { $if: { $field: 'selected' }, then: C.transparent, else: C.outline },
          width: 2,
          align: 'inside',
        },
        children: [
          {
            type: 'ellipse',
            name: 'alça ligada',
            visible: { $field: 'selected' },
            width: 24,
            height: 24,
            anchors: { right: 4, centerY: true },
            fill: C.onPrimary,
          },
          {
            type: 'ellipse',
            name: 'alça desligada',
            visible: { $not: { $field: 'selected' } },
            width: 16,
            height: 16,
            anchors: { left: 8, centerY: true },
            fill: C.outline,
          },
          {
            type: 'frame',
            name: 'ícone',
            visible: { $and: [{ $field: 'selected' }, { $field: 'icon' }] },
            width: 24,
            height: 24,
            anchors: { right: 4, centerY: true },
            layout: { type: 'row', align: 'center', justify: 'center' },
            children: [
              {
                type: 'path',
                name: 'check',
                width: 16,
                height: 16,
                viewBox: [24, 24],
                d: ICONS.check ?? '',
                fill: C.onPrimaryContainer,
              },
            ],
          },
        ],
      },
    ],
  },
};

export const M3_CHECKBOX: ComponentFile = {
  ...base,
  id: 'm3-checkbox',
  name: 'Checkbox',
  description: 'Checkbox de 18 dp (forma 2) com rótulo body-large.',
  size: { width: 200, height: 40 },
  minSize: { width: 40, height: 24 },
  sizing: { width: 'fill', height: 40 },
  preview: { label: 'Label', checked: 'sim', error: 'não' },
  template: {
    type: 'frame',
    name: 'checkbox',
    layout: { type: 'row', gap: 12, align: 'center' },
    children: [
      {
        type: 'frame',
        name: 'caixa',
        width: 18,
        height: 18,
        layout: { type: 'row', align: 'center', justify: 'center' },
        cornerRadius: 2,
        fill: {
          $if: { $field: 'checked' },
          then: { $if: { $field: 'error' }, then: C.error, else: C.primary },
          else: C.transparent,
        },
        stroke: {
          color: {
            $if: { $field: 'checked' },
            then: C.transparent,
            else: { $if: { $field: 'error' }, then: C.error, else: C.onSurfaceVariant },
          },
          width: 2,
          align: 'inside',
        },
        children: [
          {
            type: 'path',
            name: 'check',
            visible: { $field: 'checked' },
            width: 14,
            height: 14,
            viewBox: [24, 24],
            d: ICONS.check ?? '',
            fill: C.onPrimary,
          },
        ],
      },
      text('rótulo', { $field: 'label' }, T.bodyLarge, C.onSurface, {
        visible: { $has: 'label' },
        width: 'fill',
      }),
    ],
  },
};

export const M3_CHIP: ComponentFile = {
  ...base,
  id: 'm3-chip',
  name: 'Chip',
  description:
    'Assist/filter chip: 32 dp, forma small (8), outline; filtro selecionado em secondary container com check.',
  size: { width: 96, height: 32 },
  minSize: { width: 40, height: 32 },
  sizing: { width: 'hug', height: 32 },
  preview: { label: 'Label', selected: 'não', icon: '' },
  template: {
    type: 'frame',
    name: 'chip',
    layout: { type: 'row', gap: 8, padding: [0, 16], align: 'center', justify: 'center' },
    cornerRadius: 8,
    fill: {
      $if: { $field: 'selected' },
      then: C.secondaryContainer,
      else: C.transparent,
    },
    stroke: {
      color: { $if: { $field: 'selected' }, then: C.transparent, else: C.outline },
      width: 1,
      align: 'inside',
    },
    children: [
      {
        type: 'path',
        name: 'check',
        visible: { $field: 'selected' },
        width: 18,
        height: 18,
        viewBox: [24, 24],
        d: ICONS.check ?? '',
        fill: C.onSecondaryContainer,
      },
      icon('icon', 18, C.primary, {
        visible: { $and: [{ $has: 'icon' }, { $not: { $field: 'selected' } }] },
      }),
      text('rótulo', { $field: 'label', default: 'Label' }, T.labelLarge, {
        $if: { $field: 'selected' },
        then: C.onSecondaryContainer,
        else: C.onSurfaceVariant,
      }),
    ],
  },
};

export const M3_CARD: ComponentFile = {
  ...base,
  id: 'm3-card',
  name: 'Card',
  description:
    'Card elevated, filled ou outlined; forma medium (12); headline, subhead, texto de apoio e espaço para ações.',
  size: { width: 360, height: 200 },
  minSize: { width: 160, height: 96 },
  sizing: { width: 'fill', height: 'hug' },
  preview: {
    headline: 'Headline',
    subhead: 'Subhead',
    body: 'Explain more about the topic shown in the headline and subhead through supporting text.',
    variant: 'elevated',
  },
  template: {
    type: 'frame',
    name: 'card',
    layout: { type: 'column', gap: 8, padding: 16 },
    cornerRadius: 12,
    fill: {
      $switch: 'variant',
      cases: { filled: C.surfaceContainerHighest, outlined: C.surface },
      default: C.surfaceContainerLow,
    },
    stroke: {
      color: {
        $if: { $eq: ['variant', 'outlined'] },
        then: C.outlineVariant,
        else: C.transparent,
      },
      width: 1,
      align: 'inside',
    },
    shadow: {
      color: {
        $if: { $eq: ['variant', 'elevated'] },
        then: C.shadow,
        else: C.transparent,
      },
      y: 1,
      blur: 3,
    },
    children: [
      text(
        'headline',
        { $field: 'headline', default: 'Headline' },
        T.titleMedium,
        C.onSurface,
        { width: 'fill' },
      ),
      text('subhead', { $field: 'subhead' }, T.bodyMedium, C.onSurfaceVariant, {
        visible: { $has: 'subhead' },
        width: 'fill',
      }),
      text('apoio', { $field: 'body' }, T.bodyMedium, C.onSurfaceVariant, {
        visible: { $has: 'body' },
        width: 'fill',
      }),
      {
        type: 'slot',
        name: 'ações',
        width: 'fill',
        height: 'fill',
        label: 'ações',
        layout: { type: 'row', gap: 8, justify: 'end' },
      },
    ],
  },
};

export const M3_LIST_ITEM: ComponentFile = {
  ...base,
  id: 'm3-list-item',
  name: 'List item',
  description:
    'Item de lista de uma ou duas linhas: avatar ou ícone à esquerda, headline, texto de apoio e ícone à direita.',
  size: { width: 412, height: 72 },
  minSize: { width: 120, height: 48 },
  sizing: { width: 'fill', height: 72 },
  preview: {
    headline: 'Headline',
    supporting: 'Supporting text',
    leading: 'person',
    initials: '',
    trailing: 'chevron',
  },
  template: {
    type: 'frame',
    name: 'list item',
    layout: { type: 'row', gap: 16, padding: [8, 16, 8, 16], align: 'center' },
    fill: C.surface,
    children: [
      {
        type: 'frame',
        name: 'avatar',
        visible: { $has: 'initials' },
        width: 40,
        height: 40,
        layout: { type: 'row', align: 'center', justify: 'center' },
        cornerRadius: 20,
        fill: C.primaryContainer,
        children: [
          text('iniciais', { $field: 'initials' }, T.titleMedium, C.onPrimaryContainer),
        ],
      },
      icon('leading', 24, C.onSurfaceVariant, {
        visible: { $and: [{ $has: 'leading' }, { $not: { $has: 'initials' } }] },
      }),
      {
        type: 'frame',
        name: 'textos',
        width: 'fill',
        height: 'hug',
        layout: { type: 'column', gap: 0 },
        children: [
          text(
            'headline',
            { $field: 'headline', default: 'Headline' },
            T.bodyLarge,
            C.onSurface,
            { width: 'fill' },
          ),
          text('apoio', { $field: 'supporting' }, T.bodyMedium, C.onSurfaceVariant, {
            visible: { $has: 'supporting' },
            width: 'fill',
          }),
        ],
      },
      icon('trailing', 24, C.onSurfaceVariant, { visible: { $has: 'trailing' } }),
    ],
  },
};

function destination(n: 1 | 2 | 3) {
  return {
    type: 'frame' as const,
    name: `destino ${n}`,
    width: 'fill' as const,
    height: 'fill' as const,
    layout: {
      type: 'column' as const,
      gap: 4,
      padding: [12, 0, 16, 0] as const,
      align: 'center' as const,
    },
    children: [
      {
        type: 'frame' as const,
        name: 'indicador',
        width: 64,
        height: 32,
        layout: {
          type: 'row' as const,
          align: 'center' as const,
          justify: 'center' as const,
        },
        cornerRadius: 16,
        fill: {
          $if: { $eq: ['active', n] },
          then: C.secondaryContainer,
          else: C.transparent,
        } as Expr<Color>,
        children: [
          icon(`icon${n}`, 24, {
            $if: { $eq: ['active', n] },
            then: C.onSecondaryContainer,
            else: C.onSurfaceVariant,
          }),
        ],
      },
      text('rótulo', { $field: `label${n}`, default: `Label ${n}` }, T.labelMedium, {
        $if: { $eq: ['active', n] },
        then: C.onSurface,
        else: C.onSurfaceVariant,
      }),
    ],
  };
}

export const M3_NAVIGATION_BAR: ComponentFile = {
  ...base,
  id: 'm3-navigation-bar',
  name: 'Navigation bar',
  description:
    'Navigation bar de 80 dp com três destinos; indicador ativo 64 × 32 em secondary container.',
  size: { width: 412, height: 80 },
  minSize: { width: 240, height: 64 },
  sizing: { width: 'fill', height: 80 },
  preview: {
    label1: 'Home',
    icon1: 'home',
    label2: 'Search',
    icon2: 'search',
    label3: 'Profile',
    icon3: 'person',
    active: '1',
  },
  template: {
    type: 'frame',
    name: 'navigation bar',
    layout: { type: 'row', padding: [0, 8] },
    fill: C.surfaceContainer,
    children: [destination(1), destination(2), destination(3)],
  },
};

function sheetItem(n: 1 | 2 | 3) {
  return {
    type: 'frame' as const,
    name: `item ${n}`,
    width: 'fill' as const,
    height: 56,
    visible: { $has: `item${n}` },
    layout: {
      type: 'row' as const,
      gap: 16,
      padding: [0, 24] as const,
      align: 'center' as const,
    },
    children: [
      icon(`icon${n}`, 24, C.onSurfaceVariant, { visible: { $has: `icon${n}` } }),
      text(`rótulo ${n}`, { $field: `item${n}` }, T.bodyLarge, C.onSurface, {
        width: 'fill',
      }),
    ],
  };
}

export const M3_BOTTOM_SHEET: ComponentFile = {
  ...base,
  id: 'm3-bottom-sheet',
  name: 'Bottom sheet',
  description:
    'Modal bottom sheet: surface-container-low, cantos superiores extra-large (28), alça de 32 × 4 a 22 dp do topo, título e itens de lista.',
  size: { width: 412, height: 320 },
  minSize: { width: 240, height: 96 },
  sizing: { width: 'fill', height: 'hug' },
  preview: {
    title: 'Title',
    handle: 'sim',
    item1: 'Item one',
    icon1: 'favorite',
    item2: 'Item two',
    icon2: 'edit',
    item3: 'Item three',
    icon3: 'settings',
  },
  template: {
    type: 'frame',
    name: 'bottom sheet',
    layout: { type: 'column', gap: 0, padding: [0, 0, 16, 0] },
    cornerRadius: [28, 28, 0, 0],
    fill: C.surfaceContainerLow,
    shadow: { color: C.shadow, y: -1, blur: 3 },
    children: [
      {
        type: 'frame',
        name: 'área da alça',
        width: 'fill',
        height: 48,
        layout: { type: 'row', align: 'center', justify: 'center' },
        children: [
          {
            type: 'rect',
            name: 'alça',
            visible: { $field: 'handle' },
            width: 32,
            height: 4,
            cornerRadius: 2,
            fill: 'rgba(73, 69, 79, 0.4)',
          },
        ],
      },
      {
        type: 'frame',
        name: 'cabeçalho',
        width: 'fill',
        height: 'hug',
        visible: { $has: 'title' },
        layout: { type: 'row', padding: [8, 24, 16, 24] },
        children: [
          text('título', { $field: 'title' }, T.titleLarge, C.onSurface, {
            width: 'fill',
          }),
        ],
      },
      sheetItem(1),
      sheetItem(2),
      sheetItem(3),
    ],
  },
};

export const M3_SCRIM: ComponentFile = {
  ...base,
  id: 'm3-scrim',
  name: 'Scrim',
  description:
    'Película que escurece a tela atrás de um modal: scrim (#000) a 32 %. Cobre a tela inteira, por baixo da folha.',
  size: { width: 412, height: 917 },
  minSize: { width: 16, height: 16 },
  sizing: { width: 'fill', height: 'fill' },
  preview: {},
  template: {
    type: 'frame',
    name: 'scrim',
    layout: { type: 'none' },
    fill: 'rgba(0, 0, 0, 0.32)',
  },
};

/** Preenchimento e forma dos containers do Compose (Box, Row, Column), por campo. */
const containerFill: Expr<Color> = {
  $switch: 'background',
  cases: {
    surface: C.surface,
    'surface-container': C.surfaceContainer,
    'primary-container': C.primaryContainer,
    'secondary-container': C.secondaryContainer,
  },
  default: C.transparent,
};
const containerRadius: Expr<number> = {
  $switch: 'shape',
  cases: { small: 8, medium: 12, large: 16, 'extra-large': 28 },
  default: 0,
};

function container(
  id: string,
  name: string,
  description: string,
  layout: { type: 'none' } | { type: 'row' | 'column' },
  preview: Record<string, string | number>,
  size: { width: number; height: number },
): ComponentFile {
  const slotLayout =
    layout.type === 'none'
      ? { type: 'none' as const }
      : {
          type: layout.type,
          gap: { $field: 'spacing', default: 8 } as Expr<number>,
          padding: { $field: 'padding', default: 0 } as Expr<number>,
          // Compose: Arrangement no eixo principal, Alignment no cruzado.
          align: 'start' as const,
          justify: 'start' as const,
        };
  return {
    ...base,
    id,
    name,
    description,
    size,
    minSize: { width: 24, height: 24 },
    sizing: { width: 'fill', height: 'hug' },
    preview,
    template: {
      type: 'frame',
      name: id,
      clip: false,
      layout: { type: 'none' },
      fill: containerFill,
      cornerRadius: containerRadius,
      children: [
        {
          type: 'slot',
          name: 'content',
          label: name,
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          layout: slotLayout,
        },
      ],
    },
  };
}

export const M3_BOX = container(
  'm3-box',
  'Box',
  'Container livre do Compose: os filhos ficam onde o retângulo deles diz.',
  { type: 'none' },
  { background: 'none', shape: 'none', padding: 0 },
  { width: 200, height: 120 },
);

export const M3_ROW = container(
  'm3-row',
  'Row',
  'Container horizontal do Compose: os filhos se enfileiram pela ordem, com spacing e padding.',
  { type: 'row' },
  {
    background: 'none',
    shape: 'none',
    spacing: 8,
    padding: 0,
    alignment: 'top',
    arrangement: 'start',
  },
  { width: 380, height: 48 },
);

export const M3_COLUMN = container(
  'm3-column',
  'Column',
  'Container vertical do Compose: os filhos se empilham pela ordem, com spacing e padding.',
  { type: 'column' },
  {
    background: 'none',
    shape: 'none',
    spacing: 8,
    padding: 0,
    alignment: 'start',
    arrangement: 'start',
  },
  { width: 380, height: 200 },
);

export const M3_COMPONENTS: readonly ComponentFile[] = [
  M3_TOP_APP_BAR,
  M3_BUTTON,
  M3_FAB,
  M3_TEXT_FIELD,
  M3_SWITCH,
  M3_CHECKBOX,
  M3_CHIP,
  M3_CARD,
  M3_LIST_ITEM,
  M3_NAVIGATION_BAR,
  M3_BOTTOM_SHEET,
  M3_SCRIM,
  M3_BOX,
  M3_ROW,
  M3_COLUMN,
];

/** Sistema da origem executável que a especialização declara (`origins`): o SDUI do backend. */
const SDUI = 'sdui';

/** `sources` de um campo: o caminho dentro de `props` do nó SDUI (e a tradução de valores). */
const fromProp = (name: string, values?: Record<string, string>) => ({
  sources: [{ system: SDUI, name, ...(values ? { values } : {}) }],
});

const yesNo = (key: string, label: string, def: 'sim' | 'não', prop?: string) => ({
  key,
  label,
  type: 'enum',
  options: ['sim', 'não'],
  default: def,
  ...(prop ? fromProp(prop) : {}),
});
const iconField = (key: string, label: string, def = '', prop?: string) => ({
  key,
  label,
  type: 'enum',
  options: ICON_NAMES,
  ...(def ? { default: def } : {}),
  ...(prop ? fromProp(prop) : {}),
});
const str = (key: string, label: string, required = false, prop?: string) => ({
  key,
  label,
  type: 'string',
  required,
  ...(prop ? fromProp(prop) : {}),
});
const num = (key: string, label: string, def: number, prop: string) => ({
  key,
  label,
  type: 'number',
  default: def,
  ...fromProp(prop),
});
const choice = (
  key: string,
  label: string,
  options: string[],
  def: string,
  prop: string,
) => ({ key, label, type: 'enum', options, default: def, ...fromProp(prop) });

/** `external`: o tipo do nó SDUI a que o tipo corresponde (e o slot, e as props aceitas e não desenhadas). */
const type = (
  id: string,
  name: string,
  labelField: string | null,
  fields: object[],
  external?: { name: string; slot?: string; ignore?: string[] },
) => ({
  id,
  name,
  labelField,
  component: `components/${id}.json`,
  ...(external
    ? {
        sources: [
          {
            system: SDUI,
            name: external.name,
            ...(external.slot ? { slot: external.slot } : {}),
            ...(external.ignore ? { ignore: external.ignore } : {}),
          },
        ],
      }
    : {}),
  fields,
});

const BACKGROUNDS = [
  'none',
  'surface',
  'surface-container',
  'primary-container',
  'secondary-container',
];
const SHAPES = ['none', 'small', 'medium', 'large', 'extra-large'];

/** Campos de fundo e forma dos containers (Box, Row, Column). */
const containerStyle = () => [
  choice('background', 'Background', BACKGROUNDS, 'none', 'background'),
  choice('shape', 'Shape', SHAPES, 'none', 'shape'),
];

export const M3_SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'material3',
  name: 'Material Design 3 (baseline)',
  version: 1,
  description:
    'Componentes do Material 3, tema claro baseline, escritos no formato de componente do laboratório.',
  // Fontes do DS, por arquivo na pasta (`material3/fonts/`): Roboto (Apache 2.0) nos pesos que o
  // M3 usa aqui. Uma fonte variável serviria com `"weight": "100 900"`.
  fonts: [
    { family: 'Roboto', file: 'fonts/Roboto-Regular.ttf', weight: 400 },
    { family: 'Roboto', file: 'fonts/Roboto-Medium.ttf', weight: 500 },
  ],
  // Origem executável: como ler o JSON do SDUI (`sdui/settings.sdui.json`) como tela. O
  // mapeamento de cada tipo e de cada campo está nas `sources` abaixo (sistema `sdui`).
  origins: [
    {
      system: SDUI,
      name: 'SDUI do backend',
      node: { type: 'type', props: 'props', children: 'children' },
      screen: {
        id: { path: 'screen.id' },
        name: { path: 'screen.title', default: 'Tela' },
        width: { path: 'screen.device.width' },
        height: { path: 'screen.device.height' },
        background: {
          path: 'screen.background',
          values: { surface: C.surface },
          default: '#FFFFFF',
        },
        roots: [
          { path: 'content' },
          { path: 'bottomBar', anchor: 'bottom' },
          {
            path: 'floating[*]',
            anchor: { path: 'anchor' },
            margin: { path: 'margin' },
          },
          { path: 'modal', anchor: 'bottom', scrim: 'm3-scrim' },
        ],
      },
      booleans: { true: 'sim', false: 'não' },
    },
  ],
  layers: [
    {
      id: 'componentes',
      name: 'Componentes',
      color: '#6750A4',
      annotationTypes: [
        type(
          'm3-top-app-bar',
          'Top app bar',
          'title',
          [
            str('title', 'Title', true, 'title'),
            iconField('navigation', 'Navigation icon', 'menu', 'navigationIcon'),
            iconField('action', 'Action icon', 'more', 'actionIcon'),
            choice('align', 'Title align', ['start', 'center'], 'start', 'titleAlign'),
          ],
          { name: 'TopAppBar' },
        ),
        type(
          'm3-button',
          'Button',
          'label',
          [
            str('label', 'Label', true, 'text'),
            choice(
              'variant',
              'Variant',
              ['filled', 'tonal', 'outlined', 'text', 'elevated'],
              'filled',
              'style',
            ),
            iconField('icon', 'Icon', '', 'icon'),
            yesNo('disabled', 'Disabled', 'não', 'disabled'),
          ],
          { name: 'Button', ignore: ['contentDescription'] },
        ),
        type(
          'm3-fab',
          'FAB',
          'label',
          [
            iconField('icon', 'Icon', 'add', 'icon'),
            str('label', 'Label (extended)', false, 'label'),
            choice(
              'color',
              'Color',
              ['primary', 'secondary', 'surface'],
              'primary',
              'color',
            ),
          ],
          { name: 'FAB' },
        ),
        type(
          'm3-text-field',
          'Text field',
          'label',
          [
            str('label', 'Label', true, 'label'),
            str('value', 'Input text', false, 'value'),
            str('placeholder', 'Placeholder', false, 'placeholder'),
            str('supporting', 'Supporting text', false, 'supportingText'),
            choice(
              'state',
              'State',
              ['enabled', 'focused', 'error', 'disabled'],
              'enabled',
              'state',
            ),
            iconField('trailing', 'Trailing icon', '', 'trailingIcon'),
          ],
          { name: 'TextField' },
        ),
        type(
          'm3-switch',
          'Switch',
          'label',
          [
            str('label', 'Label', false, 'label'),
            yesNo('selected', 'Selected', 'não', 'checked'),
            yesNo('icon', 'Icon', 'não', 'showIcon'),
          ],
          { name: 'Switch' },
        ),
        type(
          'm3-checkbox',
          'Checkbox',
          'label',
          [
            str('label', 'Label', false, 'label'),
            yesNo('checked', 'Checked', 'não', 'checked'),
            yesNo('error', 'Error', 'não', 'error'),
          ],
          { name: 'Checkbox' },
        ),
        type(
          'm3-chip',
          'Chip',
          'label',
          [
            str('label', 'Label', true, 'text'),
            yesNo('selected', 'Selected', 'não', 'selected'),
            iconField('icon', 'Icon', '', 'icon'),
          ],
          { name: 'Chip' },
        ),
        type(
          'm3-card',
          'Card',
          'headline',
          [
            str('headline', 'Headline', true, 'headline'),
            str('subhead', 'Subhead', false, 'subhead'),
            str('body', 'Supporting text', false, 'body'),
            choice(
              'variant',
              'Variant',
              ['elevated', 'filled', 'outlined'],
              'elevated',
              'style',
            ),
          ],
          { name: 'Card', slot: 'ações' },
        ),
        type(
          'm3-list-item',
          'List item',
          'headline',
          [
            str('headline', 'Headline', true, 'headline'),
            str('supporting', 'Supporting text', false, 'supportingText'),
            iconField('leading', 'Leading icon', '', 'leadingIcon'),
            str('initials', 'Avatar initials', false, 'avatar.initials'),
            iconField('trailing', 'Trailing icon', '', 'trailingIcon'),
          ],
          { name: 'ListItem' },
        ),
        type(
          'm3-navigation-bar',
          'Navigation bar',
          null,
          [
            str('label1', 'Label 1', true, 'items[0].label'),
            iconField('icon1', 'Icon 1', 'home', 'items[0].icon'),
            str('label2', 'Label 2', true, 'items[1].label'),
            iconField('icon2', 'Icon 2', 'search', 'items[1].icon'),
            str('label3', 'Label 3', true, 'items[2].label'),
            iconField('icon3', 'Icon 3', 'person', 'items[2].icon'),
            {
              key: 'active',
              label: 'Active',
              type: 'enum',
              options: ['1', '2', '3'],
              default: '1',
              // O SDUI conta a partir de 0; o campo, a partir de 1.
              ...fromProp('selectedIndex', { '0': '1', '1': '2', '2': '3' }),
            },
          ],
          { name: 'NavigationBar' },
        ),
        type(
          'm3-bottom-sheet',
          'Bottom sheet',
          'title',
          [
            str('title', 'Title', false, 'title'),
            yesNo('handle', 'Drag handle', 'sim', 'dragHandle'),
            str('item1', 'Item 1', false, 'items[0].label'),
            iconField('icon1', 'Icon 1', '', 'items[0].icon'),
            str('item2', 'Item 2', false, 'items[1].label'),
            iconField('icon2', 'Icon 2', '', 'items[1].icon'),
            str('item3', 'Item 3', false, 'items[2].label'),
            iconField('icon3', 'Icon 3', '', 'items[2].icon'),
          ],
          { name: 'BottomSheet' },
        ),
        // Película do modal: desenhada pela origem (`scrim`), não corresponde a um nó do SDUI.
        type('m3-scrim', 'Scrim', null, []),
        type('m3-box', 'Box', null, containerStyle(), { name: 'Box' }),
        type(
          'm3-row',
          'Row',
          null,
          [
            num('spacing', 'Spacing (dp)', 8, 'spacing'),
            num('padding', 'Padding (dp)', 0, 'padding'),
            ...containerStyle(),
          ],
          { name: 'Row' },
        ),
        type(
          'm3-column',
          'Column',
          null,
          [
            num('spacing', 'Spacing (dp)', 8, 'spacing'),
            num('padding', 'Padding (dp)', 0, 'padding'),
            ...containerStyle(),
          ],
          { name: 'Column' },
        ),
      ],
    },
  ],
};

export const M3_FILES: readonly { readonly path: string; readonly text: string }[] = [
  { path: 'material3.spec.json', text: JSON.stringify(M3_SPEC, null, 2) },
  ...M3_COMPONENTS.map((c) => ({
    path: `components/${c.id}.json`,
    text: JSON.stringify(c, null, 2),
  })),
];

const i = (
  id: string,
  typeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  values: Record<string, string | number>,
) => ({ id, typeId, box: { x, y, width, height }, values });

/** Instância dentro de um container (`parentId`); a posição é recalculada pelo layout do slot. */
const ic = (
  parentId: string,
  id: string,
  typeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  values: Record<string, string | number>,
) => ({ ...i(id, typeId, x, y, width, height, values), parentId });

/** Tela de configurações num Pixel (412 × 917), só com instâncias do Material 3. */
export const M3_SCREEN: Screen = {
  id: 'm3-settings',
  name: 'Material 3 — Settings',
  width: 412,
  height: 917,
  background: C.surface,
  instances: [
    i('m-bar', 'm3-top-app-bar', 0, 0, 412, 64, {
      title: 'Settings',
      navigation: 'back',
      action: 'search',
      align: 'start',
    }),
    i('m-search', 'm3-text-field', 16, 80, 380, 80, {
      label: 'Search settings',
      value: '',
      placeholder: 'Wi-Fi, notifications…',
      supporting: '',
      state: 'enabled',
      trailing: 'search',
    }),
    i('m-row-chips', 'm3-row', 16, 168, 380, 32, {
      spacing: 8,
      padding: 0,
      background: 'none',
      shape: 'none',
    }),
    ic('m-row-chips', 'm-chip1', 'm3-chip', 16, 168, 96, 32, {
      label: 'All',
      selected: 'sim',
      icon: '',
    }),
    ic('m-row-chips', 'm-chip2', 'm3-chip', 120, 168, 120, 32, {
      label: 'Network',
      selected: 'não',
      icon: 'settings',
    }),
    ic('m-row-chips', 'm-chip3', 'm3-chip', 248, 168, 132, 32, {
      label: 'Privacy',
      selected: 'não',
      icon: 'notifications',
    }),
    i('m-card', 'm3-card', 16, 216, 380, 148, {
      headline: 'Storage almost full',
      subhead: '92% used · 118 GB of 128 GB',
      body: 'Free up space by removing unused apps and old downloads.',
      variant: 'filled',
    }),
    i('m-card-btn', 'm3-button', 268, 308, 112, 40, {
      label: 'Clean up',
      variant: 'text',
      icon: '',
      disabled: 'não',
    }),
    i('m-item1', 'm3-list-item', 0, 380, 412, 72, {
      headline: 'Network & internet',
      supporting: 'Wi-Fi, mobile, hotspot',
      leading: 'home',
      initials: '',
      trailing: 'chevron',
    }),
    i('m-item2', 'm3-list-item', 0, 452, 412, 72, {
      headline: 'Notifications',
      supporting: 'Notification history, conversations',
      leading: 'notifications',
      initials: '',
      trailing: 'chevron',
    }),
    i('m-item3', 'm3-list-item', 0, 524, 412, 72, {
      headline: 'Maria Souza',
      supporting: 'Google account, backup',
      leading: '',
      initials: 'MS',
      trailing: 'chevron',
    }),
    i('m-switch1', 'm3-switch', 16, 612, 380, 32, {
      label: 'Dark theme',
      selected: 'sim',
      icon: 'sim',
    }),
    i('m-switch2', 'm3-switch', 16, 660, 380, 32, {
      label: 'Battery saver',
      selected: 'não',
      icon: 'não',
    }),
    i('m-check', 'm3-checkbox', 16, 708, 380, 40, {
      label: 'Send usage & diagnostics',
      checked: 'sim',
      error: 'não',
    }),
    i('m-row-actions', 'm3-row', 16, 764, 380, 40, {
      spacing: 12,
      padding: 0,
      background: 'none',
      shape: 'none',
    }),
    ic('m-row-actions', 'm-btn1', 'm3-button', 16, 764, 184, 40, {
      label: 'Reset options',
      variant: 'outlined',
      icon: '',
      disabled: 'não',
    }),
    ic('m-row-actions', 'm-btn2', 'm3-button', 212, 764, 184, 40, {
      label: 'Save',
      variant: 'filled',
      icon: 'check',
      disabled: 'não',
    }),
    i('m-fab', 'm3-fab', 340, 684, 56, 56, { icon: 'edit', label: '', color: 'primary' }),
    i('m-nav', 'm3-navigation-bar', 0, 837, 412, 80, {
      label1: 'Home',
      icon1: 'home',
      label2: 'Search',
      icon2: 'search',
      label3: 'Profile',
      icon3: 'person',
      active: '3',
    }),
    i('m-scrim', 'm3-scrim', 0, 0, 412, 917, {}),
    i('m-sheet', 'm3-bottom-sheet', 0, 597, 412, 320, {
      title: 'Sort by',
      handle: 'sim',
      item1: 'Name',
      icon1: 'person',
      item2: 'Date modified',
      icon2: 'edit',
      item3: 'Size',
      icon3: 'settings',
    }),
  ],
};
