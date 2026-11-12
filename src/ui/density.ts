import { isValidDensity } from '../model';
import { locale } from '../store/settings';

// Densidade do container na interface (D2): a lista pronta do campo, o número como a pessoa
// lê (vírgula em pt-BR) e a leitura do que ela digita em "Personalizada".

/** Os valores prontos do `Select` (a opção "Personalizada" vem depois deles). */
export const DENSITY_CHOICES: readonly number[] = [1, 1.5, 2, 3, 4];

/** O valor do `Select` que abre o campo de número. */
export const CUSTOM_DENSITY = 'custom';

export const isDensityChoice = (value: number): boolean =>
  DENSITY_CHOICES.includes(value);

/** O número no idioma da interface (1,5 em pt-BR; 1.5 em en-US), com até 3 casas. */
export function formatDensity(value: number): string {
  try {
    return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 3 }).format(
      value,
    );
  } catch {
    return String(value);
  }
}

/**
 * Lê a densidade digitada: número com vírgula ou ponto, de 0,5 a 8 (`isValidDensity`); qualquer
 * outra coisa, `null`.
 */
export function parseDensity(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isValidDensity(value) ? value : null;
}
