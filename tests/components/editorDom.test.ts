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

// Funções puras de DOM do editor de citações (etapa Comentários, CM5, decisão 30). Rodam no jsdom
// sobre um `<div>` solto: seleção e cursor reais ficam para o e2e.

const URL = 'mapping://p/m/ab';
const spec = (name: string, extra: Partial<ChipSpec> = {}): ChipSpec => ({
  url: URL,
  name,
  broken: false,
  ariaLabel: `${name}, citação`,
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
  it('monta o <span> não editável com os dados e o nome acessível, sem HTML cru', () => {
    const chip = createChip(document, spec('Porta'));
    expect(chip.tagName).toBe('SPAN');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.getAttribute('role')).toBe('img');
    expect(chip.getAttribute('aria-label')).toBe('Porta, citação');
    expect(chip.dataset.url).toBe(URL);
    expect(chip.dataset.label).toBe('Porta');
    expect(chip.className).toBe('citation-chip citation-chip-editor');
    expect(chip.textContent).toBe('Porta');
    expect(chip.children).toHaveLength(0);
  });

  it('o nome com < e & fica texto, não vira elemento', () => {
    const chip = createChip(document, spec('<b>x</b> & y'));
    expect(chip.children).toHaveLength(0);
    expect(chip.textContent).toBe('<b>x</b> & y');
  });

  it('quebrado: classe de riscado e a dica', () => {
    const chip = createChip(document, spec('Velha', { broken: true, title: 'sumiu' }));
    expect(chip.classList.contains('citation-chip-broken')).toBe(true);
    expect(chip.getAttribute('title')).toBe('sumiu');
  });

  it('updateChip troca nome e estado e diz se mudou algo', () => {
    const chip = createChip(document, spec('Porta'));
    expect(updateChip(chip, spec('Porta'))).toBe(false);
    expect(updateChip(chip, spec('Porta nova', { broken: true, title: 'sumiu' }))).toBe(
      true,
    );
    expect(chip.textContent).toBe('Porta nova');
    expect(chip.dataset.label).toBe('Porta nova');
    expect(chip.classList.contains('citation-chip-broken')).toBe(true);
    expect(updateChip(chip, spec('Porta nova'))).toBe(true);
    expect(chip.classList.contains('citation-chip-broken')).toBe(false);
    expect(chip.hasAttribute('title')).toBe(false);
  });
});

describe('renderParts / readParts', () => {
  it('texto vira nós de texto e <br> por quebra; chip vira o <span>', () => {
    const el = editor();
    renderParts(
      el,
      [
        { type: 'text', text: 'a\nb ' },
        { type: 'chip', label: 'Porta', url: URL },
        { type: 'text', text: ' fim' },
      ],
      (part) => spec(part.label),
    );
    expect(shape(el)).toEqual(['"a"', 'br', '"b "', '[Porta]', '" fim"']);
  });

  it('lê de volta o mesmo documento (ida e volta)', () => {
    const el = editor();
    const parts = [
      { type: 'text', text: 'um\ndois ' },
      { type: 'chip', label: 'Porta', url: URL },
      { type: 'text', text: '\n\nfim' },
    ] as const;
    renderParts(el, parts, (part) => spec(part.label));
    expect(readParts(el)).toEqual(parts);
  });

  it('quebra no fim ganha um <br> de preenchimento que a leitura ignora', () => {
    const el = editor();
    renderParts(el, [{ type: 'text', text: 'a\n' }], () => spec('x'));
    expect(shape(el)).toEqual(['"a"', 'br', 'fill']);
    expect(readParts(el)).toEqual([{ type: 'text', text: 'a\n' }]);
  });

  it('syncFill tira o preenchimento que ficou sobrando e põe o que falta', () => {
    const el = editor();
    renderParts(el, [{ type: 'text', text: 'a\n' }], () => spec('x'));
    el.insertBefore(text('b'), el.lastChild);
    syncFill(el);
    expect(shape(el)).toEqual(['"a"', 'br', '"b"']);
    el.append(document.createElement('br'));
    syncFill(el);
    expect(shape(el)).toEqual(['"a"', 'br', '"b"', 'br', 'fill']);
  });

  it('lê blocos <div>/<p> como linhas, descarta formatação e troca nbsp por espaço', () => {
    const el = editor();
    el.append(text('a b'));
    const div = document.createElement('div');
    const bold = document.createElement('b');
    bold.append(text('negrito'));
    div.append(bold);
    el.append(div);
    expect(readParts(el)).toEqual([{ type: 'text', text: 'a b\nnegrito' }]);
  });

  it('sem filhos lê vazio', () => {
    expect(readParts(editor())).toEqual([]);
  });
});

