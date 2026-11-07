/**
 * Família de fonte do componente (`font.family`): uma família ou uma pilha CSS.
 * Funções puras, sem DOM. `canvasFontFamily` monta o valor que o canvas (Konva) recebe;
 * `isValidFontFamily` diz se o valor é uma lista de famílias válida (usada no aviso da validação).
 */

const GENERIC_FAMILIES: ReadonlySet<string> = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

/** Quando o valor não serve, o desenho usa esta família (com o tamanho e o peso do componente). */
const INVALID_FALLBACK = 'sans-serif';

/**
 * Parte a lista por vírgulas fora de aspas. Devolve `undefined` se há aspas sem fechar.
 * Cada item vem sem espaços nas pontas.
 */
function splitItems(value: string): string[] | undefined {
  const items: string[] = [];
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote !== null) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      items.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quote !== null) return undefined;
  items.push(value.slice(start).trim());
  return items;
}

/** Um nome entre aspas inteiro: abre e fecha com a mesma aspa, sem aquela aspa no meio. */
function isQuotedName(item: string): boolean {
  const quote = item[0];
  if ((quote !== '"' && quote !== "'") || item.length < 3 || !item.endsWith(quote))
    return false;
  const inner = item.slice(1, -1).replace(/\\./g, '');
  return !inner.includes(quote);
}

function isValidItem(item: string): boolean {
  if (item === '') return false;
  if (item[0] === '"' || item[0] === "'") return isQuotedName(item);
  return !item.includes('"') && !item.includes("'");
}

/** `true` se o valor é uma lista de famílias que o CSS aceita (item vazio e aspas soltas não). */
export function isValidFontFamily(value: string): boolean {
  const items = splitItems(value);
  return items !== undefined && items.every(isValidItem);
}

/**
 * O `fontFamily` que o canvas recebe para o `font.family` do componente:
 * pilha passa como veio; nome entre aspas ganha `, sans-serif`; genérico sozinho fica sem aspas;
 * nome simples vira `"<nome>", sans-serif`; valor inválido vira `sans-serif`.
 */
export function canvasFontFamily(value: string): string {
  const family = value.trim();
  const items = splitItems(family);
  if (items === undefined || !items.every(isValidItem)) return INVALID_FALLBACK;
  if (items.length > 1) return family;
  if (isQuotedName(family)) return `${family}, sans-serif`;
  if (GENERIC_FAMILIES.has(family.toLowerCase())) return family;
  return `"${family}", sans-serif`;
}
