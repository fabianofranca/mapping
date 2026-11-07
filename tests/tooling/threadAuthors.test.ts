import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Catraca de autoria (etapa Comentários, decisão 12): `kind` nunca vem do chamador. O código da
// app (`src/**`) só monta autor `human`, com a identidade das Configurações; o servidor MCP
// (`mcp/**`) só monta `agent`, com `email: null` (a CM6 liga essa metade). Quem aparece aqui
// como "monta" é o literal `kind: 'human'` / `kind: 'agent'` (a comparação `=== 'agent'` e os
// tipos não contam). No molde de `applyAcceptedCallers.test.ts`.

const ROOT = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function assembling(dir: string, kind: 'human' | 'agent'): string[] {
  const pattern = new RegExp(`\\bkind:\\s*['"]${kind}['"]`);
  return sourceFiles(join(ROOT, dir))
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(ROOT.length + 1).replaceAll('\\', '/'))
    .sort();
}

/**
 * O que cada raiz pode montar. A CM6 acrescenta `{ dir: 'mcp', kind: 'agent', allowed: [...] }`
 * e `{ dir: 'mcp', kind: 'human', allowed: [] }` aqui.
 */
const RULES: readonly {
  readonly dir: string;
  readonly kind: 'human' | 'agent';
  readonly allowed: readonly string[];
}[] = [
  { dir: 'src', kind: 'agent', allowed: [] },
  // O modelo (src/model) não monta autor: valida e ordena. Só a ação da app monta o `human`.
  { dir: 'src', kind: 'human', allowed: ['src/store/threadActions.ts'] },
];

describe('catraca de autoria das conversas', () => {
  it.each(RULES)(
    '$dir só monta autor $kind onde está liberado',
    ({ dir, kind, allowed }) => {
      expect(assembling(dir, kind)).toEqual([...allowed].sort());
    },
  );

  it('a ação da app monta o autor human com a identidade, e nenhum outro lugar de src/', () => {
    const actions = readFileSync(join(ROOT, 'src/store/threadActions.ts'), 'utf8');
    expect(actions).toMatch(/kind:\s*'human'/);
    expect(actions).toMatch(/email:\s*me\.email/);
  });
});
