// Importer names (stage #1079, decision 5): the field key, the label and the normalized text
// that links a parameter to a field (decision 7). Pure.

/** Lowercase, letters and digits only: `Style` e `style`, `content_padding` e `contentPadding`. */
export const normalizeName = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The label from the name: `contentPadding` → "Content padding". */
export function labelOf(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The field key (`[A-Za-z0-9_]`, no leading `_`): whatever does not fit is normalized. */
export function keyOf(name: string): string {
  let key = name
    .replace(/[^A-Za-z0-9_]+(.)?/g, (_match, next: string | undefined) =>
      next === undefined ? '' : next.toUpperCase(),
    )
    .replace(/^_+/, '');
  if (key === '') key = 'param';
  return /^[0-9]/.test(key) ? `p${key}` : key;
}

/** The first free key: `base`, then `base2`, `base3`… */
export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

export const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** The field option that matches the source text: equal, or equal after normalizing. */
export function optionFor(text: string, options: readonly string[]): string | undefined {
  if (options.includes(text)) return text;
  const normal = normalizeName(text);
  return options.find((option) => normalizeName(option) === normal);
}
