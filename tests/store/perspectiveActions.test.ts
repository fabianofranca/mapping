import { describe, expect, it, vi } from 'vitest';
import * as model from '../../src/model';
import {
  validateProject,
  type ItemRef,
  type Perspective,
  type Project,
} from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { principalOnly } from '../../src/store/perspectiveGestures';
import type { ArrivalInfo } from '../../src/store/perspectives';
import { createProjectActions } from '../../src/store/project';
import { NOW } from '../model/fixtures';
import { multiProjectAnnotated, rect } from '../model/multiSelectionFixtures';

// As actions do projeto com uma perspectiva aberta (etapa #659, PE2, decisão 5). O canvas chama as
// MESMAS actions com coordenadas da vista. Mundo (ver tests/model/multiSelectionFixtures.ts):
// raízes G (marcação do canvas que cerca A, B e C), D e E (containers), H (marcação do canvas) e
// N (flutuante). A perspectiva P mostra todas, deslocadas:
//
//   G (1000,1000)   D (7000,3000)   E (9000,3000)   H (400,4000)   N (100,6000)
//
// (na Principal: G em (-100,-100), D em (7000,0), E em (9000,0), H em (400,1300), N em (100,1300)).

const perspectiveOf = (store: ReturnType<typeof createProjectStore>): Perspective =>
  project(store).perspectives.find((x) => x.id === 'P')!;

const img = (id: string): ItemRef => ({ kind: 'image', id });
const mark = (id: string): ItemRef => ({ kind: 'marking', id });

const PERSPECTIVE: Perspective = {
  id: 'P',
  name: 'Vista',
  hiddenLayers: [],
  items: [
    { root: 'G', x: 1000, y: 1000 },
    { root: 'D', x: 7000, y: 3000 },
    { root: 'E', x: 9000, y: 3000 },
    { root: 'H', x: 400, y: 4000 },
    { root: 'N', x: 100, y: 6000 },
  ],
};

function world(): Project {
  const base = multiProjectAnnotated();
  const withArrow = model.createArrow(base, { id: 'r1', from: 'a1', to: 'b1' });
  return { ...withArrow, perspectives: [PERSPECTIVE] };
}

function setup(initialOpen: string | null = 'P') {
  let open: string | null = initialOpen;
  let clock = 0;
  const store = createProjectStore({
    now: () => new Date(Date.parse(NOW) + ++clock * 1000).toISOString(),
  });
  const arrivals: (readonly ArrivalInfo[])[] = [];
  let n = 0;
  const actions = createProjectActions(store, {
    newId: () => (n++ === 0 ? 'X' : `X${n}`),
    perspective: () => open,
    onArrival: (infos) => arrivals.push(infos),
  });
  store.load(world());
  return {
    store,
    actions,
    arrivals,
    setOpen: (id: string | null) => {
      open = id;
    },
  };
}

type Store = ReturnType<typeof createProjectStore>;

const project = (store: Store): Project => {
  if (!store.project.value) throw new Error('sem projeto');
  return store.project.value;
};
const item = (store: Store, root: string) =>
  project(store).perspectives[0]?.items.find((i) => i.root === root);
const container = (store: Store, id: string) =>
  project(store).containers.find((c) => c.id === id);
const marking = (store: Store, id: string) =>
  project(store).markings.find((m) => m.id === id);

