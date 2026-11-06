import { describe, expect, it } from 'vitest';
import {
  addContainer,
  applyAccepted,
  computeChanges,
  createMarking,
  parseProposalText,
  patchProject,
  removeMarking,
  renameMarking,
  reorderMarking,
  serializeProposal,
  wrapItems,
  PROPOSAL_FORMAT_VERSION,
  type Change,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { AT, decided, propose } from './proposalFixtures';

// Proposta formatVersion 4: a marcação criada carrega `insertBefore` (a âncora no array da
// base), e aplicar todas as mudanças dá os mesmos pais e a mesma ordem entre irmãs do projeto
// proposto (docs/PROPOSAL-FORMAT.md, "Garantia"); sem reordenação no lote, também a mesma ordem
// do array `markings`. Com reordenação e empate, ver proposalReorderLimit.test.ts e o fuzz
// proposalFidelityFuzz.test.ts (#549).

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** Container C 300×200 com A (preenche), B (dentro de A), D e E (irmãs de A, fora dele não cabem). */
function tieBase(): Project {
  let p = addContainer(emptyProject(), {
    id: 'C',
    file: 'c.png',
    width: 300,
    height: 200,
  });
  p = createMarking(p, { id: 'A', containerId: 'C', rect: rect(0, 0, 300, 200) });
  p = createMarking(p, { id: 'B', containerId: 'C', rect: rect(50, 50, 40, 30) });
  p = createMarking(p, { id: 'D', containerId: 'C', rect: rect(100, 100, 40, 30) });
  return p;
}

/** Quatro marcações lado a lado, sem pertencimento entre elas: P, Q, R, S. */
function rowBase(): Project {
  let p = addContainer(emptyProject(), {
    id: 'C',
    file: 'c.png',
    width: 1000,
    height: 200,
  });
  for (const [id, x] of [
    ['P', 0],
    ['Q', 200],
    ['R', 400],
    ['S', 600],
  ] as const) {
    p = createMarking(p, { id, containerId: 'C', rect: rect(x, 0, 100, 100) });
  }
  return p;
}

const ids = (p: Project) => p.markings.map((m) => m.id);
const parents = (p: Project) =>
  Object.fromEntries([
    ...p.markings.map((m) => [m.id, m.parentId]),
    ...p.containers.map((c) => [c.id, c.parentId]),
  ]);

/** Aplica todas as mudanças da base ao proposto e confere a ordem e os pais. */
function expectApplied(base: Project, after: Project): Project {
  const applied = patchProject(base, computeChanges(base, after));
  expect(applied.problems).toEqual([]);
  expect(ids(applied.project)).toEqual(ids(after));
  expect(parents(applied.project)).toEqual(parents(after));
  return applied.project;
}

const wrap = (base: Project, id: string, items: string[]) =>
  wrapItems(
    base,
    { id, items: items.map((i) => ({ kind: 'marking' as const, id: i })) },
    { settle: true },
  );

describe('proposta v4: aplicado = proposto (ordem e pais)', () => {
  it('o empate de retângulo: W sem pai, A filha de W, B filha de A', () => {
    const base = tieBase();
    const after = wrap(base, 'W', ['A']);
    expect(parents(after)).toMatchObject({ W: null, A: 'W', B: 'A' });
    const applied = expectApplied(base, after);
    expect(parents(applied)).toMatchObject({ W: null, A: 'W', B: 'A' });
  });

  it('envolver sem empate (o retângulo cresce)', () => {
    const base = tieBase();
    expectApplied(base, wrap(base, 'W', ['B', 'D']));
  });

  it('envolver uma marcação com irmãs antes e depois dela', () => {
    const base = rowBase();
    const after = wrap(base, 'W', ['Q']);
    expect(ids(after)).toEqual(['P', 'W', 'Q', 'R', 'S']);
    expectApplied(base, after);
  });

  it('envolver duas marcações de lugares diferentes do array', () => {
    const base = rowBase();
    const after = wrap(base, 'W', ['Q', 'S']);
    expectApplied(base, after);
  });

  it('um create_marking simples vai para o fim', () => {
    const base = rowBase();
    const after = createMarking(base, {
      id: 'N',
      containerId: 'C',
      rect: rect(800, 0, 50, 50),
    });
    const changes = computeChanges(base, after);
    const create = changes.find((c) => c.entity === 'marking' && c.kind === 'create');
    expect(create?.insertBefore ?? null).toBeNull();
    expect(ids(expectApplied(base, after)).at(-1)).toBe('N');
  });

  it('duas criadas com a mesma âncora ficam na ordem do proposto', () => {
    const base = rowBase();
    let after = wrap(base, 'W1', ['R']);
    after = wrap(after, 'W2', ['R']);
    const changes = computeChanges(base, after);
    const anchors = changes
      .filter((c) => c.entity === 'marking' && c.kind === 'create')
      .map((c) => c.insertBefore);
    expect(anchors).toEqual(['R', 'R']);
    expectApplied(base, after);
  });

  it('envolver junto com a remoção da marcação que seria a âncora', () => {
    const base = rowBase();
    const after = removeMarking(wrap(base, 'W', ['Q']), 'Q');
    const changes = computeChanges(base, after);
    const create = changes.find((c) => c.entity === 'marking' && c.kind === 'create');
    expect(create?.insertBefore).toBe('R');
    expectApplied(base, after);
  });

  it('envolver junto com uma troca de ordem (reorderMarking), sem empate: mesmos pais e mesma ordem entre as irmãs', () => {
    // O `position` só ordena irmãs (as irmãs trocam de casa no array e as outras ficam): onde
    // uma filha cai no array entre elas não é expressável, então a ordem exata do array só é
    // garantida sem troca de ordem. Com ela, valem os pais e a ordem relativa das irmãs.
    const base = rowBase();
    const roots = (p: Project) =>
      p.markings.filter((m) => m.parentId === null).map((m) => m.id);
    const afters = [
      reorderMarking(wrap(base, 'W', ['Q']), 'S', 0),
      reorderMarking(wrap(base, 'W', ['R']), 'S', 0),
      reorderMarking(wrap(base, 'W', ['R']), 'P', 3),
    ];
    for (const after of afters) {
      const applied = patchProject(base, computeChanges(base, after));
      expect(applied.problems).toEqual([]);
      expect(parents(applied.project)).toEqual(parents(after));
      expect(roots(applied.project)).toEqual(roots(after));
    }
  });

  it('o empate junto com uma troca de ordem das irmãs', () => {
    const base = tieBase();
    const after = reorderMarking(wrap(base, 'W', ['A']), 'D', 0);
    expectApplied(base, after);
  });
});

describe('proposta v4: aceitação parcial', () => {
  it('rejeitar a criação da envolvente e aceitar o resto aplica sem erro', () => {
    const base = rowBase();
    const after = removeMarking(wrap(base, 'W', ['Q']), 'S');
    const p = propose(base, after);
    const create = p.changes.find((c) => c.entity === 'marking' && c.kind === 'create');
    expect(create).toBeDefined();
    const rejectCreate = p.changes.map((c) => c).filter((c) => c.id !== create?.id);
    const accepted = {
      ...p,
      decisions: Object.fromEntries(
        p.changes.map((c) => [
          c.id,
          { state: c.id === create?.id ? 'rejected' : 'accepted', at: AT },
        ]),
      ),
    } as typeof p;
    expect(rejectCreate.length).toBeGreaterThan(0);
    const result = applyAccepted(base, accepted, AT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project.markings.some((m) => m.id === 'W')).toBe(false);
  });

  it('com a âncora removida por uma mudança aceita, a criada vai para o fim', () => {
    const base = rowBase();
    const wrapped = wrap(base, 'W', ['Q']);
    const changes = computeChanges(base, wrapped);
    const create = changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    ) as Change;
    expect(create.insertBefore).toBe('Q');
    const removeQ: Change = {
      id: 'x1',
      kind: 'remove',
      entity: 'marking',
      entityId: 'Q',
      imageId: 'C',
      markingId: 'Q',
      field: null,
      from: JSON.parse(JSON.stringify(base.markings.find((m) => m.id === 'Q'))),
      to: null,
    };
    const result = patchProject(base, [create, removeQ]);
    expect(result.problems).toEqual([]);
    expect(ids(result.project).at(-1)).toBe('W');
    expect(ids(result.project)).not.toContain('Q');
  });

  it('âncora que não existe na base: a criada vai para o fim, sem problema', () => {
    const base = rowBase();
    const changes = computeChanges(base, wrap(base, 'W', ['Q']));
    const create = changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    ) as Change;
    const result = patchProject(base, [{ ...create, insertBefore: 'ZZ' }]);
    expect(result.problems).toEqual([]);
    expect(ids(result.project).at(-1)).toBe('W');
  });
});

