import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PLACEMENT,
  addBackgroundContainer,
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  markingTypeName,
  parseSpec,
  changeType,
  createMarking,
  moveMarking,
  previewProject,
  removeMarking,
  reviewTree,
  type Project,
  type Proposal,
} from '../../src/model';
import {
  proposedDisplay,
  reviewMarks,
  type ReviewView,
} from '../../src/canvas/reviewMarks';
import { visibleBadges } from '../../src/canvas/renderers/review';
import { SPEC_ID, SPEC_JSON, testCatalog } from '../model/componentFixtures';
import { emptyProject, sampleProject } from '../model/fixtures';
import { decided, propose } from '../model/proposalFixtures';
import { richScenario } from '../store/proposalHarness';

// Marcas de revisão no canvas (HANDOFF-PROPOSALS 4): a forma da linha e o selo dizem o
// tipo; rejeitadas: a existente só na visão Atual, a criação (fantasma) nas duas; movida com fantasma na outra posição.

function marks(
  p: Proposal,
  base: Project,
  view: ReviewView,
  extra: { conflicts?: string[]; invalid?: string[] } = {},
) {
  const preview = previewProject(base, p).project;
  return reviewMarks({
    proposal: p,
    tree: reviewTree(p, base),
    types: new Map(p.changes.map((c) => [c.id, changeType(c)])),
    conflicts: new Set(extra.conflicts ?? []),
    invalid: new Set(extra.invalid ?? []),
    view,
    current: base,
    drawn: view === 'proposed' ? proposedDisplay(preview, p) : base,
  });
}

