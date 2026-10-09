import { describe, expect, it } from 'vitest';
import {
  changeType,
  createMarking,
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
import { sampleProject } from '../model/fixtures';
import { decided, propose } from '../model/proposalFixtures';
import { richScenario } from '../store/proposalHarness';

// Marcas de revisão no canvas (HANDOFF-PROPOSALS 4): a forma da linha e o selo dizem o
// tipo; rejeitadas só na visão Atual; movida com fantasma na outra posição.

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
    // A criação rejeitada numa imagem que existe vira fantasma com ✕ na visão Atual.
    const added = propose(
      base,
      createMarking(base, {
        id: 'M9',
        imageId: 'I1',
        rect: { x: 10, y: 10, width: 50, height: 50 },
        name: 'Novo',
      }),
    );
    const noItem = decided(added, base, { level: 'item', id: 'M9' }, 'rejected');
    expect(marks(noItem, base, 'current').ghosts.map((g) => [g.key, g.badges])).toEqual([
      ['rejected:M9', ['rejected']],
    ]);
    expect(marks(noItem, base, 'proposed').ghosts).toEqual([]);
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

  it('o "como ficaria" desenha a imagem nova do arquivo que espera em proposals/', () => {
    const { base, proposal } = richScenario();
    const preview = previewProject(base, proposal).project;
    const shown = proposedDisplay(preview, proposal);
    expect(shown.images.find((i) => i.id === 'I3')?.file).toBe(
      'proposals/P1/images/nova.webp',
    );
    // As demais imagens não mudam (mesmo objeto).
    expect(shown.images.find((i) => i.id === 'I1')).toBe(
      preview.images.find((i) => i.id === 'I1'),
    );
    // Memoizado pela versão do "como ficaria".
    expect(proposedDisplay(preview, proposal)).toBe(shown);
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
