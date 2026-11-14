// KDoc: the text of each `@param name …` (continuation lines collapsed into one text, without the
// margin `*` and with normalized whitespace). Other tags (`@sample`, `@return`) end the `@param`.

const PARAM_TAG = /^@param(?:\[(\w+)\]|\s+(\w+))\s*(.*)$/;

// The text of a KDoc line, without the margin (the opening, the asterisk and the closing).
function stripMargin(line: string): string {
  return line
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .replace(/^\s*\*+ ?/, '')
    .trim();
}

/** Parameter name → `@param` text, in the order they appear. */
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
