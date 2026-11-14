import { normalizeDoc, type ComposerPart } from '../../model';

// DOM functions of the citation editor (stage Comments, CM5, decision 30). The editor is a
// `contenteditable` whose DOM is built only with `createElement`/`createTextNode` (never HTML in
// text): text is text nodes and `<br>` per line break; the citation is a non-editable
// `<span>`. These are the stateless parts of the component, to test without keyboard or focus.

/** Filler `<br>`: the browser only shows the last empty line with an extra `<br>`. */
const FILL_ATTR = 'data-fill';

/** What an editor chip shows. */
export interface ChipSpec {
  readonly url: string;
  /** The live name (or the fallback label, if the target vanished): also the saved label. */
  readonly name: string;
  readonly broken: boolean;
  readonly ariaLabel: string;
  /** Hint of the broken chip. */
  readonly title?: string;
}

/** A DOM point (node and offset), like those of a `Range`. */
export interface Point {
  readonly node: Node;
  readonly offset: number;
}

export type Direction = 'back' | 'forward';

const TEXT_NODE = 3;
const BASE_CLASS = 'citation-chip citation-chip-editor';
const BROKEN_CLASS = ' citation-chip-broken';

const isText = (node: Node | null | undefined): node is Text =>
  node?.nodeType === TEXT_NODE;
const isBreak = (node: Node | null | undefined): node is HTMLElement =>
  node?.nodeName === 'BR';
const isFill = (node: Node | null | undefined): boolean =>
  isBreak(node) && node.hasAttribute(FILL_ATTR);

/** The `<span>` of a citation (non-editable, with the URL in `data-url`). */
export function isChip(node: Node | null | undefined): node is HTMLElement {
  return (
    node?.nodeType === 1 &&
    node.nodeName === 'SPAN' &&
    (node as HTMLElement).dataset.url !== undefined
  );
}

function applySpec(chip: HTMLElement, spec: ChipSpec): void {
  chip.dataset.url = spec.url;
  chip.dataset.label = spec.name;
  chip.className = spec.broken ? BASE_CLASS + BROKEN_CLASS : BASE_CLASS;
  chip.setAttribute('aria-label', spec.ariaLabel);
  if (spec.broken && spec.title !== undefined) chip.setAttribute('title', spec.title);
  else chip.removeAttribute('title');
  chip.textContent = spec.name;
}

export function createChip(doc: Document, spec: ChipSpec): HTMLSpanElement {
  const chip = doc.createElement('span');
  chip.setAttribute('contenteditable', 'false');
  chip.setAttribute('role', 'img');
  applySpec(chip, spec);
  return chip;
}

/** Updates the chip to the live state; returns whether anything changed. */
export function updateChip(chip: HTMLElement, spec: ChipSpec): boolean {
  const same =
    chip.dataset.url === spec.url &&
    chip.dataset.label === spec.name &&
    chip.classList.contains('citation-chip-broken') === spec.broken &&
    chip.getAttribute('aria-label') === spec.ariaLabel &&
    chip.getAttribute('title') === (spec.broken ? (spec.title ?? null) : null);
  if (!same) applySpec(chip, spec);
  return !same;
}

// ------------------------------------------------------------------ DOM → document

const BLOCKS = new Set(['DIV', 'P']);

function endsWithBreak(out: ComposerPart[]): boolean {
  const last = out.at(-1);
  return last?.type !== 'text' || last.text.endsWith('\n');
}

function readLeaf(node: Node, out: ComposerPart[]): boolean {
  if (isText(node)) {
    out.push({ type: 'text', text: node.data.replaceAll('\u00a0', ' ') });
  } else if (isChip(node)) {
    out.push({
      type: 'chip',
      label: node.dataset.label ?? '',
      url: node.dataset.url ?? '',
    });
  } else if (isBreak(node)) {
    if (!isFill(node)) out.push({ type: 'text', text: '\n' });
  } else return false;
  return true;
}

