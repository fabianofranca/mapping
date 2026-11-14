/**
 * Font family of the component (`font.family`): a family or a CSS stack.
 * Pure functions, no DOM. `canvasFontFamily` builds the value the canvas (Konva) receives;
 * `isValidFontFamily` tells whether the value is a valid family list (used in the validation warning).
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

/** When the value is unusable, the drawing uses this family (with the component's size and weight). */
const INVALID_FALLBACK = 'sans-serif';

/**
 * Splits the list by commas outside quotes. Returns `undefined` if a quote is left unclosed.
 * Each item comes without leading or trailing spaces.
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

/** A fully quoted name: opens and closes with the same quote, with no such quote in the middle. */
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

/** `true` if the value is a family list that CSS accepts (an empty item and stray quotes are not). */
export function isValidFontFamily(value: string): boolean {
  const items = splitItems(value);
  return items !== undefined && items.every(isValidItem);
}

/**
 * The `fontFamily` the canvas receives for the component's `font.family`:
 * a stack passes through as it came; a quoted name gets `, sans-serif`; a lone generic stays
 * unquoted; a plain name becomes `"<name>", sans-serif`; an invalid value becomes `sans-serif`.
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
