// Documentação Swift: o texto de cada `- Parameter nome: …` e de cada item de `- Parameters:`, e o
// resumo (o primeiro parágrafo). Entra o `///` (linhas coladas, já unidas pelo tokenizador) e o
// `/** */`. As linhas de continuação se recolhem num texto só; outras listas (`- Returns:`) encerram.

// As linhas do comentário sem os marcadores (a barra tripla, a abertura e o fechamento do bloco e o
// asterisco da margem), com a indentação do que vem depois.
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
  /** A indentação do `- Parameters:` aberto; -1 quando não há. */
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

/** Nome do parâmetro → texto, na ordem em que aparecem. */
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

/** O primeiro parágrafo (até a primeira linha em branco ou lista), numa linha só; `undefined` se não há. */
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