describe('chipBeside / caretAcross', () => {
  function setup() {
    const el = editor();
    const chip = chipOf('Porta');
    const before = text('ab');
    const after = text('cd');
    el.append(before, chip, after);
    return { el, chip, before, after };
  }

  it('acha o chip colado ao cursor em cada sentido', () => {
    const { el, chip, before, after } = setup();
    expect(chipBeside(before, 2, 'forward')).toBe(chip);
    expect(chipBeside(after, 0, 'back')).toBe(chip);
    expect(chipBeside(el, 2, 'back')).toBe(chip);
    expect(chipBeside(el, 1, 'forward')).toBe(chip);
  });

  it('no meio do texto, ou do outro lado, não há chip', () => {
    const { before, after } = setup();
    expect(chipBeside(before, 1, 'forward')).toBeNull();
    expect(chipBeside(before, 2, 'back')).toBeNull();
    expect(chipBeside(after, 0, 'forward')).toBeNull();
    expect(chipBeside(after, 2, 'back')).toBeNull();
  });

  it('ignora nós de texto vazios entre o cursor e o chip', () => {
    const el = editor();
    const chip = chipOf('x');
    const empty = text('');
    const caret = text('');
    el.append(chip, empty, caret);
    expect(chipBeside(caret, 0, 'back')).toBe(chip);
  });

  it('caretAcross dá o ponto antes ou depois do chip', () => {
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

  it('no começo, depois de espaço e depois de quebra', () => {
    expect(at('@bot')).toMatchObject({ start: 0, end: 4, term: 'bot' });
    expect(at('veja @bot')).toMatchObject({ start: 5, term: 'bot' });
    expect(at('veja\n@')).toMatchObject({ start: 5, term: '' });
    expect(at('@', 1, document.createElement('br'))).toMatchObject({ term: '' });
  });

  it('o termo pode ter espaços (busca com várias palavras)', () => {
    expect(at('@botão comprar')).toMatchObject({ term: 'botão comprar' });
  });

  it('só vale até o cursor', () => {
    expect(at('@botão', 3)).toMatchObject({ end: 3, term: 'bo' });
  });

  it('no meio de palavra (e-mail), depois de chip, ou longe demais, não abre', () => {
    expect(at('a@b.com')).toBeNull();
    expect(at('@', 1, chipOf('x'))).toBeNull();
    expect(at(`@${'x'.repeat(41)}`)).toBeNull();
    expect(at('sem arroba')).toBeNull();
    expect(at('@a @b')).toMatchObject({ term: 'b' });
  });
});

describe('placeChip / insertNodes / insertBreak', () => {
  it('chip no meio de uma palavra ganha espaço dos dois lados', () => {
    const el = editor();
    const node = text('abcd');
    el.append(node);
    const caret = placeChip(el, node.splitText(2), chipOf('X'));
    expect(shape(el)).toEqual(['"ab "', '[X]', '" "', '"cd"']);
    expect(caret).toEqual({ node: el.childNodes[2], offset: 1 });
  });

  it('já cercado de espaço, não duplica; o cursor vai depois do espaço que existe', () => {
    const el = editor();
    const a = text('ab ');
    const b = text(' cd');
    el.append(a, b);
    const caret = placeChip(el, b, chipOf('X'));
    expect(shape(el)).toEqual(['"ab "', '[X]', '" cd"']);
    expect(caret).toEqual({ node: b, offset: 1 });
  });

  it('no começo e no fim: só o espaço de trás ou de frente', () => {
    const el = editor();
    const caret = placeChip(el, null, chipOf('X'));
    expect(shape(el)).toEqual(['[X]', '" "']);
    expect(caret).toEqual({ node: el.lastChild, offset: 1 });
  });

  it('chip ao lado de chip ganha um espaço no meio', () => {
    const el = editor();
    el.append(chipOf('A'));
    placeChip(el, null, chipOf('B'));
    expect(shape(el)).toEqual(['[A]', '" "', '[B]', '" "']);
  });

  it('insertNodes põe os nós antes da referência e devolve o cursor depois do último', () => {
    const el = editor();
    const tail = text('fim');
    el.append(tail);
    const t1 = text('olha ');
    const chip = chipOf('X');
    const caret = insertNodes(el, tail, [t1, chip]);
    expect(shape(el)).toEqual(['"olha "', '[X]', '"fim"']);
    expect(caret).toEqual({ node: el, offset: 2 });
    expect(insertNodes(el, null, [text('z')])).toEqual({
      node: el.lastChild,
      offset: 1,
    });
  });

  it('insertBreak põe um <br> e o cursor depois dele; no fim, pede o preenchimento', () => {
    const el = editor();
    const node = text('ab');
    el.append(node);
    const caret = insertBreak(el, node.splitText(2));
    expect(shape(el)).toEqual(['"ab"', 'br', '""', 'fill']);
    expect(caret).toEqual({ node: el, offset: 2 });
  });

  it('endPoint fica antes do preenchimento', () => {
    const el = editor();
    renderParts(el, [{ type: 'text', text: 'a\n' }], () => spec('x'));
    expect(endPoint(el)).toEqual({ node: el, offset: 2 });
  });
});

describe('splitAt / clearIfBlank', () => {
  it('splitAt parte o texto no cursor; em elemento, usa o filho da posição', () => {
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

  it('clearIfBlank limpa o <br> solto que o navegador deixa, mas não o texto nem o chip', () => {
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