describe('arrastar uma raiz numa perspectiva', () => {
  it('container raiz: só a posição na perspectiva muda, numa entrada de desfazer', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('D', { x: 7020, y: 3010, scale: 1 }).ok).toBe(
      true,
    );
    expect(actions.previewImagePlacement('D', { x: 7050, y: 3040, scale: 1 }).ok).toBe(
      true,
    );
    expect(store.canUndo.value).toBe(false);
    expect(actions.finishImagePlacement('D').ok).toBe(true);
    actions.commitGesture();

    const after = project(store);
    expect(item(store, 'D')).toEqual({ root: 'D', x: 7050, y: 3040 });
    expect(after.containers).toBe(before.containers);
    expect(after.markings).toBe(before.markings);
    expect(container(store, 'D')?.placement).toEqual({ x: 7000, y: 0, scale: 1 });
    expect(store.revision.value).toBe(1);
    expect(validateProject(after)).toEqual([]);

    expect(store.undo()).toBe(true);
    expect(project(store).perspectives).toEqual(before.perspectives);
    expect(store.canUndo.value).toBe(false);
  });

  it('marcação do canvas raiz: o rect dela não muda, só o item da perspectiva', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    expect(actions.previewMarkingMove('H', 2, 3).ok).toBe(true);
    expect(actions.previewMarkingMove('H', 5.2, 7.4).ok).toBe(true);
    expect(actions.finishMarkingMove('H', 5, 7).ok).toBe(true);
    actions.commitGesture();

    expect(item(store, 'H')).toEqual({ root: 'H', x: 405, y: 4007 });
    expect(marking(store, 'H')?.rect).toEqual(rect(400, 1300, 200, 100));
    expect(project(store).markings).toBe(before.markings);
    expect(store.revision.value).toBe(1);
    store.undo();
    expect(item(store, 'H')).toEqual({ root: 'H', x: 400, y: 4000 });
  });

  it('a flutuante também anda só na perspectiva', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.moveMarking('N', -10, 5).ok).toBe(true);
    expect(item(store, 'N')).toEqual({ root: 'N', x: 90, y: 6005 });
    expect(project(store).markings).toBe(before.markings);
    expect(store.revision.value).toBe(1);
  });

  it('filha de marcação do canvas: arrasta a raiz inteira', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    expect(actions.previewMarkingMove('G2', 10, 4).ok).toBe(true);
    expect(actions.finishMarkingMove('G2', 10, 4).ok).toBe(true);
    actions.commitGesture();
    expect(item(store, 'G')).toEqual({ root: 'G', x: 1010, y: 1004 });
    expect(project(store).markings).toBe(before.markings);
    expect(project(store).containers).toBe(before.containers);
  });

  it('container dentro de uma marcação do canvas: arrasta a raiz inteira', () => {
    const { store, actions } = setup();
    const before = project(store);
    // A está em (0,0) na Principal e em (1100,1100) na vista (G foi para (1000,1000)).
    actions.beginGesture();
    expect(actions.previewImagePlacement('A', { x: 1120, y: 1100, scale: 1 }).ok).toBe(
      true,
    );
    expect(actions.finishImagePlacement('A').ok).toBe(true);
    actions.commitGesture();
    expect(item(store, 'G')).toEqual({ root: 'G', x: 1020, y: 1000 });
    expect(project(store).containers).toBe(before.containers);
  });

  it('o container raiz que sobreporia outro da vista encosta nele (R12.10)', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    // D (7000..8000) pedido em 8500 cairia sobre o E (9000): fica em 8000, encostado.
    const result = actions.previewImagePlacement('D', { x: 8500, y: 3000, scale: 1 });
    expect(result.ok).toBe(true);
    expect(actions.finishImagePlacement('D').ok).toBe(true);
    actions.commitGesture();
    expect(item(store, 'D')).toEqual({ root: 'D', x: 8000, y: 3000 });
    expect(store.revision.value).toBe(1);
    expect(store.undo()).toBe(true);
    expect(item(store, 'D')).toEqual({ root: 'D', x: 7000, y: 3000 });
  });

  it('o arrasto conjunto na perspectiva encosta no container que não se move', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    expect(actions.previewItemsMove([img('D')], 1500, 0).ok).toBe(true);
    expect(actions.finishItemsMove([img('D')], 1500, 0).ok).toBe(true);
    actions.commitGesture();
    expect(item(store, 'D')).toEqual({ root: 'D', x: 8000, y: 3000 });
    expect(store.revision.value).toBe(1);
  });

  it('o container trancado não anda', () => {
    const { store, actions } = setup();
    store.apply((p) => model.setImageLocked(p, 'D', true));
    expect(actions.setContainerPlacement('D', { x: 7100, y: 3000, scale: 1 })).toEqual({
      ok: false,
      error: 'locked',
    });
  });

  it('redimensionar o container raiz: a escala vai ao projeto, a posição pedida ao item', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    expect(actions.previewImagePlacement('D', { x: 6990, y: 3000, scale: 1.1 }).ok).toBe(
      true,
    );
    expect(actions.finishImagePlacement('D').ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'D')?.placement).toEqual({ x: 7000, y: 0, scale: 1.1 });
    expect(item(store, 'D')).toEqual({ root: 'D', x: 6990, y: 3000 });
    expect(store.revision.value).toBe(1);
  });
});

