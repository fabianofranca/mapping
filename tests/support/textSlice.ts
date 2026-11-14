// Text slices for the tests that read the skills and the flow docs. A missing anchor throws an
// error: a text test never passes silently for not having found the passage (stage #1384, decision 11).

/** Text of a heading (`## ` or `### `) up to the next one of the same level or above. */
export function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === heading);
  if (start < 0) throw new Error(`section not found: ${heading}`);
  const level = heading.match(/^#+/)![0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i]!.match(/^(#+) /);
    if (m && m[1]!.length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Text from `start` (inclusive) to `end` (exclusive), with `end` searched after `start`. */
export function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`start anchor not found: ${start}`);
  const to = text.indexOf(end, from + start.length);
  if (to < 0) throw new Error(`end anchor not found after "${start}": ${end}`);
  return text.slice(from, to);
}
