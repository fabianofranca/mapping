// @vitest-environment node
// Etapa teste-primeiro (TP2): a regra `complexity` (limite 10, nível `error`) vale em `src/**` e
// `mcp/**`; `tests/`, `scripts/`, `viewer/` e `pwa/` ficam fora. O legado acima do limite está em
// `eslint-suppressions.json` (a contagem por arquivo só cai). Este teste prova que a regra pega.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

/** Função com `ifs` desvios: complexidade ciclomática `ifs + 1`. */
function withBranches(ifs: number): string {
  const body = Array.from(
    { length: ifs },
    (_, i) => `  if (n === ${i}) return ${i};`,
  ).join('\n');
  return `export function f(n: number): number {\n${body}\n  return -1;\n}\n`;
}

/** Mensagens da regra `complexity` ao lintar `code` como se fosse o arquivo `filePath`. */
async function complexityMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'complexity');
}

describe('regra complexity (limite 10)', () => {
  it('função com complexidade 11 em src/model/ é erro', async () => {
    const messages = await complexityMessages(withBranches(10), 'src/model/__novo.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
    expect(messages[0]?.message).toContain('11');
  });

  it('função com complexidade 10 passa', async () => {
    expect(await complexityMessages(withBranches(9), 'src/model/__novo.ts')).toEqual([]);
  });

  it('vale também em src/ui/ (tsx) e em mcp/', async () => {
    expect(await complexityMessages(withBranches(10), 'src/ui/__Novo.tsx')).toHaveLength(
      1,
    );
    expect(await complexityMessages(withBranches(10), 'mcp/__novo.ts')).toHaveLength(1);
  });

  it.each([
    'tests/model/__novo.test.ts',
    'scripts/__novo.ts',
    'viewer/__novo.ts',
    'pwa/__novo.js',
  ])('não vale em %s', async (filePath) => {
    const code = filePath.endsWith('.js')
      ? withBranches(10).replace(': number', '').replace('(n:', '(n')
      : withBranches(10);
    expect(await complexityMessages(code, filePath)).toEqual([]);
  });
});