describe('dentro de um container a geometria é a mesma', () => {
  it('mover uma marcação de container muda o projeto, não a perspectiva', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    expect(actions.previewMarkingMove('a3', 10, 10).ok).toBe(true);
    expect(actions.finishMarkingMove('a3', 10, 10).ok).toBe(true);
    actions.commitGesture();
    expect(marking(store, 'a3')?.rect).toEqual(rect(610, 610, 200, 200));
    expect(project(store).perspectives).toBe(before.perspectives);
  });

  it('redimensionar uma marcação de container muda o projeto', () => {
    const { store, actions } = setup();
    expect(actions.setMarkingRect('a3', rect(600, 600, 250, 250)).ok).toBe(true);
    expect(marking(store, 'a3')?.rect).toEqual(rect(600, 600, 250, 250));
  });
});

describe('flutuante: redimensionar', () => {
  it('o tamanho vai ao projeto (x/y da Principal ficam) e a posição pedida ao item', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    expect(actions.previewMarkingRect('N', rect(90, 6000, 260, 120)).ok).toBe(true);
    expect(actions.finishMarkingRect('N', rect(90, 6000, 260, 120)).ok).toBe(true);
    actions.commitGesture();
    expect(marking(store, 'N')?.rect).toEqual(rect(100, 1300, 260, 120));
    expect(item(store, 'N')).toEqual({ root: 'N', x: 90, y: 6000 });
    expect(store.revision.value).toBe(1);
  });

  it('ajuste fino de x/y move o item; de largura/altura muda o projeto', () => {
    const { store, actions } = setup();
    expect(actions.adjustMarkingRect('N', 'x', 150).ok).toBe(true);
    expect(item(store, 'N')).toEqual({ root: 'N', x: 150, y: 6000 });
    expect(marking(store, 'N')?.rect.x).toBe(100);
    expect(actions.adjustMarkingRect('N', 'width', 300).ok).toBe(true);
    expect(marking(store, 'N')?.rect.width).toBe(300);
  });

  it('marcação do canvas que não é flutuante não se redimensiona fora da Principal', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.setMarkingRect('H', rect(400, 1300, 300, 100))).toEqual({
      ok: false,
      error: 'principal-only',
    });
    actions.beginGesture();
    expect(actions.previewMarkingRect('H', rect(400, 1300, 300, 100))).toEqual({
      ok: false,
      error: 'principal-only',
    });
    actions.cancelGesture();
    expect(project(store)).toBe(before);
  });
});

describe('arrasto conjunto e passo das setas', () => {
  it('raízes andam na perspectiva e as marcações de container no projeto, numa entrada', () => {
    const { store, actions } = setup();
    const before = project(store);
    // D (container raiz), H (marcação raiz) e b1 (marcação de container, de B, cuja raiz G não anda).
    const items = [img('D'), mark('H'), mark('b1')];
    actions.beginGesture();
    expect(actions.previewItemsMove(items, 10, 4.4).ok).toBe(true);
    expect(actions.finishItemsMove(items, 10, 4.4).ok).toBe(true);
    actions.commitGesture();

    // Há marcação raiz: o deslocamento do canvas é arredondado uma vez (10, 4).
    expect(item(store, 'D')).toEqual({ root: 'D', x: 7010, y: 3004 });
    expect(item(store, 'H')).toEqual({ root: 'H', x: 410, y: 4004 });
    // b1 anda round(10/2) = 5, round(4.4/2) = 2 pixels do container B (escala 2).
    expect(marking(store, 'b1')?.rect).toEqual(rect(55, 52, 100, 100));
    expect(container(store, 'D')?.placement).toEqual({ x: 7000, y: 0, scale: 1 });
    expect(store.revision.value).toBe(1);
    expect(validateProject(project(store))).toEqual([]);

    store.undo();
    expect(project(store).markings).toBe(before.markings);
    expect(project(store).perspectives).toEqual(before.perspectives);
  });

  it('marcação de container cuja raiz também anda vai com a raiz', () => {
    const { store, actions } = setup();
    const before = project(store);
    const items = [mark('G'), mark('b1')];
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.finishItemsMove(items, 6, 8).ok).toBe(true);
    actions.commitGesture();
    expect(item(store, 'G')).toEqual({ root: 'G', x: 1006, y: 1008 });
    expect(project(store).markings).toBe(before.markings);
  });

  it('passo das setas: o container raiz anda o passo na perspectiva', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    expect(actions.previewItemsNudge([img('D')], 3, 0).ok).toBe(true);
    expect(actions.finishItemsNudge([img('D')], 3, 0).ok).toBe(true);
    actions.commitGesture();
    expect(item(store, 'D')).toEqual({ root: 'D', x: 7003, y: 3000 });
    expect(project(store).containers).toBe(before.containers);
  });
});

