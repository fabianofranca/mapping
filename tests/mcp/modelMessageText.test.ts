import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../../src/model/catalog';
import { loadSpecComponents } from '../../src/model';
import { testSpec, SPEC_FILE } from '../model/componentFixtures';

// O MCP segue com o texto pt-BR de sempre (#945): o código e os parâmetros são um acréscimo
// do modelo para a interface; `problems` (lido por mcp/) continua uma lista de texto.
describe('texto das mensagens do modelo lido pelo MCP', () => {
  it('problems segue em texto pt-BR, pareado com problemMessages', () => {
    const loaded = loadSpecComponents(testSpec(), SPEC_FILE, 1, () => undefined);
    expect(loaded.problems.length).toBeGreaterThan(0);
    expect(loaded.problems.every((p) => typeof p === 'string')).toBe(true);
    expect(loaded.problems[0]).toMatch(/: arquivo ausente \(specs\/test\/components\//);
    expect(loaded.problemMessages.map((m) => m.text)).toEqual(loaded.problems);
  });

  it('buildCatalog existe para o MCP e a interface', () => {
    expect(typeof buildCatalog).toBe('function');
  });
});
