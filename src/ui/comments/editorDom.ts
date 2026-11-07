import { normalizeDoc, type ComposerPart } from '../../model';

// Funções de DOM do editor de citações (etapa Comentários, CM5, decisão 30). O editor é um
// `contenteditable` cujo DOM é montado só com `createElement`/`createTextNode` (nunca HTML em
// texto): texto são nós de texto e `<br>` por quebra de linha; a citação é um `<span>` não
// editável. Aqui ficam as partes sem estado do componente, para testar sem teclado nem foco.

/** `<br>` de preenchimento: o navegador só mostra a última linha vazia com um `<br>` a mais. */
const FILL_ATTR = 'data-fill';

/** O que um chip do editor mostra. */
export interface ChipSpec {
  readonly url: string;
  /** O nome vivo (ou o rótulo de reserva, se o alvo sumiu): é também o rótulo que se grava. */
  readonly name: string;
  readonly broken: boolean;
  readonly ariaLabel: string;
  /** Dica do chip quebrado. */
  readonly title?: string;
}

/** Um ponto do DOM (nó e posição), como os de uma `Range`. */
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

/** O `<span>` de uma citação (não editável, com a URL em `data-url`). */
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

/** Atualiza o chip para o estado vivo; devolve se algo mudou. */
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

// ------------------------------------------------------------------ DOM → documento

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
  // Bloco colado ou arrastado de fora: vira linha; o resto (negrito etc.) vira só o texto.
  if (BLOCKS.has(node.nodeName) && out.length > 0 && !endsWithBreak(out)) {
    out.push({ type: 'text', text: '\n' });
  }
  for (const child of node.childNodes) readNode(child, out);
}

/** O conteúdo do editor como documento: só texto e chips, o que mais houver vira texto. */
export function readParts(root: HTMLElement): ComposerPart[] {
  const out: ComposerPart[] = [];
  for (const child of root.childNodes) readNode(child, out);
  return normalizeDoc(out);
}

// ------------------------------------------------------------------ documento → DOM

function lastMeaningful(root: Node): Node | null {
  for (let n = root.lastChild; n; n = n.previousSibling) {
    if (isFill(n) || (isText(n) && n.data === '')) continue;
    return n;
  }
  return null;
}

/** Garante o `<br>` de preenchimento só quando a última linha está vazia (acabou numa quebra). */
export function syncFill(root: HTMLElement): void {
  for (const fill of [...root.querySelectorAll(`br[${FILL_ATTR}]`)]) fill.remove();
  if (isBreak(lastMeaningful(root))) {
    const fill = root.ownerDocument.createElement('br');
    fill.setAttribute(FILL_ATTR, '');
    root.append(fill);
  }
}

/** Nós para um trecho de texto: nós de texto e `<br>` entre as linhas. */
export function textNodes(doc: Document, data: string): Node[] {
  const out: Node[] = [];
  data.split('\n').forEach((line, i) => {
    if (i > 0) out.push(doc.createElement('br'));
    if (line !== '') out.push(doc.createTextNode(line));
  });
  return out;
}

/** Monta o DOM do editor a partir do documento (apaga o que havia). */
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

/** O fim do conteúdo (antes do preenchimento). */
export function endPoint(root: HTMLElement): Point {
  let count = root.childNodes.length;
  while (count > 0 && isFill(root.childNodes[count - 1])) count--;
  return { node: root, offset: count };
}

// ------------------------------------------------------------------ chips ao lado do cursor

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

/** O chip colado ao cursor (`back`: logo antes dele; `forward`: logo depois), ou `null`. */
export function chipBeside(
  container: Node,
  offset: number,
  dir: Direction,
): HTMLElement | null {
  const node = skipEmpty(neighbour(container, offset, dir), dir);
  return isChip(node) ? node : null;
}

/** O ponto do outro lado do chip: antes dele (`back`) ou depois dele (`forward`). */
export function caretAcross(chip: HTMLElement, dir: Direction): Point {
  const parent = chip.parentNode as Node;
  const index = [...parent.childNodes].indexOf(chip);
  return { node: parent, offset: dir === 'back' ? index : index + 1 };
}

// ------------------------------------------------------------------ o @

/** O `@termo` sob o cursor: onde começa (no `@`), onde acaba (o cursor) e o termo digitado. */
export interface Trigger {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
  readonly term: string;
}

const TRIGGER = /(^|\s)@([^\n@]{0,40})$/;

/**
 * Há um `@termo` terminando no cursor? O `@` vale no começo do campo, depois de espaço e depois
 * de quebra (não no meio de uma palavra, como num e-mail, nem colado a um chip).
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

// ------------------------------------------------------------------ inserir

const WHITESPACE = /\s/;

function pointAfter(parent: Node, last: Node): Point {
  if (isText(last)) return { node: last, offset: last.length };
  return { node: parent, offset: [...parent.childNodes].indexOf(last as ChildNode) + 1 };
}

/** Insere `nodes` antes de `ref` (ou no fim) e devolve o cursor depois do último. */
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

/** Põe uma quebra de linha antes de `ref`; o cursor fica depois dela. */
export function insertBreak(root: HTMLElement, ref: Node | null): Point {
  const br = root.ownerDocument.createElement('br');
  root.insertBefore(br, ref);
  syncFill(root);
  return { node: root, offset: [...root.childNodes].indexOf(br) + 1 };
}

/** Texto sem espaço no fim, ou chip, antes do ponto de inserção: pede espaço antes do chip. */
function needsSpaceBefore(previous: Node | null): boolean {
  const node = skipEmpty(previous, 'back');
  if (isChip(node)) return true;
  return isText(node) && !WHITESPACE.test(node.data.slice(-1));
}

/**
 * Põe o chip antes de `ref` com um espaço de cada lado quando preciso (nunca duplica o que já
 * existe). O cursor fica depois do espaço que vem depois do chip.
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

// ------------------------------------------------------------------ seleção

/** A seleção do navegador, se for um ponto ou trecho dentro do editor. */
export function rangeIn(root: HTMLElement): Range | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer)
    ? range
    : null;
}

/** Leva o cursor ao ponto dado. */
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
 * Parte o texto no ponto (se for texto) e devolve onde inserir: o pai e o nó antes do qual
 * entra o novo conteúdo (`null` = no fim).
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
 * Depois de apagar tudo, o navegador deixa um `<br>` solto: o campo volta a ficar vazio, para o
 * rascunho vazio não virar uma quebra de linha.
 */
export function clearIfBlank(root: HTMLElement): boolean {
  const blank = [...root.childNodes].every(
    (n) => isBreak(n) || (isText(n) && n.data === ''),
  );
  if (!blank || root.childNodes.length === 0) return false;
  while (root.firstChild) root.removeChild(root.firstChild);
  return true;
}
