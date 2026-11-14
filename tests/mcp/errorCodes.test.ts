import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MCP_ERROR_CODES } from '../../mcp/errors';
import { mcpSources } from './sources';

// Registry of the server's error codes (phase 8.5, M9): `MCP_ERROR_CODES` (`mcp/errors.ts`)
// is the literal union that `ToolError` accepts (`tsc` refuses a code outside it); here we
// check that every code in the registry is documented for the agent (`docs/AGENT-GUIDE.md`)
// or for whoever installs (`docs/MCP.md`), that every literal of `new ToolError('…'` is in the
// registry and that the registry has no dead entry.

const docs = ['docs/AGENT-GUIDE.md', 'docs/MCP.md']
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
const registry: ReadonlySet<string> = new Set(MCP_ERROR_CODES);

/** Literal codes of `new ToolError('…'` in `mcp/**`. */
function literalCodes(): Map<string, string[]> {
  const codes = new Map<string, string[]>();
  for (const { file, code } of mcpSources()) {
    for (const match of code.matchAll(/new ToolError\(\s*(['"`])([^'"`]+)\1/g)) {
      codes.set(match[2]!, [...(codes.get(match[2]!) ?? []), file]);
    }
  }
  return codes;
}

describe('server error codes', () => {
  it('every code of new ToolError( is documented (in backticks)', () => {
    const codes = literalCodes();
    expect(codes.size).toBeGreaterThan(40);
    const missing = [...codes.keys()].filter((code) => !docs.includes(`\`${code}\``));
    expect(missing.sort()).toEqual([]);
  });

  it('every code in the registry is documented (in backticks)', () => {
    const missing = MCP_ERROR_CODES.filter((code) => !docs.includes(`\`${code}\``));
    expect(missing).toEqual([]);
  });

  it('every literal of new ToolError( is in the registry', () => {
    const outside = [...literalCodes().entries()]
      .filter(([code]) => !registry.has(code))
      .map(([code, files]) => `${code} (${files.join(', ')})`);
    expect(outside).toEqual([]);
  });

  it('the registry has no code that no module uses', () => {
    const used = mcpSources()
      .filter(({ file }) => file !== 'errors.ts')
      .map(({ code }) => code)
      .join('\n');
    const unused = MCP_ERROR_CODES.filter((code) => !used.includes(`'${code}'`));
    expect(unused).toEqual([]);
  });

  it('the registry is in alphabetical order and without repetition', () => {
    expect([...MCP_ERROR_CODES]).toEqual([...registry].sort());
  });
});
