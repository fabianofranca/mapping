// Âncora na app (R4, decisões 12 e 13): as actions `setMarkingAnchor` e `snapToAnchor`, o Arrumar
// que também encosta e o `addComponent` ancorado. Cada uma é uma entrada de desfazer.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createMarking,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from '../model/fitFixtures';
import { marking } from '../model/fixtures';
import { TIP_SPEC_ID, tipCatalog, tipProject } from '../model/tooltipFixtures';

const tipComponents = tipCatalog();
const fitComponents = fitCatalog();

const BUTTON: Rect = { x: 400, y: 300, width: 80, height: 32 };
const TOOLTIP: Rect = { x: 100, y: 100, width: 100, height: 48 };

function addTip(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    tipComponents,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: TIP_SPEC_ID,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** I1 com o botão B e o tooltip T longe dele, sem âncora ainda. */
function tipScene(): Project {
  return addTip(addTip(tipProject(), 'B', 'botao', BUTTON), 'T', 'tooltip', TOOLTIP);
}

function setup(initial: Project, catalog = tipComponents) {
  const store = createProjectStore({ now: () => '2026-11-13T00:00:00.000Z' });
  let n = 0;
  const actions = createProjectActions(store, {
    newId: () => `N${++n}`,
    components: () => catalog,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  return { store, actions };
}

const current = (store: ProjectStore): Project => store.project.value as Project;

/** Quantas entradas de desfazer existem (desfaz tudo e refaz). */
function undoDepth(store: ProjectStore): number {
  let depth = 0;
  while (store.undo()) depth++;
  for (let i = 0; i < depth; i++) store.redo();
  return depth;
}

// O tooltip tem `anchor` top/center com `offset.main` 4 na raiz: sobre o botão (400,300, 80×32),
// 100×48 fica em x = 400 + (80 − 100) / 2 = 390 e y = 300 − 48 − 4 = 248.
const SNAPPED = { x: 390, y: 248 };

describe('setMarkingAnchor', () => {
  it('grava a âncora numa entrada de desfazer, sem mover a marcação', () => {
    const { store, actions } = setup(tipScene());
    expect(actions.setMarkingAnchor('T', { to: 'B', side: 'bottom' }).ok).toBe(true);
    expect(marking(current(store), 'T').anchor).toEqual({ to: 'B', side: 'bottom' });
    expect(marking(current(store), 'T').rect).toEqual(TOOLTIP);
    expect(undoDepth(store)).toBe(1);
    store.undo();
    expect(marking(current(store), 'T').anchor ?? null).toBeNull();
  });

  it('`null` tira a âncora; a mesma âncora não cria entrada', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    const anchored = current(store);
    expect(actions.setMarkingAnchor('T', { to: 'B' }).ok).toBe(true);
    expect(current(store)).toBe(anchored);
    expect(actions.setMarkingAnchor('T', null).ok).toBe(true);
    expect(marking(current(store), 'T').anchor).toBeNull();
    expect(undoDepth(store)).toBe(2);
  });

  it('recusa a própria marcação, o ciclo e outro espaço com o código da invariante', () => {
    const { store, actions } = setup(
      createMarking(tipScene(), {
        id: 'C',
        containerId: null,
        rect: { x: -3000, y: -3000, width: 100, height: 48 },
      }),
    );
    expect(actions.setMarkingAnchor('T', { to: 'T' })).toEqual({
      ok: false,
      error: 'anchor-self',
    });
    expect(actions.setMarkingAnchor('T', { to: 'C' })).toEqual({
      ok: false,
      error: 'anchor-other-space',
    });
    expect(actions.setMarkingAnchor('T', { to: 'missing' })).toEqual({
      ok: false,
      error: 'anchor-missing',
    });
    actions.setMarkingAnchor('T', { to: 'B' });
    expect(actions.setMarkingAnchor('B', { to: 'T' })).toEqual({
      ok: false,
      error: 'anchor-cycle',
    });
    expect(undoDepth(store)).toBe(1);
  });

  it('a trava da geometria não impede ancorar (não é geometria)', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingLocked('T', true);
    expect(actions.setMarkingAnchor('T', { to: 'B' }).ok).toBe(true);
    expect(marking(current(store), 'T').anchor).toEqual({ to: 'B' });
  });
});

describe('snapToAnchor (Encostar na âncora)', () => {
  it('move a marcação para junto da âncora e o desfazer a devolve, numa entrada só', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    const result = actions.snapToAnchor('T');
    expect(result).toEqual({ ok: true, value: [] });
    expect(marking(current(store), 'T').rect).toMatchObject({ ...SNAPPED, width: 100 });
    expect(undoDepth(store)).toBe(2);
    store.undo();
    expect(marking(current(store), 'T').rect).toEqual(TOOLTIP);
    expect(marking(current(store), 'T').anchor).toEqual({ to: 'B' });
  });

  it('já encostada: nada muda e não cria entrada', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    actions.snapToAnchor('T');
    const before = current(store);
    expect(actions.snapToAnchor('T')).toEqual({ ok: true, value: [] });
    expect(current(store)).toBe(before);
    expect(undoDepth(store)).toBe(2);
  });

  it('sem âncora recusa com not-anchored; trancada, com locked', () => {
    const { store, actions } = setup(tipScene());
    expect(actions.snapToAnchor('T')).toEqual({ ok: false, error: 'not-anchored' });
    actions.setMarkingAnchor('T', { to: 'B' });
    actions.setMarkingLocked('T', true);
    expect(actions.snapToAnchor('T')).toEqual({ ok: false, error: 'locked' });
    expect(marking(current(store), 'T').rect).toEqual(TOOLTIP);
  });

  it('passando do container, prende dentro e devolve o aviso', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', {
      to: 'B',
      side: 'top',
      offset: { main: 5000, cross: 0 },
    });
    const result = actions.snapToAnchor('T');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
    expect(marking(current(store), 'T').rect.y).toBe(0);
  });
});

