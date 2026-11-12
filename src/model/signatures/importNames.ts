// Nomes do importador (etapa #1079, decisão 5): a chave do campo, o rótulo e o texto normalizado
// que liga um parâmetro a um campo (decisão 7). Puro.

/** Minúsculas, só letras e dígitos: `Style` e `style`, `content_padding` e `contentPadding`. */
export const normalizeName = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** O rótulo a partir do nome: `contentPadding` → "Content padding". */
export function labelOf(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A chave do campo (`[A-Za-z0-9_]`, sem `_` na frente): o que não cabe é normalizado. */
export function keyOf(name: string): string {
  let key = name
    .replace(/[^A-Za-z0-9_]+(.)?/g, (_match, next: string | undefined) =>
      next === undefined ? '' : next.toUpperCase(),
    )
    .replace(/^_+/, '');
  if (key === '') key = 'param';
  return /^[0-9]/.test(key) ? `p${key}` : key;
}

/** A primeira chave livre: `base`, depois `base2`, `base3`… */
export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

export const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** A opção do campo que corresponde ao texto da fonte: igual, ou igual depois de normalizar. */
export function optionFor(text: string, options: readonly string[]): string | undefined {
  if (options.includes(text)) return text;
  const normal = normalizeName(text);
  return options.find((option) => normalizeName(option) === normal);
}
