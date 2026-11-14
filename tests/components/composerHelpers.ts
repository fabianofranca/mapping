import { fireEvent } from '@testing-library/preact';

// Helpers for the citation editor tests: jsdom has neither `execCommand` nor real typing,
// so the test changes the `contenteditable` DOM (text nodes, caret in the `Selection`) and fires
// the `input`, which is what the editor reads.

/** The insertion point: the selection, if it is inside the editor; otherwise, its end. */
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

/** Caret at the end of the content, before the filler `<br>`. */
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

/** Types `text` at the caret (at the end, if there is no caret in the editor) and fires `input`. */
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
