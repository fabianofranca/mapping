import type { ModelMessage } from '../modelMessage';
import { templateMessage } from '../messages';

/**
 * Minimal XML reader of the SVG icon converter (stage #2087, decision 5): elements, attributes
 * (both quote styles), the five XML entities and numeric character references in the values,
 * comments, `<?xml?>` and other processing instructions, and CDATA. The text between elements is
 * ignored. A `DOCTYPE` or an `ENTITY` declaration is an error (no entity expansion, so no
 * "billion laughs"), and so are unclosed or mismatched tags, with the line.
 *
 * Input is untrusted text, so it is bounded (`SVG_MAX_BYTES`, `SVG_MAX_DEPTH`) and read with one
 * linear pass and no recursion. Pure functions, no DOM: it runs in Node and in the browser.
 */

/** Largest accepted text, in UTF-8 bytes. */
export const SVG_MAX_BYTES = 256 * 1024;
/** Deepest accepted element nesting (the root is level 1). */
export const SVG_MAX_DEPTH = 64;

export interface XmlElement {
  readonly name: string;
  /** In the order written. */
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  /** Line (from 1) of the opening tag. */
  readonly line: number;
}

export type XmlResult =
  { ok: true; root: XmlElement } | { ok: false; error: ModelMessage };

interface OpenElement {
  readonly name: string;
  readonly attributes: Map<string, string>;
  readonly children: XmlElement[];
  readonly line: number;
}

interface State {
  readonly text: string;
  pos: number;
  readonly stack: OpenElement[];
  root: XmlElement | undefined;
  /** Position and line of the last `lineAt` answer: the reading only moves forward. */
  linePos: number;
  line: number;
}

/** Bytes of the text in UTF-8, without allocating a copy. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** The line (from 1) of a position; counts forward from the last answer. */
function lineAt(state: State, pos: number): number {
  if (pos < state.linePos) {
    state.linePos = 0;
    state.line = 1;
  }
  for (let i = state.linePos; i < pos; i++)
    if (state.text.charCodeAt(i) === 10) state.line++;
  state.linePos = pos;
  return state.line;
}

const fail = (error: ModelMessage): XmlResult => ({ ok: false, error });
const syntax = (state: State, pos: number): ModelMessage =>
  templateMessage('svgIcon.xmlSyntax', { line: lineAt(state, pos) });

const isSpace = (code: number): boolean =>
  code === 32 || code === 9 || code === 10 || code === 13;

function isNameStart(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code === 58 ||
    code > 127
  );
}

const isNameChar = (code: number): boolean =>
  isNameStart(code) || (code >= 48 && code <= 57) || code === 45 || code === 46;

function skipSpaces(state: State): void {
  while (state.pos < state.text.length && isSpace(state.text.charCodeAt(state.pos)))
    state.pos++;
}

