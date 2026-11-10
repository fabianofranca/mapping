// O CLAUDE.md entra no contexto de toda sessão e de todo subagente: fica enxuto, e o processo de
// entrega mora no docs/PROCESS.md (etapa #1306).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');
const LIMIT = 15000;

describe('CLAUDE.md enxuto', () => {
  it(`tem até ${LIMIT} caracteres`, () => {
    expect(read('CLAUDE.md').length).toBeLessThanOrEqual(LIMIT);
  });

  it('aponta para o docs/PROCESS.md no topo e no resumo do fluxo', () => {
    const claude = read('CLAUDE.md');
    const projeto = claude.slice(
      claude.indexOf('## Projeto'),
      claude.indexOf('## Stack'),
    );
    expect(projeto).toContain('docs/PROCESS.md');
    const resumo = claude.slice(claude.indexOf('## Fluxo de trabalho (resumo)'));
    expect(resumo).toContain('docs/PROCESS.md');
  });

  it('o docs/PROCESS.md tem as seções movidas', () => {
    const process = read('docs/PROCESS.md');
    for (const title of ['## Fluxo de trabalho', '## Uso de modelos', '## Etapas']) {
      expect(process, title).toContain(title);
    }
  });

  it('o docs/PROCESS.md tem até 25 mil bytes e o passo a passo movido está no docs/FLOW.md (etapa #1306, LC2)', () => {
    expect(Buffer.byteLength(read('docs/PROCESS.md'))).toBeLessThanOrEqual(25000);
    const flow = read('docs/FLOW.md');
    for (const title of [
      '## Orquestrador — passo a passo',
      '## Bug: busca de duplicadas',
      '## Bug: corpo e evidência',
      '## Evidência de bug',
      '## CI e preview',
    ]) {
      expect(flow, title).toContain(title);
    }
    const process = read('docs/PROCESS.md');
    expect(process).not.toContain('git worktree add');
    expect(process).toContain('docs/FLOW.md');
    // cada ponteiro do PROCESS.md aponta para um título que existe no FLOW.md
    for (const title of [
      'Orquestrador — passo a passo',
      'Bug: busca de duplicadas',
      'Bug: corpo e evidência',
      'Evidência de bug',
      'CI e preview',
    ]) {
      expect(process, title).toContain(title);
    }
  });
});
