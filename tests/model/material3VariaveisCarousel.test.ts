// VL2 da etapa "variáveis no formato 4" (#1504): o `carousel.json` da material3-compose escreve cada
// subexpressão longa uma vez, num `let`, e a usa com `$var`, em vez de repetir o trecho (eram 107 kB
// formatado, quase todo repetição). O teste lê o arquivo como está (com `let` e `$var`), não o
// componente já trocado pelo `parseComponent`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseComponentText } from '../../src/model/components/parseComponent';

const FILE = 'libraries/material3-compose/components/carousel.json';
const text = readFileSync(FILE, 'utf8');
const file = JSON.parse(text) as { template: { let?: Record<string, unknown> } };

/** O tamanho, em caracteres, a partir do qual uma subexpressão não pode se repetir. */
const MAX_REPEATED_CHARS = 200;

/** Toda subexpressão (objeto ou lista) do arquivo, serializada, com as de dentro dos `let`. */
function subexpressions(node: unknown, found: string[] = []): string[] {
  if (typeof node !== 'object' || node === null) return found;
  found.push(JSON.stringify(node));
  for (const child of Array.isArray(node) ? node : Object.values(node))
    subexpressions(child, found);
  return found;
}

describe('carousel.json com variáveis (let e $var)', () => {
  it('nenhuma subexpressão de mais de 200 caracteres aparece mais de uma vez', () => {
    const counts = new Map<string, number>();
    for (const sub of subexpressions(file)) {
      if (sub.length > MAX_REPEATED_CHARS) counts.set(sub, (counts.get(sub) ?? 0) + 1);
    }
    const repeated = [...counts]
      .filter(([, n]) => n > 1)
      .map(([sub, n]) => `${n}× ${sub.slice(0, 120)}…`);
    expect(repeated).toEqual([]);
  });

  it('declara variáveis no quadro raiz e todas são usadas', () => {
    const declared = Object.keys(file.template.let ?? {});
    expect(declared.length).toBeGreaterThan(0);
    const used = new Set([...text.matchAll(/"\$var":\s*"([^"]+)"/g)].map((m) => m[1]));
    expect(declared.filter((name) => !used.has(name))).toEqual([]);
  });

  it('o componente é válido, sem erro nem aviso, e o lido não tem let nem $var', () => {
    const result = parseComponentText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings ?? []).toEqual([]);
    const expanded = JSON.stringify(result.component);
    expect(expanded).not.toContain('"let"');
    expect(expanded).not.toContain('"$var"');
  });

  it('o arquivo formatado fica abaixo de 60 kB (era 107 kB sem variáveis)', () => {
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(60_000);
  });
});