describe('só na Principal', () => {
  /** O comando é recusado na perspectiva, sem gravar, e funciona na Principal. */
  function refused(run: (a: ReturnType<typeof setup>['actions']) => unknown) {
    const inPerspective = setup('P');
    const before = project(inPerspective.store);
    expect(run(inPerspective.actions)).toEqual({ ok: false, error: 'principal-only' });
    expect(project(inPerspective.store)).toBe(before);
    expect(inPerspective.store.revision.value).toBe(0);
    expect(inPerspective.store.canUndo.value).toBe(false);
  }

  it('desenhar marcação do canvas que não é flutuante', () => {
    refused((a) => a.createMarking(null, rect(20000, 20000, 100, 100)));
    const { actions, store } = setup(null);
    expect(actions.createMarking(null, rect(20000, 20000, 100, 100)).ok).toBe(true);
    expect(marking(store, 'X')).toBeDefined();
  });

  it('desenhar marcação dentro de um container continua valendo', () => {
    const { actions, store, arrivals } = setup('P');
    expect(actions.createMarking('D', rect(10, 10, 50, 50)).ok).toBe(true);
    expect(marking(store, 'X')?.containerId).toBe('D');
    expect(arrivals).toEqual([]);
  });

  it('a rota de uma seta', () => {
    refused((a) => a.setArrowRoute('r1', [{ x: 2100, y: 600 }]));
    const { actions } = setup('P');
    actions.beginGesture();
    expect(actions.previewArrowRoute('r1', [{ x: 2100, y: 600 }])).toEqual({
      ok: false,
      error: 'principal-only',
    });
    actions.cancelGesture();
    const principal = setup(null);
    expect(principal.actions.setArrowRoute('r1', [{ x: 2100, y: 600 }]).ok).toBe(true);
  });

  it('arrumar', () => {
    refused((a) => a.arrange('G'));
    const { actions } = setup(null);
    const result = actions.arrange('G');
    expect(result.ok || result.error !== 'principal-only').toBe(true);
  });

  it('excluir uma raiz (container, marcação ou seleção)', () => {
    refused((a) => a.removeContainer('D'));
    refused((a) => a.removeMarking('H'));
    refused((a) => a.removeItems([img('D'), mark('c1')]));
    const { actions, store } = setup('P');
    // Marcação de container não é raiz: exclui normalmente.
    expect(actions.removeMarking('c1').ok).toBe(true);
    expect(marking(store, 'c1')).toBeUndefined();
    const principal = setup(null);
    expect(principal.actions.removeContainer('D').ok).toBe(true);
    expect(principal.actions.removeMarking('H').ok).toBe(true);
  });

  it('principalOnly diz à interface o que desabilitar', () => {
    const p = world();
    expect(principalOnly(p, null, 'draw-canvas')).toBe(false);
    expect(principalOnly(p, null, 'delete', ['D'])).toBe(false);
    expect(principalOnly(p, 'P', 'draw-canvas')).toBe(true);
    expect(principalOnly(p, 'P', 'arrow-route')).toBe(true);
    expect(principalOnly(p, 'P', 'arrange')).toBe(true);
    expect(principalOnly(p, 'P', 'delete', ['D', 'c1'])).toBe(true);
    expect(principalOnly(p, 'P', 'delete', ['c1', 'a3'])).toBe(false);
    expect(principalOnly(p, 'P', 'delete')).toBe(false);
    expect(principalOnly(p, 'nao-existe', 'arrange')).toBe(false);
  });
});