describe('reviewMarks', () => {
  it('Proposto: criada tracejada, movida com fantasma na posição antiga, alterada dupla', () => {
    const { base, proposal } = richScenario();
    const m = marks(proposal, base, 'proposed');
    expect(m.markings.get('M5')).toEqual({
      line: 'created',
      dim: false,
      badges: ['created'],
    });
    expect(m.images.get('I3')).toEqual({ line: 'created', badges: ['created'] });
    expect(m.markings.get('M4')).toEqual({ line: null, dim: false, badges: ['moved'] });
    expect(m.markings.get('M1')).toEqual({
      line: 'changed',
      dim: false,
      badges: ['changed'],
    });
    expect(m.ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:M4',
        rect: { x: 0, y: 0, width: 100, height: 100 },
      }),
    ]);
  });

  it('Atual: a criada não aparece; o fantasma da movida fica na posição nova', () => {
    const { base, proposal } = richScenario();
    const m = marks(proposal, base, 'current');
    expect(m.markings.has('M5')).toBe(false);
    expect(m.images.has('I3')).toBe(false);
    expect(m.ghosts.map((g) => [g.key, g.rect])).toEqual([
      ['moved:M4', { x: 10, y: 10, width: 100, height: 100 }],
    ]);
  });

  it('rejeitada: pontilhada e esmaecida com ✕ só na visão Atual', () => {
    const { base, proposal } = richScenario();
    const rejected = decided(proposal, base, { level: 'item', id: 'M1' }, 'rejected');
    expect(marks(rejected, base, 'proposed').markings.has('M1')).toBe(false);
    expect(marks(rejected, base, 'current').markings.get('M1')).toEqual({
      line: 'rejected',
      dim: true,
      badges: ['rejected'],
    });
    // A criação rejeitada numa imagem que existe vira fantasma com ✕ nas duas visões.
    const added = propose(
      base,
      createMarking(base, {
        id: 'M9',
        containerId: 'I1',
        rect: { x: 10, y: 10, width: 50, height: 50 },
        name: 'Novo',
      }),
    );
    const noItem = decided(added, base, { level: 'item', id: 'M9' }, 'rejected');
    expect(marks(noItem, base, 'current').ghosts.map((g) => [g.key, g.badges])).toEqual([
      ['rejected:M9', ['rejected']],
    ]);
    expect(marks(noItem, base, 'proposed').ghosts.map((g) => [g.key, g.badges])).toEqual([
      ['rejected:M9', ['rejected']],
    ]);
  });

  it('matriz: marcação criada e alterada por estado de decisão, em cada visão', () => {
    const base = sampleProject();
    const created = propose(
      base,
      createMarking(base, {
        id: 'M9',
        containerId: 'I1',
        rect: { x: 10, y: 10, width: 50, height: 50 },
        name: 'Novo',
      }),
    );
    const item = { level: 'item', id: 'M9' } as const;
    const ghostsOf = (m: ReturnType<typeof marks>) =>
      m.ghosts
        .filter((g) => g.key.startsWith('rejected:'))
        .map((g) => [g.key, g.name, g.badges]);
    const rejectedGhost = [['rejected:M9', 'Novo', ['rejected']]];
    const createdMark = { line: 'created', dim: false, badges: ['created'] };
    const cases = [
      ['pendente', created, undefined, createdMark, []],
      ['aceita', decided(created, base, item, 'accepted'), undefined, createdMark, []],
      [
        'rejeitada',
        decided(created, base, item, 'rejected'),
        undefined,
        undefined,
        rejectedGhost,
      ],
      [
        'inválida',
        created,
        [created.changes[0]!.id],
        { line: 'invalid', dim: false, badges: ['invalid', 'created'] },
        [],
      ],
    ] as const satisfies readonly (readonly [
      string,
      Proposal,
      readonly string[] | undefined,
      unknown,
      unknown,
    ])[];
    for (const [state, proposal, invalid, mark, ghosts] of cases) {
      const proposed = marks(proposal, base, 'proposed', {
        invalid: invalid ? [...invalid] : [],
      });
      expect(proposed.markings.get('M9'), `${state}, Proposto`).toEqual(mark);
      expect(ghostsOf(proposed), `${state}, Proposto`).toEqual(ghosts);
      const current = marks(proposal, base, 'current', {
        invalid: invalid ? [...invalid] : [],
      });
      expect(current.markings.has('M9'), `${state}, Atual`).toBe(false);
      expect(ghostsOf(current), `${state}, Atual`).toEqual(ghosts);
    }

    // Existente alterada: o fantasma de rejeitada só existe na Atual (a mudança rejeitada
    // fica fora do "como ficaria"); pendente e aceita nunca o têm.
    const moved = propose(base, moveMarking(base, 'M4', 10, 10));
    const rejectedMove = decided(moved, base, { level: 'item', id: 'M4' }, 'rejected');
    for (const [state, proposal] of [
      ['pendente', moved],
      ['aceita', decided(moved, base, { level: 'item', id: 'M4' }, 'accepted')],
    ] as const) {
      for (const view of ['proposed', 'current'] as const)
        expect(ghostsOf(marks(proposal, base, view)), `${state}, ${view}`).toEqual([]);
    }
    expect(ghostsOf(marks(rejectedMove, base, 'proposed'))).toEqual([]);
    expect(marks(rejectedMove, base, 'proposed').markings.has('M4')).toBe(false);
    expect(marks(rejectedMove, base, 'current').markings.get('M4')).toEqual({
      line: 'rejected',
      dim: true,
      badges: ['rejected'],
    });
  });

  it('criação rejeitada de componente (sem name): o fantasma leva o nome do tipo', () => {
    const spec = parseSpec(SPEC_JSON);
    if (!spec.ok) throw new Error(spec.errors.join('\n'));
    let n = 0;
    let base = applySpecialization(emptyProject(), spec.spec, {
      newId: () => `LS${++n}`,
      packageSpecName: 'test.spec.json',
    });
    base = addBackgroundContainer(base, {
      id: 'B1',
      name: 'Tela',
      width: 400,
      height: 600,
      background: '#FFFFFF',
      center: { x: 500, y: 300 },
    });
    const withText = addComponentMarking(
      base,
      testCatalog(),
      {
        markingId: 'N1',
        annotationId: 'A_N1',
        containerId: 'B1',
        parentId: null,
        specId: SPEC_ID,
        typeId: 'text',
        rect: { x: 20, y: 100, width: 100, height: 40 },
      },
      approximateMeasurer,
    );
    const typeName = markingTypeName(withText, 'N1');
    expect(typeName).toBeTruthy();
    const proposal = decided(
      propose(base, withText),
      base,
      { level: 'item', id: 'N1' },
      'rejected',
    );
    for (const view of ['proposed', 'current'] as const) {
      expect(
        marks(proposal, base, view).ghosts.map((g) => [g.key, g.name, g.badges]),
      ).toEqual([['rejected:N1', typeName, ['rejected']]]);
    }
  });

  it('removida: hachura com o nome (riscado) nas duas visões', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M3'));
    for (const view of ['proposed', 'current'] as const) {
      const m = marks(p, base, view);
      expect(m.removed).toEqual([
        expect.objectContaining({
          key: 'marking:M3',
          name: 'Fechadura',
          badges: ['removed'],
          rect: { x: 1300, y: 1250, width: 50, height: 50 },
        }),
      ]);
    }
  });

  it('conflito e conjunto inválido somam o selo de alerta ao tipo', () => {
    const { base, proposal, ids } = richScenario();
    expect(
      marks(proposal, base, 'proposed', { conflicts: [ids.rect] }).markings.get('M4'),
    ).toEqual({ line: null, dim: false, badges: ['conflict', 'moved'] });
    expect(
      marks(proposal, base, 'proposed', { invalid: [ids.rect] }).markings.get('M4'),
    ).toEqual({ line: 'invalid', dim: false, badges: ['invalid', 'moved'] });
  });

  it('criada no Proposto: pendente e aceita dão a mesma marca; inválida troca a linha e soma o selo', () => {
    const { base, proposal, ids } = richScenario();
    const pending = marks(proposal, base, 'proposed').markings.get('M5');
    const accepted = marks(
      decided(proposal, base, { level: 'item', id: 'M5' }, 'accepted'),
      base,
      'proposed',
    ).markings.get('M5');
    expect(pending).toEqual({ line: 'created', dim: false, badges: ['created'] });
    expect(accepted).toEqual(pending);
    expect(
      marks(proposal, base, 'proposed', { invalid: [ids.marking] }).markings.get('M5'),
    ).toEqual({ line: 'invalid', dim: false, badges: ['invalid', 'created'] });
    // Na visão Atual a criada não tem marca, inválida ou não.
    expect(
      marks(proposal, base, 'current', { invalid: [ids.marking] }).markings.has('M5'),
    ).toBe(false);
  });

  it('o "como ficaria" desenha a imagem nova do arquivo que espera em proposals/', () => {
    const { base, proposal } = richScenario();
    const preview = previewProject(base, proposal).project;
    const shown = proposedDisplay(preview, proposal);
    expect(shown.containers.find((i) => i.id === 'I3')?.file).toBe(
      'proposals/P1/images/nova.webp',
    );
    // As demais imagens não mudam (mesmo objeto).
    expect(shown.containers.find((i) => i.id === 'I1')).toBe(
      preview.containers.find((i) => i.id === 'I1'),
    );
    // Memoizado pela versão do "como ficaria".
    expect(proposedDisplay(preview, proposal)).toBe(shown);
  });
});

