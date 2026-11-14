import { afterEach, describe, expect, it } from 'vitest';
import {
  caretAcross,
  chipBeside,
  clearIfBlank,
  createChip,
  endPoint,
  insertBreak,
  insertNodes,
  isChip,
  placeChip,
  readParts,
  renderParts,
  splitAt,
  syncFill,
  triggerAt,
  updateChip,
  type ChipSpec,
} from '../../src/ui/comments/editorDom';

// Pure DOM functions of the citation editor (Comments stage, CM5, decision 30). They run in jsdom
// on a loose `<div>`: real selection and caret are left to the e2e.

const URL = 'mapping://p/m/ab';
const spec = (name: string, extra: Partial<ChipSpec> = {}): ChipSpec => ({
  url: URL,
  name,
  broken: false,
  ariaLabel: `${name}, citation`,
  ...extra,
});

let root: HTMLElement;
function editor(): HTMLElement {
  root = document.createElement('div');
  document.body.append(root);
  return root;
}
afterEach(() => root?.remove());

const chipOf = (name: string) => createChip(document, spec(name));
const text = (data: string) => document.createTextNode(data);
const shape = (el: HTMLElement) =>
  [...el.childNodes].map((n) =>
    n.nodeType === 3
      ? `"${(n as Text).data}"`
      : isChip(n)
        ? `[${(n as HTMLElement).textContent}]`
        : (n as HTMLElement).hasAttribute('data-fill')
          ? 'fill'
          : n.nodeName.toLowerCase(),
  );

describe('createChip / updateChip', () => {
  it('builds the non-editable <span> with the data and the accessible name, without raw HTML', () => {
    const chip = createChip(document, spec('Door'));
    expect(chip.tagName).toBe('SPAN');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.getAttribute('role')).toBe('img');
    expect(chip.getAttribute('aria-label')).toBe('Door, citation');
    expect(chip.dataset.url).toBe(URL);
    expect(chip.dataset.label).toBe('Door');
    expect(chip.className).toBe('citation-chip citation-chip-editor');
    expect(chip.textContent).toBe('Door');
    expect(chip.children).toHaveLength(0);
  });

  it('the name with < and & stays text, does not become an element', () => {
    const chip = createChip(document, spec('<b>x</b> & y'));
    expect(chip.children).toHaveLength(0);
    expect(chip.textContent).toBe('<b>x</b> & y');
  });

  it('broken: strikethrough class and the hint', () => {
    const chip = createChip(document, spec('Old', { broken: true, title: 'gone' }));
    expect(chip.classList.contains('citation-chip-broken')).toBe(true);
    expect(chip.getAttribute('title')).toBe('gone');
  });

  it('updateChip changes name and state and says whether anything changed', () => {
    const chip = createChip(document, spec('Door'));
    expect(updateChip(chip, spec('Door'))).toBe(false);
    expect(updateChip(chip, spec('New door', { broken: true, title: 'gone' }))).toBe(
      true,
    );
    expect(chip.textContent).toBe('New door');
    expect(chip.dataset.label).toBe('New door');
    expect(chip.classList.contains('citation-chip-broken')).toBe(true);
    expect(updateChip(chip, spec('New door'))).toBe(true);
    expect(chip.classList.contains('citation-chip-broken')).toBe(false);
    expect(chip.hasAttribute('title')).toBe(false);
  });
});