describe('criar numa perspectiva', () => {
  it('o container novo entra nela onde foi criado e chega à Principal', () => {
    const { store, actions, arrivals } = setup();
    const before = project(store);
    const result = actions.addBackgroundContainer({
      name: null,
      width: 400,
      height: 300,
      background: '#FFFFFF',
      center: { x: 20000, y: 20000 },
    });
    expect(result).toEqual({ ok: true, value: 'X' });
    // Onde o modelo o pôs ao criar (na Principal, antes de a chegada o mover).
    const created = model.addBackgroundContainer(before, {
      id: 'X',
      width: 400,
      height: 300,
      background: '#FFFFFF',
      center: { x: 20000, y: 20000 },
    });
    const at = model.rootPosition(created, 'X');
    expect(item(store, 'X')).toEqual({ root: 'X', ...at });
    // Chegou à Principal: a área de chegada, com a marca.
    expect(project(store).arrivals).toEqual([
      { root: 'X', from: 'P', fromName: 'Vista' },
    ]);
    expect(model.rootPosition(project(store), 'X')).not.toEqual(at);
    expect(arrivals).toEqual([
      [{ root: 'X', from: 'P', kind: 'arrival-area', referenceId: null }],
    ]);
    expect(store.revision.value).toBe(1);
    expect(validateProject(project(store))).toEqual([]);
    store.undo();
    expect(project(store).arrivals).toEqual([]);
    expect(item(store, 'X')).toBeUndefined();
  });

  it('dois containers criados seguidos na perspectiva não se sobrepõem na vista dela', () => {
    const { store, actions } = setup();
    const args = {
      name: null,
      width: 360,
      height: 800,
      background: '#FFFFFF',
      center: { x: 20000, y: 20000 },
    };
    expect(actions.addBackgroundContainer(args).ok).toBe(true);
    expect(actions.addBackgroundContainer(args).ok).toBe(true);
    const shown = model.perspectiveView(project(store), perspectiveOf(store));
    const rects = shown.containers.map((c) => model.imageCanvasRect(c, c.placement));
    for (const [i, a] of rects.entries()) {
      for (const b of rects.slice(i + 1)) expect(model.rectsOverlap(a, b)).toBe(false);
    }
  });

  it('a flutuante nova com seta para uma raiz da perspectiva chega perto dela', () => {
    const { store, actions, arrivals } = setup();
    const result = actions.applyCreating((p) =>
      model.createArrow(
        model.createMarking(p, {
          id: 'F',
          containerId: null,
          rect: rect(30000, 30000, 200, 100),
          floating: true,
        }),
        { id: 'rF', from: 'F', to: 'a1' },
      ),
    );
    expect(result.ok).toBe(true);
    expect(item(store, 'F')).toEqual({ root: 'F', x: 30000, y: 30000 });
    expect(project(store).arrivals.map((a) => a.root)).toEqual(['F']);
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]).toEqual([
      { root: 'F', from: 'P', kind: 'near', referenceId: 'G' },
    ]);
    // Na Principal fica à mesma distância de G que tinha na perspectiva (G: (1000,1000) na vista,
    // (-100,-100) na Principal; F: (30000,30000) na vista).
    expect(model.rootPosition(project(store), 'F')).toEqual({ x: 28900, y: 28900 });
  });

  it('a marcação do canvas nova que não é flutuante recusa a operação inteira', () => {
    const { store, actions, arrivals } = setup();
    const before = project(store);
    const result = actions.applyCreating((p) =>
      model.createMarking(p, {
        id: 'K',
        containerId: null,
        rect: rect(30000, 30000, 200, 100),
      }),
    );
    expect(result).toEqual({ ok: false, error: 'principal-only' });
    expect(project(store)).toBe(before);
    expect(arrivals).toEqual([]);
  });

  it('envolver a seleção cria marcação do canvas: só na Principal', () => {
    const { actions } = setup();
    expect(actions.wrapItems([img('D')])).toEqual({ ok: false, error: 'principal-only' });
  });

  it('na Principal nada muda: sem chegada, sem aviso', () => {
    const { store, actions, arrivals } = setup(null);
    const result = actions.addBackgroundContainer({
      name: null,
      width: 400,
      height: 300,
      background: '#FFFFFF',
      center: { x: 20000, y: 20000 },
    });
    expect(result.ok).toBe(true);
    expect(project(store).arrivals).toEqual([]);
    expect(arrivals).toEqual([]);
  });

  it('o aviso só sai quando a operação entrou', () => {
    const onArrival = vi.fn();
    const store = createProjectStore();
    const actions = createProjectActions(store, {
      newId: () => 'X',
      perspective: () => 'P',
      onArrival,
    });
    store.load(world(), { readOnly: true });
    const result = actions.addBackgroundContainer({
      name: null,
      width: 400,
      height: 300,
      background: '#FFFFFF',
    });
    expect(result.ok).toBe(false);
    expect(onArrival).not.toHaveBeenCalled();
  });
});
