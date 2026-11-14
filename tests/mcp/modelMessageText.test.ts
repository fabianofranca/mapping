import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../../src/model/catalog';
import { loadSpecComponents } from '../../src/model';
import { testSpec, SPEC_FILE } from '../model/componentFixtures';

// The MCP keeps the usual message text (#945): the code and the parameters are an addition
// of the model for the interface; `problems` (read by mcp/) remains a list of text.
describe('text of the model messages read by the MCP', () => {
  it('problems stays as plain text, paired with problemMessages', () => {
    const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, () => undefined);
    expect(loaded.problems.length).toBeGreaterThan(0);
    expect(loaded.problems.every((p) => typeof p === 'string')).toBe(true);
    expect(loaded.problems[0]).toMatch(/: missing file \(specs\/test\/components\//);
    expect(loaded.problemMessages.map((m) => m.text)).toEqual(loaded.problems);
  });

  it('buildCatalog exists for the MCP and the interface', () => {
    expect(typeof buildCatalog).toBe('function');
  });
});
