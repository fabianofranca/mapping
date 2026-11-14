// @vitest-environment node
// Test-first stage (TP2): the `complexity` rule (limit 10, level `error`) applies in `src/**` and
// `mcp/**`; `tests/`, `scripts/`, `viewer/` and `pwa/` are left out. The legacy above the limit is in
// `eslint-suppressions.json` (the per-file count only goes down). This test proves the rule catches it.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

/** Function with `ifs` branches: cyclomatic complexity `ifs + 1`. */
function withBranches(ifs: number): string {
  const body = Array.from(
    { length: ifs },
    (_, i) => `  if (n === ${i}) return ${i};`,
  ).join('\n');
  return `export function f(n: number): number {\n${body}\n  return -1;\n}\n`;
}

/** Messages of the `complexity` rule when linting `code` as if it were the file `filePath`. */
async function complexityMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'complexity');
}

describe('complexity rule (limit 10)', () => {
  it('a function with complexity 11 in src/model/ is an error', async () => {
    const messages = await complexityMessages(withBranches(10), 'src/model/__new.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
    expect(messages[0]?.message).toContain('11');
  });

  it('a function with complexity 10 passes', async () => {
    expect(await complexityMessages(withBranches(9), 'src/model/__new.ts')).toEqual([]);
  });

  it('also applies in src/ui/ (tsx) and in mcp/', async () => {
    expect(await complexityMessages(withBranches(10), 'src/ui/__New.tsx')).toHaveLength(
      1,
    );
    expect(await complexityMessages(withBranches(10), 'mcp/__new.ts')).toHaveLength(1);
  });

  it.each([
    'tests/model/__new.test.ts',
    'scripts/__new.ts',
    'viewer/__new.ts',
    'pwa/__new.js',
  ])('does not apply in %s', async (filePath) => {
    const code = filePath.endsWith('.js')
      ? withBranches(10).replace(': number', '').replace('(n:', '(n')
      : withBranches(10);
    expect(await complexityMessages(code, filePath)).toEqual([]);
  });
});