function readName(state: State): string {
  const start = state.pos;
  if (start < state.text.length && isNameStart(state.text.charCodeAt(start))) {
    state.pos++;
    while (state.pos < state.text.length && isNameChar(state.text.charCodeAt(state.pos)))
      state.pos++;
  }
  return state.text.slice(start, state.pos);
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** The characters XML 1.0 allows (tab, line feed, carriage return and from space up, no surrogates). */
function isXmlChar(code: number): boolean {
  if (code === 9 || code === 10 || code === 13) return true;
  return (
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/** The text of a reference (`lt`, `#65`, `#x41`) or `undefined` when it is unknown or invalid. */
function referenceText(body: string): string | undefined {
  if (Object.hasOwn(NAMED_ENTITIES, body)) return NAMED_ENTITIES[body];
  const hex = /^#x([0-9a-fA-F]{1,6})$/.exec(body)?.[1];
  const dec = /^#([0-9]{1,7})$/.exec(body)?.[1];
  const code = hex !== undefined ? parseInt(hex, 16) : dec !== undefined ? +dec : NaN;
  return isXmlChar(code) ? String.fromCodePoint(code) : undefined;
}

/** The value with the references replaced (once: `&amp;lt;` becomes `&lt;`), or the error. */
function decode(state: State, raw: string, rawPos: number): string | ModelMessage {
  if (!raw.includes('&')) return raw;
  let out = '';
  let from = 0;
  for (let at = raw.indexOf('&'); at >= 0; at = raw.indexOf('&', from)) {
    out += raw.slice(from, at);
    const semi = raw.indexOf(';', at);
    const end = semi >= 0 && semi - at <= 9 ? semi : -1;
    const text = end < 0 ? undefined : referenceText(raw.slice(at + 1, end));
    if (end < 0 || text === undefined)
      return templateMessage('svgIcon.xmlEntity', {
        entity: end < 0 ? '&' : raw.slice(at, end + 1),
        line: lineAt(state, rawPos + at),
      });
    out += text;
    from = end + 1;
  }
  return out + raw.slice(from);
}

const isError = (value: string | ModelMessage): value is ModelMessage =>
  typeof value !== 'string';

/** One `name="value"` of an opening tag; moves past it. Returns the error, if any. */
function readAttribute(
  state: State,
  attributes: Map<string, string>,
): ModelMessage | null {
  const at = state.pos;
  const name = readName(state);
  skipSpaces(state);
  if (name === '' || state.text[state.pos] !== '=') return syntax(state, at);
  state.pos++;
  skipSpaces(state);
  const quote = state.text[state.pos];
  if (quote !== '"' && quote !== "'") return syntax(state, at);
  const close = state.text.indexOf(quote, state.pos + 1);
  if (close < 0 || attributes.has(name)) return syntax(state, at);
  const value = decode(state, state.text.slice(state.pos + 1, close), state.pos + 1);
  if (isError(value)) return value;
  attributes.set(name, value);
  state.pos = close + 1;
  return null;
}

/** The attributes of an opening tag, up to `>` or `/>`; says whether the tag closes itself. */
function readAttributes(
  state: State,
  attributes: Map<string, string>,
): { selfClosing: boolean } | ModelMessage {
  const start = state.pos;
  for (;;) {
    const before = state.pos;
    skipSpaces(state);
    const char = state.text[state.pos];
    if (char === undefined) return syntax(state, start);
    if (char === '>') return (state.pos++, { selfClosing: false });
    if (char === '/' && state.text[state.pos + 1] === '>')
      return ((state.pos += 2), { selfClosing: true });
    // An attribute needs whitespace before it (`<a x="1"y="2"/>` is not XML).
    if (state.pos === before) return syntax(state, state.pos);
    const error = readAttribute(state, attributes);
    if (error !== null) return error;
  }
}

function closeElement(state: State, element: OpenElement): ModelMessage | null {
  const done: XmlElement = {
    name: element.name,
    attributes: element.attributes,
    children: element.children,
    line: element.line,
  };
  const parent = state.stack[state.stack.length - 1];
  if (parent !== undefined) parent.children.push(done);
  else if (state.root === undefined) state.root = done;
  else return syntax(state, state.pos);
  return null;
}

function readOpenTag(state: State): ModelMessage | null {
  const at = state.pos;
  state.pos++;
  const name = readName(state);
  if (name === '') return syntax(state, at);
  const line = lineAt(state, at);
  if (state.stack.length >= SVG_MAX_DEPTH)
    return templateMessage('svgIcon.xmlTooDeep', { max: SVG_MAX_DEPTH, line });
  if (state.stack.length === 0 && state.root !== undefined) return syntax(state, at);
  const attributes = new Map<string, string>();
  const end = readAttributes(state, attributes);
  if ('code' in end) return end;
  const element: OpenElement = { name, attributes, children: [], line };
  if (end.selfClosing) return closeElement(state, element);
  state.stack.push(element);
  return null;
}

function readCloseTag(state: State): ModelMessage | null {
  const at = state.pos;
  const end = state.text.indexOf('>', at);
  const found = end < 0 ? '' : state.text.slice(at + 2, end).trim();
  const open = state.stack.pop();
  if (end < 0 || open === undefined || found === '') return syntax(state, at);
  if (open.name !== found)
    return templateMessage('svgIcon.xmlMismatch', {
      found,
      expected: open.name,
      line: lineAt(state, at),
    });
  state.pos = end + 1;
  return closeElement(state, open);
}

/** Skips up to and after `terminator`; the error is the syntax one at the start of the markup. */
function skipUntil(state: State, terminator: string, skip: number): ModelMessage | null {
  const end = state.text.indexOf(terminator, state.pos + skip);
  if (end < 0) return syntax(state, state.pos);
  state.pos = end + terminator.length;
  return null;
}

function readDeclaration(state: State): ModelMessage | null {
  const { text, pos } = state;
  if (text.startsWith('<!--', pos)) return skipUntil(state, '-->', 4);
  if (text.startsWith('<![CDATA[', pos))
    return state.stack.length === 0 ? syntax(state, pos) : skipUntil(state, ']]>', 9);
  if (text.startsWith('<!DOCTYPE', pos) || text.startsWith('<!ENTITY', pos))
    return templateMessage('svgIcon.xmlDoctype', { line: lineAt(state, pos) });
  return syntax(state, pos);
}

/** Reads the markup that starts at `<`; the error, if any. */
function readMarkup(state: State): ModelMessage | null {
  const next = state.text[state.pos + 1];
  if (next === '!') return readDeclaration(state);
  if (next === '?') return skipUntil(state, '?>', 2);
  if (next === '/') return readCloseTag(state);
  return readOpenTag(state);
}

/** Text between the markup: only whitespace is allowed outside the root. */
function checkText(state: State, to: number): ModelMessage | null {
  if (state.stack.length > 0) return null;
  const text = state.text.slice(state.pos, to);
  return text.trim() === '' ? null : syntax(state, state.pos);
}

function finish(state: State): XmlResult {
  const open = state.stack[state.stack.length - 1];
  if (open !== undefined)
    return fail(
      templateMessage('svgIcon.xmlUnclosed', { tag: open.name, line: open.line }),
    );
  return state.root === undefined
    ? fail(templateMessage('svgIcon.xmlNoRoot'))
    : { ok: true, root: state.root };
}

/** Reads the text as XML; never throws. */
export function parseXml(input: string): XmlResult {
  if (utf8Length(input) > SVG_MAX_BYTES)
    return fail(templateMessage('svgIcon.xmlTooLarge', { max: SVG_MAX_BYTES / 1024 }));
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const state: State = { text, pos: 0, stack: [], root: undefined, linePos: 0, line: 1 };
  while (state.pos < text.length) {
    const lt = text.indexOf('<', state.pos);
    const error = checkText(state, lt < 0 ? text.length : lt);
    if (error !== null) return fail(error);
    if (lt < 0) break;
    state.pos = lt;
    const markupError = readMarkup(state);
    if (markupError !== null) return fail(markupError);
  }
  return finish(state);
}