describe('arrange numa marcação com âncora encosta', () => {
  it('componente sem slot nem eixo ajustável: o Arrumar só encosta (antes dava not-fittable)', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    expect(actions.arrange('T')).toEqual({ ok: true, value: [] });
    expect(marking(current(store), 'T').rect).toMatchObject(SNAPPED);
  });

  it('sem âncora a regra de hoje vale (not-fittable)', () => {
    const { actions } = setup(tipScene());
    expect(actions.arrange('T')).toEqual({ ok: false, error: 'not-fittable' });
  });

  it('o que se ajusta ao conteúdo ajusta e encosta na MESMA entrada de desfazer', () => {
    const target: Rect = { x: 400, y: 300, width: 200, height: 100 };
    let p = createMarking(fitProject(), { id: 'T', containerId: 'I1', rect: target });
    p = addComponentMarking(
      p,
      fitComponents,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: FIT_SPEC_ID,
        typeId: 'fit-button',
        rect: { x: 20, y: 20, width: 120, height: 40 },
        values: { label: LONG_LABEL },
      },
      approximateMeasurer,
    );
    const { store, actions } = setup(p, fitComponents);
    actions.setMarkingAnchor('B', { to: 'T', side: 'top', align: 'center' });
    const depth = undoDepth(store);
    expect(actions.arrange('B').ok).toBe(true);
    const b = marking(current(store), 'B');
    expect(b.rect.height).toBeGreaterThan(40);
    // Encostada acima da âncora com a altura já ajustada, centrada nela.
    expect(b.rect.y).toBe(target.y - b.rect.height);
    expect(b.rect.x).toBe(target.x + (target.width - b.rect.width) / 2);
    expect(undoDepth(store)).toBe(depth + 1);
    store.undo();
    expect(marking(current(store), 'B').rect).toEqual({
      x: 20,
      y: 20,
      width: 120,
      height: 40,
    });
  });
});

describe('arrastar a âncora leva as ancoradas', () => {
  it('na prévia e no commit, numa entrada de desfazer', () => {
    const { store, actions } = setup(tipScene());
    actions.setMarkingAnchor('T', { to: 'B' });
    actions.snapToAnchor('T');
    const depth = undoDepth(store);
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('B', 30, 20);
    expect(marking(current(store), 'B').rect).toMatchObject({ x: 430, y: 320 });
    expect(marking(current(store), 'T').rect).toMatchObject({
      x: SNAPPED.x + 30,
      y: SNAPPED.y + 20,
    });
    expect(actions.finishMarkingMove('B', 30, 20).ok).toBe(true);
    actions.commitGesture();
    expect(marking(current(store), 'T').rect).toMatchObject({
      x: SNAPPED.x + 30,
      y: SNAPPED.y + 20,
    });
    expect(undoDepth(store)).toBe(depth + 1);
    store.undo();
    expect(marking(current(store), 'T').rect).toMatchObject(SNAPPED);
    expect(marking(current(store), 'B').rect).toEqual(BUTTON);
  });
});

describe('addComponent ancorado (Paleta)', () => {
  it('com `anchorTo` cria a instância ancorada e já encostada, numa entrada', () => {
    const { store, actions } = setup(addTip(tipProject(), 'B', 'botao', BUTTON));
    const result = actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: TIP_SPEC_ID,
      typeId: 'tooltip',
      anchorTo: 'B',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = marking(current(store), result.value);
    expect(created.anchor).toMatchObject({ to: 'B' });
    expect(created.rect).toMatchObject({ ...SNAPPED, width: 100, height: 48 });
    expect(undoDepth(store)).toBe(1);
  });

  it('sem `anchorTo` vale a regra de hoje: sem âncora, centrada no ponto pedido', () => {
    const { store, actions } = setup(addTip(tipProject(), 'B', 'botao', BUTTON));
    const result = actions.addComponent({
      containerId: 'I1',
      parentId: null,
      specId: TIP_SPEC_ID,
      typeId: 'tooltip',
      center: { x: 500, y: 500 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = marking(current(store), result.value);
    expect(created.anchor ?? null).toBeNull();
    expect(created.rect).toMatchObject({ x: 450, y: 476 });
  });
});
