import { SUGGESTED_DENSITIES, isValidDensity } from '../model';
import { locale } from '../store/settings';

// Container density in the interface (D2): the field's ready-made list, the number as the person
// reads it (comma in pt-BR) and the parsing of what they type in "Custom".

/** The ready-made `Select` values (the "Custom" option comes after them). */
export const DENSITY_CHOICES: readonly number[] = [1, ...SUGGESTED_DENSITIES];

/** The `Select` value that opens the number field. */
export const CUSTOM_DENSITY = 'custom';

export const isDensityChoice = (value: number): boolean =>
  DENSITY_CHOICES.includes(value);

/** The number in the interface language (1,5 in pt-BR; 1.5 in en-US), with up to 6 decimals (the MCP saves any value from 0.5 to 8). */
export function formatDensity(value: number): string {
  try {
    return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }).format(
      value,
    );
  } catch {
    return String(value);
  }
}

/**
 * Parses the typed density: a number with comma or dot, from 0.5 to 8 (`isValidDensity`); anything
 * else, `null`.
 */
export function parseDensity(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isValidDensity(value) ? value : null;
}