describe('proposta v4: sem position redundante', () => {
  it('o envolver em empate não traz position para a criada nem para a envolvida', () => {
    const base = tieBase();
    const changes = computeChanges(base, wrap(base, 'W', ['A']));
    expect(changes.filter((c) => c.field === 'position')).toEqual([]);
  });

  it('o envolver sem empate também não', () => {
    const base = rowBase();
    const changes = computeChanges(base, wrap(base, 'W', ['Q']));
    expect(changes.filter((c) => c.field === 'position')).toEqual([]);
  });
});

describe('proposta v4: leitura e gravação', () => {
  const build = () => {
    const base = rowBase();
    const p = propose(base, wrap(base, 'W', ['Q']));
    return { base, p, data: JSON.parse(serializeProposal(p)) as Record<string, unknown> };
  };
  const changesOf = (data: Record<string, unknown>) =>
    data.changes as Record<string, unknown>[];

  it('a proposta nova sai na formatVersion 4, com insertBefore na criação', () => {
    const { p, data } = build();
    expect(PROPOSAL_FORMAT_VERSION).toBe(4);
    expect(p.formatVersion).toBe(4);
    const create = changesOf(data).find(
      (c) => c.kind === 'create' && c.entity === 'marking',
    );
    expect(create?.insertBefore).toBe('Q');
    const parsed = parseProposalText(JSON.stringify(data));
    expect(parsed.ok).toBe(true);
  });

  it('insertBefore em outra mudança é erro de leitura, com o caminho', () => {
    const base = rowBase();
    const p = propose(base, renameMarking(wrap(base, 'W', ['Q']), 'P', 'Primeira'));
    const data = JSON.parse(serializeProposal(p)) as Record<string, unknown>;
    const list = changesOf(data);
    const index = list.findIndex((c) => c.kind === 'update');
    expect(index).toBeGreaterThanOrEqual(0);
    list[index] = { ...list[index], insertBefore: 'Q' };
    const result = parseProposalText(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.startsWith(`changes[${index}].insertBefore:`)),
      ).toBe(true);
    }
  });

  it('insertBefore que não é id nem null é erro de leitura', () => {
    const { data } = build();
    const index = changesOf(data).findIndex(
      (c) => c.kind === 'create' && c.entity === 'marking',
    );
    for (const value of [5, '', {}]) {
      const bad = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      changesOf(bad)[index] = { ...changesOf(bad)[index], insertBefore: value };
      const result = parseProposalText(JSON.stringify(bad));
      expect(result.ok, JSON.stringify(value)).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some((e) => e.startsWith(`changes[${index}].insertBefore`)),
        ).toBe(true);
      }
    }
  });

  it('insertBefore null é lido; âncora que não existe na base não é erro de leitura', () => {
    const { data } = build();
    const index = changesOf(data).findIndex(
      (c) => c.kind === 'create' && c.entity === 'marking',
    );
    for (const value of [null, 'nao-existe']) {
      const ok = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      changesOf(ok)[index] = { ...changesOf(ok)[index], insertBefore: value };
      expect(parseProposalText(JSON.stringify(ok)).ok).toBe(true);
    }
  });

  it('as versões 1 a 3 continuam lidas, sem o campo (ignorado se aparecer)', () => {
    const { data } = build();
    for (const version of [1, 2, 3]) {
      const old = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      old.formatVersion = version;
      const result = parseProposalText(JSON.stringify(old));
      expect(result.ok, `v${version}`).toBe(true);
      if (result.ok) {
        expect(result.proposal.formatVersion).toBe(version);
        expect(result.proposal.changes.every((c) => c.insertBefore === undefined)).toBe(
          true,
        );
      }
    }
  });

  it('a app regrava as decisões mantendo a versão do arquivo (uma v3)', () => {
    const { base, data } = build();
    const v3 = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    v3.formatVersion = 3;
    const read = parseProposalText(JSON.stringify(v3));
    if (!read.ok) throw new Error(read.errors.join('; '));
    const decidedP = decided(
      read.proposal,
      base,
      { level: 'proposal', id: null },
      'accepted',
    );
    const again = JSON.parse(serializeProposal(decidedP)) as Record<string, unknown>;
    expect(again.formatVersion).toBe(3);
    expect(changesOf(again).every((c) => !('insertBefore' in c))).toBe(true);
  });

  it('a v4 regravada mantém o insertBefore', () => {
    const { base, p } = build();
    const decidedP = decided(p, base, { level: 'proposal', id: null }, 'accepted');
    const again = JSON.parse(serializeProposal(decidedP)) as Record<string, unknown>;
    expect(again.formatVersion).toBe(4);
    const create = changesOf(again).find(
      (c) => c.kind === 'create' && c.entity === 'marking',
    );
    expect(create?.insertBefore).toBe('Q');
  });
});