// Marcações do canvas (v13): o espaço delas é a identidade, e a troca de espaço é uma mudança só
// (`space`), com o fantasma no espaço de cada lado.
describe('reviewMarks: marcações do canvas', () => {
  /** sampleProject com C1 no canvas, longe das imagens (I1 em 0..1000 × 0..750, I2 a partir de 1050). */
  function withCanvasMarking(): Project {
    return createMarking(sampleProject(), {
      id: 'C1',
      containerId: null,
      rect: { x: -3000, y: -3000, width: 400, height: 300 },
      name: 'Grupo',
    });
  }

  it('criada no canvas e rejeitada: fantasma com a posição identidade na visão Atual', () => {
    const base = sampleProject();
    const after = createMarking(base, {
      id: 'C9',
      containerId: null,
      rect: { x: -500, y: -400, width: 120, height: 80 },
      name: 'Nova',
    });
    const p = propose(base, after);
    const rejected = decided(p, base, { level: 'item', id: 'C9' }, 'rejected');
    const ghosts = marks(rejected, base, 'current').ghosts;
    expect(ghosts).toEqual([
      expect.objectContaining({
        key: 'rejected:C9',
        placement: IDENTITY_PLACEMENT,
        rect: { x: -500, y: -400, width: 120, height: 80 },
        name: 'Nova',
        badges: ['rejected'],
      }),
    ]);
    // Aceita, aparece como criada na visão Proposto.
    expect(marks(p, base, 'proposed').markings.get('C9')).toEqual({
      line: 'created',
      dim: false,
      badges: ['created'],
    });
  });

  it('movida no canvas: o fantasma está no espaço identidade, na posição antiga (Proposto) ou nova (Atual)', () => {
    const base = withCanvasMarking();
    const p = propose(base, moveMarking(base, 'C1', 100, 50));
    const proposed = marks(p, base, 'proposed');
    expect(proposed.markings.get('C1')).toEqual({
      line: null,
      dim: false,
      badges: ['moved'],
    });
    expect(proposed.ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:C1',
        placement: IDENTITY_PLACEMENT,
        rect: { x: -3000, y: -3000, width: 400, height: 300 },
      }),
    ]);
    expect(marks(p, base, 'current').ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:C1',
        placement: IDENTITY_PLACEMENT,
        rect: { x: -2900, y: -2950, width: 400, height: 300 },
      }),
    ]);
  });

  it('troca de espaço (de um container para o canvas): o fantasma fica no espaço de cada lado', () => {
    const base = sampleProject();
    // M4 (0,0,100×100 em I2, que está em (1050, 0) na escala 1) sai por 5000 pixels à esquerda.
    const after = moveMarking(base, 'M4', -5000, 0);
    const moved = after.markings.find((m) => m.id === 'M4');
    expect(moved?.containerId).toBeNull();
    const p = propose(base, after);
    const i2 = base.containers.find((i) => i.id === 'I2');
    const proposed = marks(p, base, 'proposed');
    expect(proposed.ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:M4',
        placement: i2?.placement,
        rect: { x: 0, y: 0, width: 100, height: 100 },
      }),
    ]);
    expect(marks(p, base, 'current').ghosts).toEqual([
      expect.objectContaining({
        key: 'moved:M4',
        placement: IDENTITY_PLACEMENT,
        rect: moved?.rect,
      }),
    ]);
  });

  it('removida no canvas: a hachura usa a posição identidade', () => {
    const base = withCanvasMarking();
    const p = propose(base, removeMarking(base, 'C1'));
    for (const view of ['proposed', 'current'] as const) {
      expect(marks(p, base, view).removed).toEqual([
        expect.objectContaining({
          key: 'marking:C1',
          name: 'Grupo',
          placement: IDENTITY_PLACEMENT,
          rect: { x: -3000, y: -3000, width: 400, height: 300 },
        }),
      ]);
    }
  });
});

describe('selos visíveis', () => {
  const rect = (side: number) => ({ x: 0, y: 0, width: side, height: side });

  it('marcação pequena na tela: só os importantes; menor que o selo, nenhum', () => {
    expect(visibleBadges(['conflict', 'moved'], rect(200), 1)).toEqual([
      'conflict',
      'moved',
    ]);
    expect(visibleBadges(['conflict', 'moved'], rect(30), 1)).toEqual(['conflict']);
    expect(visibleBadges(['created'], rect(30), 1)).toEqual([]);
    expect(visibleBadges(['changed'], rect(10), 1)).toEqual([]);
    // O que conta é o tamanho na tela (zoom).
    expect(visibleBadges(['created'], rect(30), 4)).toEqual(['created']);
  });
});