describe('renderParts / readParts', () => {
  it('text becomes text nodes and a <br> per break; chip becomes the <span>', () => {
    const el = editor();
    renderParts(
      el,
      [
        { type: 'text', text: 'a\nb ' },
        { type: 'chip', label: 'Door', url: URL },
        { type: 'text', text: ' end' },
      ],
      (part) => spec(part.label),
    );
    expect(shape(el)).toEqual(['"a"', 'br', '"b "', '[Door]', '" end"']);
  });

  it('reads back the same document (round trip)', () => {
    const el = editor();
    const parts = [
      { type: 'text', text: 'one\ntwo ' },
      { type: 'chip', label: 'Door', url: URL },
      { type: 'text', text: '\n\nend' },
    ] as const;
    renderParts(el, parts, (part) => spec(part.label));
    expect(readParts(el)).toEqual(parts);
  });

  it('a break at the end gets a filler <br> that the reading ignores', () => {
    const el = editor();
    renderParts(el, [{ type: 'text', text: 'a\n' }], () => spec('x'));
    expect(shape(el)).toEqual(['"a"', 'br', 'fill']);
    expect(readParts(el)).toEqual([{ type: 'text', text: 'a\n' }]);
  });

  it('syncFill removes the leftover filler and adds the missing one', () => {
    const el = editor();
    renderParts(el, [{ type: 'text', text: 'a\n' }], () => spec('x'));
    el.insertBefore(text('b'), el.lastChild);
    syncFill(el);
    expect(shape(el)).toEqual(['"a"', 'br', '"b"']);
    el.append(document.createElement('br'));
    syncFill(el);
    expect(shape(el)).toEqual(['"a"', 'br', '"b"', 'br', 'fill']);
  });

  it('reads <div>/<p> blocks as lines, discards formatting and swaps nbsp for a space', () => {
    const el = editor();
    el.append(text('a b'));
    const div = document.createElement('div');
    const bold = document.createElement('b');
    bold.append(text('bold'));
    div.append(bold);
    el.append(div);
    expect(readParts(el)).toEqual([{ type: 'text', text: 'a b\nbold' }]);
  });

  it('no children reads empty', () => {
    expect(readParts(editor())).toEqual([]);
  });
});

describe('chipBeside / caretAcross', () => {
  function setup() {
    const el = editor();
    const chip = chipOf('Door');
    const before = text('ab');
    const after = text('cd');
    el.append(before, chip, after);
    return { el, chip, before, after };
  }

  it('finds the chip next to the caret in each direction', () => {
    const { el, chip, before, after } = setup();
    expect(chipBeside(before, 2, 'forward')).toBe(chip);
    expect(chipBeside(after, 0, 'back')).toBe(chip);
    expect(chipBeside(el, 2, 'back')).toBe(chip);
    expect(chipBeside(el, 1, 'forward')).toBe(chip);
  });

  it('in the middle of the text, or on the other side, there is no chip', () => {
    const { before, after } = setup();
    expect(chipBeside(before, 1, 'forward')).toBeNull();
    expect(chipBeside(before, 2, 'back')).toBeNull();
    expect(chipBeside(after, 0, 'forward')).toBeNull();
    expect(chipBeside(after, 2, 'back')).toBeNull();
  });

  it('ignores empty text nodes between the caret and the chip', () => {
    const el = editor();
    const chip = chipOf('x');
    const empty = text('');
    const caret = text('');
    el.append(chip, empty, caret);
    expect(chipBeside(caret, 0, 'back')).toBe(chip);
  });

  it('caretAcross gives the point before or after the chip', () => {
    const { el, chip } = setup();
    expect(caretAcross(chip, 'back')).toEqual({ node: el, offset: 1 });
    expect(caretAcross(chip, 'forward')).toEqual({ node: el, offset: 2 });
  });
});

describe('triggerAt (@)', () => {
  const at = (data: string, offset = data.length, before?: Node) => {
    const el = editor();
    if (before) el.append(before);
    const node = text(data);
    el.append(node);
    return triggerAt(node, offset);
  };

  it('at the start, after a space and after a break', () => {
    expect(at('@bot')).toMatchObject({ start: 0, end: 4, term: 'bot' });
    expect(at('look @bot')).toMatchObject({ start: 5, term: 'bot' });
    expect(at('look\n@')).toMatchObject({ start: 5, term: '' });
    expect(at('@', 1, document.createElement('br'))).toMatchObject({ term: '' });
  });

  it('the term can have spaces (search with several words)', () => {
    expect(at('@button buy')).toMatchObject({ term: 'button buy' });
  });

  it('only counts up to the caret', () => {
    expect(at('@button', 3)).toMatchObject({ end: 3, term: 'bu' });
  });

  it('in the middle of a word (e-mail), after a chip, or too far, it does not open', () => {
    expect(at('a@b.com')).toBeNull();
    expect(at('@', 1, chipOf('x'))).toBeNull();
    expect(at(`@${'x'.repeat(41)}`)).toBeNull();
    expect(at('no at sign')).toBeNull();
    expect(at('@a @b')).toMatchObject({ term: 'b' });
  });
});

