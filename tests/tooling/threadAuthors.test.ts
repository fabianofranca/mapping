import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Authorship ratchet (Comments stage, decision 12): `kind` never comes from the caller. The
// app code (`src/**`) only builds a `human` author, with the identity from Settings; the MCP server
// (`mcp/**`) only builds `agent`, with `email: null`. What shows up here
// as "builds" is the literal `kind: 'human'` / `kind: 'agent'` (the comparison `=== 'agent'` and the
// types do not count). Modeled on `applyAcceptedCallers.test.ts`.

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
 * What each root may build.
 */
const RULES: readonly {
  readonly dir: string;
  readonly kind: 'human' | 'agent';
  readonly allowed: readonly string[];
}[] = [
  { dir: 'src', kind: 'agent', allowed: [] },
  // The MCP server only builds an agent author, in a single function; never human.
  { dir: 'mcp', kind: 'agent', allowed: ['mcp/threads.ts'] },
  { dir: 'mcp', kind: 'human', allowed: [] },
  // The model (src/model) does not build an author: it validates and sorts. Only the app action builds the `human`.
  { dir: 'src', kind: 'human', allowed: ['src/store/threadActions.ts'] },
];

describe('authorship ratchet of the threads', () => {
  it.each(RULES)(
    '$dir only builds author $kind where it is allowed',
    ({ dir, kind, allowed }) => {
      expect(assembling(dir, kind)).toEqual([...allowed].sort());
    },
  );

  it('the app action builds the human author with the identity, and no other place in src/', () => {
    const actions = readFileSync(join(ROOT, 'src/store/threadActions.ts'), 'utf8');
    expect(actions).toMatch(/kind:\s*'human'/);
    expect(actions).toMatch(/email:\s*me\.email/);
  });
});
