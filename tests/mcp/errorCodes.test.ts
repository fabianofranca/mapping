import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MCP_ERROR_CODES } from '../../mcp/errors';
import { mcpSources } from './sources';

// Registro dos códigos de erro do servidor (fase 8.5, M9): `MCP_ERROR_CODES` (`mcp/errors.ts`)
// é a união literal que o `ToolError` aceita (o `tsc` recusa um código fora dela); aqui se
// confere que todo código do registro está documentado para o agente (`docs/AGENT-GUIDE.md`)
// ou para quem instala (`docs/MCP.md`), que todo literal de `new ToolError('…'` está no
// registro e que o registro não tem entrada morta.

const docs = ['docs/AGENT-GUIDE.md', 'docs/MCP.md']
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
const registry: ReadonlySet<string> = new Set(MCP_ERROR_CODES);

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

  it('todo código do registro está documentado (entre crases)', () => {
    const missing = MCP_ERROR_CODES.filter((code) => !docs.includes(`\`${code}\``));
    expect(missing).toEqual([]);
  });

  it('todo literal de new ToolError( está no registro', () => {
    const outside = [...literalCodes().entries()]
      .filter(([code]) => !registry.has(code))
      .map(([code, files]) => `${code} (${files.join(', ')})`);
    expect(outside).toEqual([]);
  });

  it('o registro não tem código que nenhum módulo usa', () => {
    const used = mcpSources()
      .filter(({ file }) => file !== 'errors.ts')
      .map(({ code }) => code)
      .join('\n');
    const unused = MCP_ERROR_CODES.filter((code) => !used.includes(`'${code}'`));
    expect(unused).toEqual([]);
  });

  it('o registro está em ordem alfabética e sem repetição', () => {
    expect([...MCP_ERROR_CODES]).toEqual([...registry].sort());
  });
});
