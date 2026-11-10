// Recortes de texto para os testes que leem os skills e os docs do fluxo. Falta de âncora lança
// erro: um teste de texto nunca passa em silêncio por não ter achado o trecho (etapa #1384, decisão 11).

/** Texto de um cabeçalho (`## ` ou `### `) até o próximo do mesmo nível ou acima. */
export function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === heading);
  if (start < 0) throw new Error(`seção não achada: ${heading}`);
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

/** Texto de `start` (inclusive) até `end` (exclusive), com `end` procurada depois de `start`. */
export function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`âncora inicial não achada: ${start}`);
  const to = text.indexOf(end, from + start.length);
  if (to < 0) throw new Error(`âncora final não achada depois de "${start}": ${end}`);
  return text.slice(from, to);
}
