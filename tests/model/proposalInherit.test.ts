import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  parseProposal,
  renameAnnotation,
  serializeProposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, decided, propose } from './proposalFixtures';

// Propostas escritas antes do schema 13 trazem `inherit`: a leitura ignora o campo (com aviso)
// e o resto da proposta fica como estava. A formatVersion 3 já nasce sem ele.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Proposta v2 como a app antiga a gravava: c1 renomeia, c2 cria A9 e c3 muda `inherit`. */
function legacySample(): Json {
  const base = sampleProject();
  let after = renameAnnotation(base, 'A3', 'Trinco');
  after = addAnnotation(after, { id: 'A9', markingId: 'M4', layerId: 'L1' });
  let p = propose(base, after);
  p = decided(p, base, { level: 'change', id: 'c1' }, 'accepted');
  const json = JSON.parse(serializeProposal(p)) as Json;
  json.formatVersion = 2;
  json.changes.push({
    id: 'c3',
    kind: 'update',
    entity: 'annotation',
    entityId: 'A1',
    imageId: 'I1',
    markingId: 'M1',
    field: 'inherit',
    from: false,
    to: true,
  });
  json.decisions.c3 = { ...json.decisions.c1 };
  json.applied.c3 = { at: AT };
  json.notes = [
    { id: 'n1', target: { level: 'change', id: 'c3' }, text: 'Herança.', at: AT },
  ];
  return json;
}

describe('proposta com `inherit` (formatVersion 1 e 2)', () => {
  it('descarta a mudança do campo, a decisão e a aplicação dela, com aviso', () => {
    const result = parseProposal(legacySample());
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.proposal.formatVersion).toBe(2);
    expect(result.proposal.changes.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(result.proposal.changes.some((c) => c.field === 'inherit')).toBe(false);
    expect(Object.keys(result.proposal.decisions)).toEqual(['c1']);
    expect(Object.keys(result.proposal.applied)).not.toContain('c3');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toContain('inherit');
  });

  it('a nota presa à mudança descartada passa para a proposta', () => {
    const result = parseProposal(legacySample());
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.proposal.notes.map((n) => n.target)).toEqual([
      { level: 'proposal', id: null },
    ]);
  });

  it('a anotação inteira de uma criação perde `inherit`', () => {
    const json = legacySample();
    json.changes = json.changes.filter((c: Json) => c.id !== 'c3');
    delete json.decisions.c3;
    delete json.applied.c3;
    json.notes = [];
    const create = json.changes.find((c: Json) => c.id === 'c2');
    create.to = { ...create.to, inherit: true };
    const result = parseProposal(json);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const change = result.proposal.changes.find((c) => c.id === 'c2');
    expect(change?.to).not.toHaveProperty('inherit');
    expect(change?.to).toMatchObject({ id: 'A9', markingId: 'M4' });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('a proposta sem `inherit` não tem avisos', () => {
    const json = legacySample();
    json.changes = json.changes.filter((c: Json) => c.id !== 'c3');
    delete json.decisions.c3;
    delete json.applied.c3;
    json.notes = [];
    const result = parseProposal(json);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.warnings).toEqual([]);
  });
});

describe('proposta formatVersion 3', () => {
  it('é aceita e volta igual', () => {
    const base = sampleProject();
    const p = propose(base, renameAnnotation(base, 'A3', 'Trinco'));
    const json = JSON.parse(serializeProposal(p)) as Json;
    expect(json.formatVersion).toBe(3);
    const result = parseProposal(json);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.warnings).toEqual([]);
    expect(JSON.parse(serializeProposal(result.proposal))).toEqual(json);
  });
});
