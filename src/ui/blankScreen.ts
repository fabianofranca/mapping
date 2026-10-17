import { MAX_BLANK_SIZE } from '../model';
import type { TranslationKey } from '../i18n';

// Regras do diálogo "Nova tela em branco" (e dos campos de Detalhes da tela): predefinições
// de tamanho e a leitura do que a pessoa digitou. O modelo valida de novo (`addBlankImage`).

export interface BlankPreset {
  readonly id: string;
  readonly label: TranslationKey;
  readonly width: number;
  readonly height: number;
}

/** Tamanhos de tela comuns (pixels). */
export const BLANK_PRESETS: readonly BlankPreset[] = [
  { id: 'phone', label: 'blank.preset.phone', width: 360, height: 800 },
  { id: 'phoneLarge', label: 'blank.preset.phoneLarge', width: 412, height: 915 },
  { id: 'tablet', label: 'blank.preset.tablet', width: 800, height: 1280 },
  { id: 'desktop', label: 'blank.preset.desktop', width: 1440, height: 900 },
];

/** Id do "Personalizado" no seletor de predefinições. */
export const CUSTOM_PRESET = 'custom';

/** Cor de fundo inicial de uma tela em branco. */
export const DEFAULT_BLANK_BACKGROUND = '#FFFFFF';

const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Predefinição que bate com o tamanho (ou `custom`). */
export function presetFor(width: string, height: string): string {
  const w = Number(width.trim());
  const h = Number(height.trim());
  return BLANK_PRESETS.find((p) => p.width === w && p.height === h)?.id ?? CUSTOM_PRESET;
}

/** Lado da tela: inteiro de 1 a `MAX_BLANK_SIZE`, ou `null`. */
export function parseBlankSide(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= MAX_BLANK_SIZE ? value : null;
}

/** Cor `#RRGGBB` (maiúsculas), ou `null`. */
export function parseBlankColor(text: string): string | null {
  const trimmed = text.trim();
  return COLOR.test(trimmed) ? trimmed.toUpperCase() : null;
}

export interface BlankForm {
  readonly name: string;
  readonly width: string;
  readonly height: string;
  readonly background: string;
}

export type BlankResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly name: string;
        readonly width: number;
        readonly height: number;
        readonly background: string;
      };
    }
  | { readonly ok: false; readonly error: 'name' | 'size' | 'color' };

/** Lê o formulário: nome obrigatório, lados inteiros de 1 a `MAX_BLANK_SIZE`, cor `#RRGGBB`. */
export function readBlankForm(form: BlankForm): BlankResult {
  const name = form.name.trim();
  if (name === '') return { ok: false, error: 'name' };
  const width = parseBlankSide(form.width);
  const height = parseBlankSide(form.height);
  if (width === null || height === null) return { ok: false, error: 'size' };
  const background = parseBlankColor(form.background);
  if (background === null) return { ok: false, error: 'color' };
  return { ok: true, value: { name, width, height, background } };
}
