import { fireEvent } from '@testing-library/preact';

// Ajudantes dos testes do editor de citações: o jsdom não tem `execCommand` nem digitação real,
// então o teste mexe no DOM do `contenteditable` (nós de texto, cursor na `Selection`) e dispara
// o `input`, que é o que o editor lê.

/** O ponto de inserção: a seleção, se estiver dentro do editor; senão, o fim dele. */
function currentRange(editor: HTMLElement): Range {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (range && editor.contains(range.startContainer)) return range;
  const end = document.createRange();
  end.selectNodeContents(editor);
  end.collapse(false);
  return end;
}

export function setCaret(node: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Cursor no fim do conteúdo, antes do `<br>` de preenchimento. */
export function caretAtEnd(editor: HTMLElement): void {
  let count = editor.childNodes.length;
  while (
    count > 0 &&
    (editor.childNodes[count - 1] as Element).hasAttribute?.('data-fill')
  )
    count--;
  const last = editor.childNodes[count - 1];
  if (last?.nodeType === 3) setCaret(last, (last as Text).length);
  else setCaret(editor, count);
}

/** Digita `text` no cursor (no fim, se não houver cursor no editor) e dispara `input`. */
export function typeIn(editor: HTMLElement, text: string): void {
  editor.focus();
  const range = currentRange(editor);
  const { startContainer: node, startOffset: offset } = range;
  if (node.nodeType === 3) {
    (node as Text).insertData(offset, text);
    setCaret(node, offset + text.length);
  } else {
    const added = document.createTextNode(text);
    node.insertBefore(added, node.childNodes[offset] ?? null);
    setCaret(added, text.length);
  }
  fireEvent.input(editor, { inputType: 'insertText', data: text });
}

export function keyDown(
  editor: HTMLElement,
  key: string,
  init: KeyboardEventInit = {},
): boolean {
  return fireEvent.keyDown(editor, { key, ...init });
}

/** Cola `text` como texto puro no cursor. */
export function pasteText(editor: HTMLElement, text: string): boolean {
  editor.focus();
  return fireEvent.paste(editor, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
}

export const chipsOf = (editor: HTMLElement): HTMLElement[] => [
  ...editor.querySelectorAll<HTMLElement>('span[data-url]'),
];