describe('placeChip / insertNodes / insertBreak', () => {
  it('chip in the middle of a word gets a space on both sides', () => {
    const el = editor();
    const node = text('abcd');
    el.append(node);
    const caret = placeChip(el, node.splitText(2), chipOf('X'));
    expect(shape(el)).toEqual(['"ab "', '[X]', '" "', '"cd"']);
    expect(caret).toEqual({ node: el.childNodes[2], offset: 1 });
  });

  it('already surrounded by space, does not duplicate; the caret goes after the existing space', () => {
    const el = editor();
    const a = text('ab ');
    const b = text(' cd');
    el.append(a, b);
    const caret = placeChip(el, b, chipOf('X'));
    expect(shape(el)).toEqual(['"ab "', '[X]', '" cd"']);
    expect(caret).toEqual({ node: b, offset: 1 });
  });

  it('at the start and at the end: only the trailing or leading space', () => {
    const el = editor();
    const caret = placeChip(el, null, chipOf('X'));
    expect(shape(el)).toEqual(['[X]', '" "']);
    expect(caret).toEqual({ node: el.lastChild, offset: 1 });
  });

  it('chip next to a chip gets a space in between', () => {
    const el = editor();
    el.append(chipOf('A'));
    placeChip(el, null, chipOf('B'));
    expect(shape(el)).toEqual(['[A]', '" "', '[B]', '" "']);
  });

  it('insertNodes puts the nodes before the reference and returns the caret after the last one', () => {
    const el = editor();
    const tail = text('end');
    el.append(tail);
    const t1 = text('look ');
    const chip = chipOf('X');
    const caret = insertNodes(el, tail, [t1, chip]);
    expect(shape(el)).toEqual(['"look "', '[X]', '"end"']);
    expect(caret).toEqual({ node: el, offset: 2 });
    expect(insertNodes(el, null, [text('z')])).toEqual({
      node: el.lastChild,
      offset: 1,
    });
  });

  it('insertBreak puts a <br> and the caret after it; at the end, it asks for the filler', () => {
    const el = editor();
    const node = text('ab');
    el.append(node);
    const caret = insertBreak(el, node.splitText(2));
    expect(shape(el)).toEqual(['"ab"', 'br', '""', 'fill']);
    expect(caret).toEqual({ node: el, offset: 2 });
  });

  it('endPoint stays before the filler', () => {
    const el = editor();
    renderParts(el, [{ type: 'text', text: 'a\n' }], () => spec('x'));
    expect(endPoint(el)).toEqual({ node: el, offset: 2 });
  });
});

describe('splitAt / clearIfBlank', () => {
  it('splitAt splits the text at the caret; on an element, it uses the child at the position', () => {
    const el = editor();
    const node = text('abcd');
    const chip = chipOf('X');
    el.append(node, chip);
    const inText = splitAt({ node, offset: 1 });
    expect(inText.parent).toBe(el);
    expect((inText.ref as Text).data).toBe('bcd');
    expect(node.data).toBe('a');
    expect(splitAt({ node: el, offset: 2 })).toEqual({ parent: el, ref: chip });
    expect(splitAt({ node: el, offset: 9 }).ref).toBeNull();
  });

  it('clearIfBlank clears the stray <br> that the browser leaves, but not the text nor the chip', () => {
    const el = editor();
    el.append(document.createElement('br'));
    expect(clearIfBlank(el)).toBe(true);
    expect(el.childNodes.length).toBe(0);
    expect(clearIfBlank(el)).toBe(false);
    el.append(text('a'), document.createElement('br'));
    expect(clearIfBlank(el)).toBe(false);
    expect(el.childNodes.length).toBe(2);
  });
});