function readNode(node: Node, out: ComposerPart[]): void {
  if (readLeaf(node, out)) return;
  // Block pasted or dragged from outside: becomes a line; the rest (bold etc.) becomes plain text.
  if (BLOCKS.has(node.nodeName) && out.length > 0 && !endsWithBreak(out)) {
    out.push({ type: 'text', text: '\n' });
  }
  for (const child of node.childNodes) readNode(child, out);
}

/** The editor content as a document: only text and chips, anything else becomes text. */
export function readParts(root: HTMLElement): ComposerPart[] {
  const out: ComposerPart[] = [];
  for (const child of root.childNodes) readNode(child, out);
  return normalizeDoc(out);
}

// ------------------------------------------------------------------ document → DOM

function lastMeaningful(root: Node): Node | null {
  for (let n = root.lastChild; n; n = n.previousSibling) {
    if (isFill(n) || (isText(n) && n.data === '')) continue;
    return n;
  }
  return null;
}

/** Ensures the filler `<br>` only when the last line is empty (it ended in a break). */
export function syncFill(root: HTMLElement): void {
  for (const fill of [...root.querySelectorAll(`br[${FILL_ATTR}]`)]) fill.remove();
  if (isBreak(lastMeaningful(root))) {
    const fill = root.ownerDocument.createElement('br');
    fill.setAttribute(FILL_ATTR, '');
    root.append(fill);
  }
}

/** Nodes for a piece of text: text nodes and `<br>` between the lines. */
export function textNodes(doc: Document, data: string): Node[] {
  const out: Node[] = [];
  data.split('\n').forEach((line, i) => {
    if (i > 0) out.push(doc.createElement('br'));
    if (line !== '') out.push(doc.createTextNode(line));
  });
  return out;
}

/** Builds the editor DOM from the document (erases what was there). */
export function renderParts(
  root: HTMLElement,
  parts: readonly ComposerPart[],
  specOf: (chip: Extract<ComposerPart, { type: 'chip' }>) => ChipSpec,
): void {
  while (root.firstChild) root.removeChild(root.firstChild);
  const doc = root.ownerDocument;
  for (const part of parts) {
    if (part.type === 'chip') root.append(createChip(doc, specOf(part)));
    else root.append(...textNodes(doc, part.text));
  }
  syncFill(root);
}

/** The end of the content (before the filler). */
export function endPoint(root: HTMLElement): Point {
  let count = root.childNodes.length;
  while (count > 0 && isFill(root.childNodes[count - 1])) count--;
  return { node: root, offset: count };
}

// ------------------------------------------------------------------ chips next to the cursor

function skipEmpty(node: Node | null, dir: Direction): Node | null {
  let n = node;
  while (isText(n) && n.data === '')
    n = dir === 'back' ? n.previousSibling : n.nextSibling;
  return n;
}

function neighbour(container: Node, offset: number, dir: Direction): Node | null {
  if (isText(container)) {
    const inside = dir === 'back' ? offset > 0 : offset < container.length;
    if (inside) return null;
    return dir === 'back' ? container.previousSibling : container.nextSibling;
  }
  const children = container.childNodes;
  return (dir === 'back' ? children[offset - 1] : children[offset]) ?? null;
}

/** The chip adjacent to the cursor (`back`: just before it; `forward`: just after), or `null`. */
export function chipBeside(
  container: Node,
  offset: number,
  dir: Direction,
): HTMLElement | null {
  const node = skipEmpty(neighbour(container, offset, dir), dir);
  return isChip(node) ? node : null;
}

/** The point on the other side of the chip: before it (`back`) or after it (`forward`). */
export function caretAcross(chip: HTMLElement, dir: Direction): Point {
  const parent = chip.parentNode as Node;
  const index = [...parent.childNodes].indexOf(chip);
  return { node: parent, offset: dir === 'back' ? index : index + 1 };
}

// ------------------------------------------------------------------ the @

/** The `@term` under the cursor: where it starts (the `@`), where it ends (cursor) and the term. */
export interface Trigger {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
  readonly term: string;
}

const TRIGGER = /(^|\s)@([^\n@]{0,40})$/;

