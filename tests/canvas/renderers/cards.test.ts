import { describe, expect, it } from 'vitest';
import {
  cardCache,
  inheritedOf,
  semanticPlacement,
} from '../../../src/canvas/renderers/cards';
import { t } from '../../../src/i18n';
import {
  projectIndex,
  setAnnotationInherit,
  type Marking,
  type Project,
} from '../../../src/model';
import { codeProject } from '../../model/specFixtures';
import { canvasProject, editorFor } from '../harness';

function markingOf(p: Project, id: string): Marking {
  const m = projectIndex(p).markings.get(id);
  if (!m) throw new Error(`sem ${id}`);
  return m;
}

function cardsFor(p: Project) {
  const { derived, store } = editorFor(p);
  return cardCache(
    store.project.peek(),
    derived.visibleLayers.peek(),
    derived.annotationsByMarking.peek(),
  );
}

describe('cardCache', () => {
  it('monta o cartão uma vez por marcação e devolve o mesmo depois', () => {
    const p = canvasProject();
    const card = cardsFor(p);
    const first = card(markingOf(p, 'M1'));
    expect(first.layers.map((l) => l.id)).toEqual(['L1']);
    expect(first.rows.map((r) => r.kind)).toEqual(['layer', 'title', 'entry', 'entry']);
    expect(card(markingOf(p, 'M1'))).toBe(first);
  });

  it('sem anotação nas camadas visíveis, cartão vazio; sem projeto, sempre vazio', () => {
    const p = canvasProject();
    expect(cardsFor(p)(markingOf(p, 'M3')).rows).toEqual([]);
    expect(cardCache(null, [], new Map())(markingOf(p, 'M1')).rows).toEqual([]);
  });

  it('a filha mostra as herdadas do pai, com a origem', () => {
    const p = setAnnotationInherit(canvasProject(), 'A1', true);
    const rows = cardsFor(p)(markingOf(p, 'M2')).rows;
    const texts = rows.flatMap((r) => ('text' in r ? [r.text] : []));
    expect(texts).toContain(t('canvas.card.inheritedFrom', { name: 'Porta' }));
    expect(rows.some((r) => 'inherited' in r && r.inherited)).toBe(true);
  });
});

describe('inheritedOf', () => {
  it('só as anotações com herança dos ancestrais, da raiz até o pai', () => {
    const p = setAnnotationInherit(canvasProject(), 'A1', true);
    const index = projectIndex(p);
    const byMarking = new Map([['M1', p.annotations]]);
    const inherited = inheritedOf(markingOf(p, 'M2'), index.markings, byMarking);
    expect(inherited.map((i) => [i.annotation.id, i.source.id])).toEqual([['A1', 'M1']]);
    expect(inheritedOf(markingOf(p, 'M1'), index.markings, byMarking)).toEqual([]);
  });
});

describe('semanticPlacement', () => {
  const p = canvasProject();
  const m1 = markingOf(p, 'M1');
  const m2 = markingOf(p, 'M2');
  const placement = { x: 0, y: 0, scale: 1 };
  const visible = new Map();

  it('sem filhas, o cartão ocupa a marcação inteira', () => {
    expect(semanticPlacement(m2, placement, 2, true, [], visible)).toEqual({
      mode: 'full',
      area: m2.rect,
    });
  });

  it('com filhas, o cartão vai na maior área livre delas', () => {
    const { mode, area } = semanticPlacement(m1, placement, 1, true, [m2], visible);
    expect(mode).toBe('full');
    expect(area).not.toEqual(m1.rect);
    // A área não cobre a filha.
    const overlaps =
      area !== null &&
      area.x < m2.rect.x + m2.rect.width &&
      m2.rect.x < area.x + area.width &&
      area.y < m2.rect.y + m2.rect.height &&
      m2.rect.y < area.y + area.height;
    expect(overlaps).toBe(false);
  });

  it('filhas ocultas não ocupam espaço', () => {
    const hidden = new Map([['M2', 'hidden' as const]]);
    expect(semanticPlacement(m1, placement, 1, true, [m2], hidden).area).toEqual(m1.rect);
  });

  it('pequena demais na tela ou desligado: nada', () => {
    expect(semanticPlacement(m2, placement, 1, true, [], visible).mode).toBe('none');
    expect(semanticPlacement(m1, placement, 1, false, [m2], visible)).toEqual({
      mode: 'none',
      area: null,
    });
  });

  it('cabe o nome, mas não o cartão: só o cabeçalho', () => {
    expect(semanticPlacement(m1, placement, 0.31, true, [m2], visible).mode).toBe(
      'header',
    );
  });
});

describe('cartão do zoom semântico: codeRef', () => {
  it('só o resumo das plataformas, na ordem de aparição', () => {
    const p = codeProject();
    const card = cardsFor(p);
    const rows = card(markingOf(p, 'MF')).rows.filter((r) => r.kind === 'entry');
    expect(rows.map((r) => (r.kind === 'entry' ? r.text : ''))).toContain(
      'implementação: Android, iOS',
    );
  });
});
