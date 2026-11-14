// Swift documentation: the text of each `- Parameter name: …` and of each item of `- Parameters:`,
// and the summary (the first paragraph). Both `///` (attached lines, already joined by the
// tokenizer) and `/** */` are read. Continuation lines collapse into a single text; other lists
// (`- Returns:`) end it.

// The comment lines without the markers (the triple slash, the block opening and closing and the
// margin asterisk), keeping the indentation of what follows.
function lines(raw: string): string[] {
  const block = raw.trimStart().startsWith('/*');
  return raw.split('\n').map((line) =>
    block
      ? line
          .replace(/^\s*\/\*+ ?/, '')
          .replace(/\s*\*+\/\s*$/, '')
          .replace(/^\s*\* ?/, '')
      : line.replace(/^\s*\/\/\/ ?/, ''),
  );
}

const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const SINGLE = /^parameter\s+`?(\w+)`?\s*:\s*(.*)$/i;
const GROUP = /^parameters\s*:\s*$/i;
const NAMED = /^`?(\w+)`?\s*:\s*(.*)$/;

interface Reading {
  docs: Map<string, string>;
  current: string | undefined;
  /** The indentation of the open `- Parameters:`; -1 when there is none. */
  group: number;
}

function readBullet(state: Reading, indent: number, body: string): void {
  const single = SINGLE.exec(body);
  if (single !== null) {
    state.current = single[1]!;
    state.docs.set(state.current, single[2]!);
    state.group = -1;
    return;
  }
  const named = state.group >= 0 && indent > state.group ? NAMED.exec(body) : null;
  if (named !== null) {
    state.current = named[1]!;
    state.docs.set(state.current, named[2]!);
    return;
  }
  state.current = undefined;
  state.group = GROUP.test(body) ? indent : -1;
}

/** Parameter name → text, in the order they appear. */
export function parseParamDocs(raw: string | undefined): Map<string, string> {
  const state: Reading = { docs: new Map(), current: undefined, group: -1 };
  if (raw === undefined) return state.docs;
  for (const line of lines(raw)) {
    const bullet = BULLET.exec(line);
    if (bullet !== null) readBullet(state, bullet[1]!.length, bullet[2]!);
    else if (line.trim() === '') state.current = undefined;
    else if (state.current !== undefined) {
      state.docs.set(state.current, `${state.docs.get(state.current)!} ${line.trim()}`);
    }
  }
  for (const [name, text] of state.docs)
    state.docs.set(name, text.replace(/\s+/g, ' ').trim());
  return state.docs;
}

/** The first paragraph (up to the first blank line or list), on a single line; `undefined` if there is none. */
export function summaryOf(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const paragraph: string[] = [];
  for (const line of lines(raw)) {
    if (BULLET.test(line) || (line.trim() === '' && paragraph.length > 0)) break;
    if (line.trim() !== '') paragraph.push(line.trim());
  }
  const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
  return text === '' ? undefined : text;
}
