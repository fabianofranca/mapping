import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mcpSources } from './sources';

// Registro dos códigos de erro do servidor (fase 8.5, M9): todo código que uma tool devolve
// está documentado para o agente (`docs/AGENT-GUIDE.md`) ou para quem instala (`docs/MCP.md`).

const docs = ['docs/AGENT-GUIDE.md', 'docs/MCP.md']
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/** Códigos literais de `new ToolError('…'` em `mcp/**`. */
function literalCodes(): Map<string, string[]> {
  const codes = new Map<string, string[]>();
  for (const { file, code } of mcpSources()) {
    for (const match of code.matchAll(/new ToolError\(\s*(['"`])([^'"`]+)\1/g)) {
      codes.set(match[2]!, [...(codes.get(match[2]!) ?? []), file]);
    }
  }
  return codes;
}

describe('códigos de erro do servidor', () => {
  it('todo código de new ToolError( está documentado (entre crases)', () => {
    const codes = literalCodes();
    expect(codes.size).toBeGreaterThan(40);
    const missing = [...codes.keys()].filter((code) => !docs.includes(`\`${code}\``));
    expect(missing.sort()).toEqual([]);
  });
});