/**
 * Is there an `@term` ending at the cursor? The `@` counts at the start of the field, after a space
 * and after a break (not in the middle of a word, as in an email, nor glued to a chip).
 */
export function triggerAt(container: Node, offset: number): Trigger | null {
  if (!isText(container)) return null;
  const found = TRIGGER.exec(container.data.slice(0, offset));
  if (!found) return null;
  const start = found.index + (found[1] ?? '').length;
  if (start === 0) {
    const previous = skipEmpty(container.previousSibling, 'back');
    if (previous !== null && !isBreak(previous)) return null;
  }
  return { node: container, start, end: offset, term: found[2] ?? '' };
}

// ------------------------------------------------------------------ insert

const WHITESPACE = /\s/;

function pointAfter(parent: Node, last: Node): Point {
  if (isText(last)) return { node: last, offset: last.length };
  return { node: parent, offset: [...parent.childNodes].indexOf(last as ChildNode) + 1 };
}

/** Inserts `nodes` before `ref` (or at the end) and returns the cursor after the last one. */
export function insertNodes(
  parent: Node,
  ref: Node | null,
  nodes: readonly Node[],
): Point {
  for (const node of nodes) parent.insertBefore(node, ref);
  const last = nodes.at(-1);
  if (last === undefined) return { node: parent, offset: 0 };
  return pointAfter(parent, last);
}

/** Puts a line break before `ref`; the cursor stays after it. */
export function insertBreak(root: HTMLElement, ref: Node | null): Point {
  const br = root.ownerDocument.createElement('br');
  root.insertBefore(br, ref);
  syncFill(root);
  return { node: root, offset: [...root.childNodes].indexOf(br) + 1 };
}

/** Text without a trailing space, or a chip, before the insertion point: needs a space first. */
function needsSpaceBefore(previous: Node | null): boolean {
  const node = skipEmpty(previous, 'back');
  if (isChip(node)) return true;
  return isText(node) && !WHITESPACE.test(node.data.slice(-1));
}

/**
 * Puts the chip before `ref` with a space on each side when needed (never duplicates what already
 * exists). The cursor stays after the space that follows the chip.
 */
export function placeChip(parent: Node, ref: Node | null, chip: HTMLElement): Point {
  const doc = parent.ownerDocument as Document;
  const previous = ref ? ref.previousSibling : parent.lastChild;
  if (needsSpaceBefore(previous)) {
    const before = skipEmpty(previous, 'back');
    if (isText(before)) before.data += ' ';
    else parent.insertBefore(doc.createTextNode(' '), ref);
  }
  parent.insertBefore(chip, ref);
  const next = skipEmpty(ref, 'forward');
  if (isText(next) && WHITESPACE.test(next.data.charAt(0))) {
    return { node: next, offset: next.data.charAt(0) === ' ' ? 1 : 0 };
  }
  const space = doc.createTextNode(' ');
  parent.insertBefore(space, ref);
  return { node: space, offset: 1 };
}

// ------------------------------------------------------------------ selection

/** The browser selection, if it is a point or range inside the editor. */
export function rangeIn(root: HTMLElement): Range | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer)
    ? range
    : null;
}

/** Moves the cursor to the given point. */
export function setCaret(doc: Document, point: Point): void {
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Splits the text at the point (if it is text) and returns where to insert: the parent and the node
 * before which the new content goes (`null` = at the end).
 */
export function splitAt(point: Point): {
  readonly parent: Node;
  readonly ref: Node | null;
} {
  const { node, offset } = point;
  if (isText(node)) {
    return { parent: node.parentNode as Node, ref: node.splitText(offset) };
  }
  return { parent: node, ref: node.childNodes[offset] ?? null };
}

/**
 * After deleting everything, the browser leaves a stray `<br>`: the field goes back to being empty,
 * so the empty draft does not become a line break.
 */
export function clearIfBlank(root: HTMLElement): boolean {
  const blank = [...root.childNodes].every(
    (n) => isBreak(n) || (isText(n) && n.data === ''),
  );
  if (!blank || root.childNodes.length === 0) return false;
  while (root.firstChild) root.removeChild(root.firstChild);
  return true;
}
