// KDoc: o texto de cada `@param nome …` (as linhas de continuação recolhidas num texto só, sem o
// `*` da margem e com os espaços normalizados). Outras tags (`@sample`, `@return`) encerram o `@param`.

const PARAM_TAG = /^@param(?:\[(\w+)\]|\s+(\w+))\s*(.*)$/;

// O texto de uma linha do KDoc, sem a margem (a abertura, o asterisco e o fechamento).
function stripMargin(line: string): string {
  return line
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .replace(/^\s*\*+ ?/, '')
    .trim();
}

/** Nome do parâmetro → texto do `@param`, na ordem em que aparecem. */
export function parseParamDocs(raw: string | undefined): Map<string, string> {
  const docs = new Map<string, string>();
  if (raw === undefined) return docs;
  let current: string | undefined;
  for (const line of raw.split('\n').map(stripMargin)) {
    const tag = PARAM_TAG.exec(line);
    if (tag !== null) {
      current = tag[1] ?? tag[2]!;
      docs.set(current, tag[3]!);
    } else if (line.startsWith('@')) {
      current = undefined;
    } else if (current !== undefined && line !== '') {
      docs.set(current, `${docs.get(current)!} ${line}`);
    }
  }
  for (const [name, text] of docs) docs.set(name, text.replace(/\s+/g, ' ').trim());
  return docs;
}
