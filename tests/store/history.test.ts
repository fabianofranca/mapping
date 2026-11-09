import { effect } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import {
  moveContainer,
  moveMarking,
  renameLayer,
  renameProject,
  validateProject,
} from '../../src/model';
import { HISTORY_LIMIT, createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW, emptyProject, sampleProject } from '../model/fixtures';

function setup() {
  let clock = 0;
  const store = createProjectStore({
    now: () => new Date(Date.parse(NOW) + ++clock * 1000).toISOString(),
  });
  let seq = 0;
  const actions = createProjectActions(store, { newId: () => `id${++seq}` });
  store.load(sampleProject());
  return { store, actions };
}

const project = (store: ReturnType<typeof createProjectStore>) => {
  if (!store.project.value) throw new Error('sem projeto');
  return store.project.value;
};

describe('store: actions e histórico', () => {
  it('sem projeto aberto, as actions falham', () => {
    const store = createProjectStore();
    expect(store.apply((p) => p)).toEqual({ ok: false, error: 'no-project' });
    expect(store.undo()).toBe(false);
  });

  it('aplica, desfaz e refaz', () => {
    const { store, actions } = setup();
    const original = project(store);
    expect(store.canUndo.value).toBe(false);

    expect(actions.renameLayer('L1', 'Pintura')).toEqual({ ok: true, value: undefined });
    expect(project(store).layers[0]?.name).toBe('Pintura');
    expect(project(store).project.updatedAt).not.toBe(original.project.updatedAt);
    expect(store.canUndo.value).toBe(true);
    expect(store.revision.value).toBe(1);

    expect(store.undo()).toBe(true);
    expect(project(store).layers[0]?.name).toBe('Lataria');
    expect(store.canRedo.value).toBe(true);

    expect(store.redo()).toBe(true);
    expect(project(store).layers[0]?.name).toBe('Pintura');
    expect(store.canRedo.value).toBe(false);
  });

  it('uma nova alteração limpa o refazer', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'A');
    store.undo();
    actions.renameLayer('L1', 'B');
    expect(store.canRedo.value).toBe(false);
    expect(store.redo()).toBe(false);
  });

  it('erro do modelo não altera o projeto nem o histórico', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.removeLayer('L9')).toEqual({ ok: false, error: 'not-found' });
    expect(
      actions.setMarkingRect('M3', { x: 1300, y: 1250, width: 5, height: 50 }),
    ).toEqual({ ok: false, error: 'rect-too-small' });
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('operação que não muda nada não entra no histórico', () => {
    const { store } = setup();
    store.apply((p) => p);
    expect(store.canUndo.value).toBe(false);
  });

  it('actions que criam itens devolvem o id gerado', () => {
    const { store, actions } = setup();
    const layer = actions.addLayer('Pneus', '#000000');
    expect(layer).toEqual({ ok: true, value: 'id1' });
    const m = actions.createMarking('I1', { x: 1700, y: 1700, width: 100, height: 100 });
    expect(m).toEqual({ ok: true, value: 'id2' });
    const a = actions.addAnnotation('id2', 'id1', null, [{ key: 'k', value: 'v' }]);
    expect(a).toEqual({ ok: true, value: 'id3' });
    expect(project(store).markings.find((x) => x.id === 'id2')?.parentId).toBe('M1');
  });

  it('limita o histórico a 100 entradas', () => {
    const { store } = setup();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      store.apply((p) => renameLayer(p, 'L1', `n${i}`));
    }
    let undos = 0;
    while (store.undo()) undos++;
    expect(undos).toBe(HISTORY_LIMIT);
    expect(project(store).layers[0]?.name).toBe('n19');
  });

  it('referencedImageFiles junta as imagens do projeto e de todo o histórico', () => {
    const store = createProjectStore({ now: () => NOW });
    let seq = 0;
    const actions = createProjectActions(store, { newId: () => `id${++seq}` });
    store.load(emptyProject());
    expect(actions.addContainer({ file: 'images/a.jpg', width: 10, height: 10 }).ok).toBe(
      true,
    );
    expect(actions.addContainer({ file: 'images/b.jpg', width: 10, height: 10 }).ok).toBe(
      true,
    );
    const containerId = (file: string) =>
      project(store).containers.find((i) => i.file === file)?.id ?? '';
    actions.removeContainer(containerId('images/a.jpg'));
    expect(project(store).containers.map((i) => i.file)).toEqual(['images/b.jpg']);
    // a.jpg saiu do projeto, mas o desfazer ainda a restauraria.
    expect([...store.referencedImageFiles()].sort()).toEqual([
      'images/a.jpg',
      'images/b.jpg',
    ]);

    // Desfazer tudo: a.jpg e b.jpg ficam só no "refazer".
    while (store.undo());
    expect(project(store).containers).toEqual([]);
    expect([...store.referencedImageFiles()].sort()).toEqual([
      'images/a.jpg',
      'images/b.jpg',
    ]);

    // Uma nova alteração descarta o "refazer": nada mais referencia as imagens.
    store.apply((p) => renameLayer(p, 'L1', 'novo'));
    expect(store.referencedImageFiles().size).toBe(0);
  });

  it('modo somente leitura bloqueia alterações', () => {
    const store = createProjectStore();
    store.load(emptyProject(), { readOnly: true });
    expect(store.apply((p) => renameLayer(p, 'L1', 'x'))).toEqual({
      ok: false,
      error: 'read-only',
    });
    expect(store.beginGesture()).toEqual({ ok: false, error: 'read-only' });
  });

  it('carregar outro projeto zera o histórico', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'A');
    store.load(emptyProject());
    expect(store.canUndo.value).toBe(false);
    store.close();
    expect(store.project.value).toBeNull();
  });
});

describe('store: gestos', () => {
  it('um gesto gera uma única entrada no histórico', () => {
    const { store } = setup();
    const before = project(store);
    expect(store.beginGesture().ok).toBe(true);
    for (let dx = 10; dx <= 100; dx += 10) {
      expect(store.updateGesture((p) => moveMarking(p, 'M1', dx, 0)).ok).toBe(true);
    }
    expect(project(store).markings[0]?.rect.x).toBe(1100);
    expect(store.canUndo.value).toBe(false);
    expect(store.revision.value).toBe(0);
    store.commitGesture();

    expect(store.revision.value).toBe(1);
    expect(project(store).markings[0]?.rect.x).toBe(1100);
    expect(project(store).markings[1]?.rect.x).toBe(1300);
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
    expect(store.undo()).toBe(false);
  });

  it('prévia inválida mantém a última posição válida', () => {
    const { store } = setup();
    store.beginGesture();
    store.updateGesture((p) => moveContainer(p, 'I2', 1200, 0));
    const result = store.updateGesture((p) => moveContainer(p, 'I2', 500, 0));
    expect(result).toEqual({ ok: false, error: 'image-overlap' });
    expect(project(store).containers[1]?.placement.x).toBe(1200);
    store.commitGesture();
    expect(project(store).containers[1]?.placement.x).toBe(1200);
  });

  it('cancelar volta ao início sem histórico', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveContainer(p, 'I2', 1200, 0));
    store.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('gesto sem mudança não entra no histórico', () => {
    const { store } = setup();
    store.beginGesture();
    store.commitGesture();
    expect(store.canUndo.value).toBe(false);
  });

  it('actions de gesto: mover imagem com prévias, sobreposição e uma entrada', () => {
    const { store, actions } = setup();
    const before = project(store);
    const start = before.containers[1]?.placement;
    if (!start) throw new Error('sem I2');
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I2', { ...start, y: 900 }).ok).toBe(true);
    // Em cima da I1 (0..1000 × 0..750): encosta nela (x = 1000) e desliza no y pedido.
    expect(actions.previewImagePlacement('I2', { ...start, x: 100, y: 100 }).ok).toBe(
      true,
    );
    expect(project(store).containers[1]?.placement).toEqual({
      ...start,
      x: 1000,
      y: 100,
    });
    actions.commitGesture();
    expect(project(store).containers[1]?.placement).toEqual({
      ...start,
      x: 1000,
      y: 100,
    });
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(before.containers);
    expect(store.undo()).toBe(false);
  });

  it('actions de gesto: redimensionar e cancelar', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.beginGesture();
    actions.previewImagePlacement('I1', { x: 0, y: 0, scale: 0.1 });
    expect(project(store).containers[0]?.placement.scale).toBe(0.1);
    actions.cancelGesture();
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('durante o gesto, outras actions e undo ficam bloqueados', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'A');
    store.beginGesture();
    expect(store.gestureActive.value).toBe(true);
    expect(actions.renameLayer('L1', 'B')).toEqual({
      ok: false,
      error: 'gesture-active',
    });
    expect(store.canUndo.value).toBe(false);
    expect(store.undo()).toBe(false);
    expect(store.beginGesture()).toEqual({ ok: false, error: 'gesture-active' });
    store.cancelGesture();
    expect(store.undo()).toBe(true);
  });
  it('actions de gesto: mover a marcação com as filhas, sem prender, e assentar ao soltar numa entrada', () => {
    const { store, actions } = setup();
    const before = project(store);
    const rectOf = (id: string) => project(store).markings.find((m) => m.id === id)?.rect;
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('M1', 40.4, -10);
    actions.previewMarkingMove('M1', 100.4, -50.6);
    expect(rectOf('M1')).toMatchObject({ x: 1100, y: 949 });
    expect(rectOf('M3')).toMatchObject({ x: 1400, y: 1199 });
    expect(actions.finishMarkingMove('M1', 100, -51).ok).toBe(true);
    actions.commitGesture();
    expect(rectOf('M1')).toMatchObject({ x: 1100, y: 949 });

    // Nada prende a marcação: ela sai do container (o `rect` passa de 4000 de largura) e o
    // assentar a leva ao canvas, onde é uma marcação sem pai.
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewMarkingMove('M3', 10_000, 0).ok).toBe(true);
    expect(rectOf('M3')).toMatchObject({ x: 11_400 });
    expect(actions.finishMarkingMove('M3', 10_000, 0).ok).toBe(true);
    actions.commitGesture();
    const m3 = project(store).markings.find((m) => m.id === 'M3');
    expect(m3).toMatchObject({ containerId: null, parentId: null });
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
    expect(store.canUndo.value).toBe(false);
  });

  it('actions de gesto: redimensionar marcação inválido fica na última prévia válida', () => {
    const { store, actions } = setup();
    actions.beginGesture();
    const ok = { x: 1000, y: 1000, width: 900, height: 900 };
    expect(actions.previewMarkingRect('M1', ok).ok).toBe(true);
    // Fora do container: recusado, fica a última válida.
    const bad = { x: 3900, y: 1000, width: 500, height: 100 };
    expect(actions.previewMarkingRect('M1', bad)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    expect(actions.finishMarkingRect('M1', ok).ok).toBe(true);
    actions.commitGesture();
    expect(project(store).markings.find((m) => m.id === 'M1')?.rect).toEqual(ok);
    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });
});

// Etapa Marcações espaciais (ME1): as prévias não assentam e a operação final, dentro do mesmo
// gesto, decide espaço e pai; desfazer volta tudo de uma vez.
describe('store: gestos com assentar (ME1)', () => {
  // sampleProject: I1 (4000×3000, escala 0,25: 1000×750 no canvas) em (0, 0); I2 (1000×1000,
  // escala 1) à direita, em (1050, 0). M1 › M2 › M3 em I1; M4 em I2.
  const find = (store: ReturnType<typeof createProjectStore>, id: string) =>
    project(store).markings.find((m) => m.id === id);
  const container = (store: ReturnType<typeof createProjectStore>, id: string) =>
    project(store).containers.find((c) => c.id === id);

  it('mover uma marcação de A para B leva as filhas, converte o rect e desfaz tudo de uma vez', () => {
    const { store, actions } = setup();
    const before = project(store);
    // M2 (1200,1200,400×200 em I1) está em (300, 300) no canvas; levada para (1500, 400) cai
    // inteira em I2: 1200 unidades do canvas = 4800 pixels de I1; 100 = 400.
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewMarkingMove('M2', 2400, 200).ok).toBe(true);
    // Durante o gesto o pertencimento está congelado.
    expect(find(store, 'M2')).toMatchObject({ containerId: 'I1', parentId: 'M1' });
    expect(find(store, 'M3')).toMatchObject({ containerId: 'I1', parentId: 'M2' });
    expect(actions.previewMarkingMove('M2', 4800, 400).ok).toBe(true);
    expect(actions.finishMarkingMove('M2', 4800, 400).ok).toBe(true);
    // O confirmado só muda no commit.
    expect(store.committed.value).toBe(before);
    actions.commitGesture();

    expect(find(store, 'M2')).toMatchObject({
      containerId: 'I2',
      parentId: null,
      rect: { x: 450, y: 400, width: 100, height: 50 },
    });
    // M3 foi junto (descendente) e continua filha de M2, agora em pixels de I2.
    expect(find(store, 'M3')).toMatchObject({ containerId: 'I2', parentId: 'M2' });
    expect(validateProject(project(store))).toEqual([]);

    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
    expect(store.canUndo.value).toBe(false);
    // Refazer volta ao resultado do gesto inteiro.
    expect(store.redo()).toBe(true);
    expect(find(store, 'M2')?.containerId).toBe('I2');
  });

  it('a prévia de redimensionar não assenta; soltar tira do pai o que deixou de caber', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.beginGesture().ok).toBe(true);
    // M1 encolhe para a ponta de cima à esquerda: M2 (1200..1600) deixa de caber.
    const smaller = { x: 1000, y: 1000, width: 300, height: 300 };
    expect(actions.previewMarkingRect('M1', smaller).ok).toBe(true);
    expect(find(store, 'M2')?.parentId).toBe('M1'); // congelado na prévia
    expect(actions.finishMarkingRect('M1', smaller).ok).toBe(true);
    actions.commitGesture();
    expect(find(store, 'M1')?.rect).toEqual(smaller);
    expect(find(store, 'M2')?.parentId).toBeNull();
    expect(find(store, 'M3')?.parentId).toBe('M2');
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
  });

  it('mover um container para fora e para dentro de uma marcação do canvas, uma entrada cada', () => {
    const { store, actions } = setup();
    // Marcação do canvas em volta só de I1 (0..1000 × 0..750); I2 (a partir de 1050) fica fora.
    const created = actions.createMarking(null, {
      x: -50,
      y: -50,
      width: 1100,
      height: 850,
    });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.value : '';
    expect(container(store, 'I1')?.parentId).toBe(id);
    expect(container(store, 'I2')?.parentId).toBeNull();
    const afterCreate = project(store);

    // I1 sai para longe: congelado durante o gesto, solto ao soltar.
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I1', { x: 4000, y: 0, scale: 0.25 }).ok).toBe(
      true,
    );
    expect(container(store, 'I1')?.parentId).toBe(id);
    expect(actions.finishImagePlacement('I1').ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'I1')?.parentId).toBeNull();

    // E volta: passa a ser membro de novo.
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I1', { x: 0, y: 0, scale: 0.25 }).ok).toBe(
      true,
    );
    expect(actions.finishImagePlacement('I1').ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'I1')?.parentId).toBe(id);

    expect(store.undo()).toBe(true);
    expect(container(store, 'I1')?.parentId).toBeNull();
    expect(store.undo()).toBe(true);
    expect(project(store).containers).toBe(afterCreate.containers);
  });

  it('a final de mover o container usa a última posição válida', () => {
    const { store, actions } = setup();
    const start = container(store, 'I2')?.placement;
    if (!start) throw new Error('sem I2');
    expect(actions.beginGesture().ok).toBe(true);
    expect(actions.previewImagePlacement('I2', { ...start, y: 900 }).ok).toBe(true);
    // Por cima da I1: a prévia encosta nela (x = 1000, y = 100); a final assenta essa posição.
    expect(actions.previewImagePlacement('I2', { ...start, x: 100, y: 100 }).ok).toBe(
      true,
    );
    expect(actions.finishImagePlacement('I2').ok).toBe(true);
    actions.commitGesture();
    expect(container(store, 'I2')?.placement).toEqual({ ...start, x: 1000, y: 100 });
  });

  it('a operação final nunca falha: se falhar, assenta a última prévia válida', () => {
    const { store, actions } = setup();
    expect(actions.beginGesture().ok).toBe(true);
    const smaller = { x: 1000, y: 1000, width: 300, height: 300 };
    expect(actions.previewMarkingRect('M1', smaller).ok).toBe(true);
    // Um retângulo fora do container faria a final falhar...
    const bad = { x: 3900, y: 1000, width: 500, height: 100 };
    expect(actions.finishMarkingRect('M1', bad)).toEqual({
      ok: false,
      error: 'rect-out-of-image',
    });
    // ...mas a prévia gravada já está assentada (M2 saiu do pai que encolheu).
    actions.commitGesture();
    expect(find(store, 'M1')?.rect).toEqual(smaller);
    expect(find(store, 'M2')?.parentId).toBeNull();
    expect(validateProject(project(store))).toEqual([]);
  });

  it('sem mudança de verdade, o gesto não entra no histórico', () => {
    const { store, actions } = setup();
    expect(actions.beginGesture().ok).toBe(true);
    actions.previewMarkingMove('M2', 40, 40);
    // A final volta ao ponto de partida.
    expect(actions.finishMarkingMove('M2', 0, 0).ok).toBe(true);
    actions.commitGesture();
    expect(store.canUndo.value).toBe(false);
  });

  it('as actions fora de gesto assentam (mover e redimensionar são geometria)', () => {
    const { store, actions } = setup();
    expect(actions.moveMarking('M2', 4800, 400).ok).toBe(true);
    expect(find(store, 'M2')?.containerId).toBe('I2');
    expect(store.undo()).toBe(true);
    expect(find(store, 'M2')?.containerId).toBe('I1');
    // Encolher o pai por cima da filha é aceito e a filha sai do pertencimento.
    expect(
      actions.setMarkingRect('M1', { x: 1000, y: 1000, width: 100, height: 100 }).ok,
    ).toBe(true);
    expect(find(store, 'M2')?.parentId).toBeNull();
  });

  it('setMarkingFloating: a flutuante vai ao canvas e o desfazer a devolve', () => {
    const { store, actions } = setup();
    const before = project(store);
    expect(actions.setMarkingFloating('M4', true).ok).toBe(true);
    expect(find(store, 'M4')).toMatchObject({
      floating: true,
      containerId: null,
      parentId: null,
    });
    expect(actions.setMarkingFloating('M4', false).ok).toBe(true);
    // Desligar a devolve ao container que a contém inteira (M4 está sobre I2).
    expect(find(store, 'M4')).toMatchObject({ floating: false, containerId: 'I2' });
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(project(store).markings).toBe(before.markings);
  });

  it('marcação flutuante trancada não vira comum nem o contrário', () => {
    const { actions } = setup();
    expect(actions.setMarkingLocked('M4', true).ok).toBe(true);
    expect(actions.setMarkingFloating('M4', true)).toEqual({
      ok: false,
      error: 'locked',
    });
  });
});

describe('store: projeto confirmado (committed)', () => {
  const committed = (store: ReturnType<typeof createProjectStore>) => {
    if (!store.committed.value) throw new Error('sem projeto');
    return store.committed.value;
  };

  it('fora de um gesto é o mesmo objeto de project', () => {
    const { store, actions } = setup();
    expect(store.committed.value).toBe(store.project.value);
    actions.renameLayer('L1', 'A');
    expect(store.committed.value).toBe(store.project.value);
    store.close();
    expect(store.committed.value).toBeNull();
  });

  it('durante o gesto fica no projeto do início, mesmo com as prévias', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    expect(committed(store)).toBe(before);
    for (let dx = 10; dx <= 100; dx += 10) {
      store.updateGesture((p) => moveMarking(p, 'M1', dx, 0));
      expect(committed(store)).toBe(before);
    }
    expect(project(store)).not.toBe(before);
    expect(committed(store).markings[0]?.rect.x).toBe(1000);
  });

  it('commitGesture passa de uma vez para o projeto final', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveMarking(p, 'M1', 100, 0));
    const seen: unknown[] = [];
    const dispose = effect(() => {
      seen.push(store.committed.value);
    });
    store.commitGesture();
    dispose();
    expect(committed(store)).toBe(project(store));
    expect(committed(store).markings[0]?.rect.x).toBe(1100);
    // Valor inicial + o final: nenhum valor intermediário.
    expect(seen).toEqual([before, project(store)]);
  });

  it('gesto sem mudança mantém o mesmo projeto', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.commitGesture();
    expect(committed(store)).toBe(before);
    expect(project(store)).toBe(before);
  });

  it('cancelGesture volta ao projeto do início', () => {
    const { store } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveContainer(p, 'I2', 1200, 0));
    store.cancelGesture();
    expect(committed(store)).toBe(before);
    expect(project(store)).toBe(before);
  });

  it('desfazer e refazer atualizam o projeto confirmado', () => {
    const { store, actions } = setup();
    const before = project(store);
    store.beginGesture();
    store.updateGesture((p) => moveMarking(p, 'M1', 100, 0));
    store.commitGesture();
    const after = project(store);

    expect(store.undo()).toBe(true);
    expect(committed(store)).toBe(project(store));
    expect(committed(store).markings).toBe(before.markings);

    expect(store.redo()).toBe(true);
    expect(committed(store)).toBe(project(store));
    expect(committed(store).markings).toBe(after.markings);

    actions.renameLayer('L1', 'X');
    expect(committed(store).layers[0]?.name).toBe('X');
  });

  it('carregar ou fechar durante um gesto limpa o projeto confirmado', () => {
    const { store } = setup();
    store.beginGesture();
    store.updateGesture((p) => moveMarking(p, 'M1', 100, 0));
    const next = emptyProject();
    store.load(next);
    expect(committed(store)).toBe(next);
    store.beginGesture();
    store.close();
    expect(store.committed.value).toBeNull();
  });
});

describe('store: revisão de propostas (etapa 4)', () => {
  function linked() {
    const calls: string[] = [];
    const link = {
      tag: 'P1',
      undo: () => void calls.push('undo'),
      redo: () => void calls.push('redo'),
    };
    return { calls, link };
  }

  it('durante a revisão o projeto é somente leitura: apply, gestos e desfazer são recusados', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'Antes');
    store.setReviewing('P1');

    expect(store.reviewing.value).toBe(true);
    expect(actions.renameLayer('L1', 'Depois')).toEqual({
      ok: false,
      error: 'reviewing',
    });
    expect(store.beginGesture()).toEqual({ ok: false, error: 'reviewing' });
    expect(store.canUndo.value).toBe(false);
    expect(store.undo()).toBe(false);
    expect(project(store).layers[0]?.name).toBe('Antes');

    store.setReviewing(null);
    expect(actions.renameLayer('L1', 'Depois')).toEqual({ ok: true, value: undefined });
    expect(store.undo()).toBe(true);
  });

  it('uma entrada com efeito (a aplicação das aceitas) passa pelo bloqueio e desfaz e refaz o efeito junto', () => {
    const { store } = setup();
    const { calls, link } = linked();
    store.setReviewing('P1');
    const original = project(store);

    const result = store.apply((p) => renameLayer(p, 'L1', 'Aplicado'), { link });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(project(store).layers[0]?.name).toBe('Aplicado');
    expect(store.canUndo.value).toBe(true);

    expect(store.undo()).toBe(true);
    expect(calls).toEqual(['undo']);
    expect(project(store).layers[0]?.name).toBe(original.layers[0]?.name);
    expect(store.canRedo.value).toBe(true);

    expect(store.redo()).toBe(true);
    expect(calls).toEqual(['undo', 'redo']);
    expect(project(store).layers[0]?.name).toBe('Aplicado');
  });

  it('na revisão só dá para desfazer entradas da própria revisão, não as de antes', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'De antes');
    store.setReviewing('P1');
    const { calls, link } = linked();
    store.apply((p) => renameLayer(p, 'L2', 'Da revisão'), { link });

    expect(store.undo()).toBe(true);
    expect(calls).toEqual(['undo']);
    // A entrada anterior é de uma edição normal: fica para depois da revisão.
    expect(store.canUndo.value).toBe(false);
    expect(store.undo()).toBe(false);
    store.setReviewing(null);
    expect(store.undo()).toBe(true);
    expect(calls).toEqual(['undo']);
  });

  it('na revisão de P2, uma entrada com vínculo de P1 não desfaz nem refaz; na de P1, sim', () => {
    const { store } = setup();
    const { calls, link } = linked();
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado por P1'), { link });
    const withP1 = project(store);

    store.setReviewing('P2');
    expect(store.canUndo.value).toBe(false);
    expect(store.undo()).toBe(false);
    expect(calls).toEqual([]);
    expect(project(store)).toBe(withP1);

    store.setReviewing('P1');
    expect(store.undo()).toBe(true);
    expect(calls).toEqual(['undo']);
    expect(store.canRedo.value).toBe(true);

    store.setReviewing('P2');
    expect(store.canRedo.value).toBe(false);
    expect(store.redo()).toBe(false);
    expect(calls).toEqual(['undo']);

    store.setReviewing('P1');
    expect(store.redo()).toBe(true);
    expect(calls).toEqual(['undo', 'redo']);
  });

  it('o projeto só leitura (schema novo) continua recusando até as entradas da revisão', () => {
    const store = createProjectStore();
    store.load(sampleProject(), { readOnly: true });
    const { link } = linked();
    expect(store.apply((p) => p, { link })).toEqual({ ok: false, error: 'read-only' });
  });

  it('discardRedoOf descarta o "refazer" que tem o efeito da proposta, e só ele', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'Normal');
    store.undo();
    store.discardRedoOf('P1');
    expect(store.canRedo.value).toBe(true);

    const { link } = linked();
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado'), { link });
    store.undo();
    expect(store.canRedo.value).toBe(true);
    store.discardRedoOf('outra');
    expect(store.canRedo.value).toBe(true);
    store.discardRedoOf('P1');
    expect(store.canRedo.value).toBe(false);
  });

  it('detachLinks tira o vínculo da proposta do desfazer e do refazer, mantendo as entradas (fase 9.2)', () => {
    const { store, actions } = setup();
    const { calls, link } = linked();
    const other = {
      tag: 'P2',
      undo: () => void calls.push('undo-P2'),
      redo: () => void calls.push('redo-P2'),
    };
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado'), { link });
    actions.renameLayer('L2', 'Normal');
    store.apply((p) => renameProject(p, 'Outra'), { link: other });
    store.undo();
    expect(calls).toEqual(['undo-P2']);
    expect(store.canRedo.value).toBe(true);

    store.detachLinks('P1');

    // O desfazer e o refazer do projeto seguem valendo, sem chamar o vínculo tirado.
    store.undo();
    store.undo();
    expect(project(store).layers.find((l) => l.id === 'L1')?.name).not.toBe('Aplicado');
    expect(store.canUndo.value).toBe(false);
    store.redo();
    store.redo();
    expect(project(store).layers.find((l) => l.id === 'L1')?.name).toBe('Aplicado');
    // O vínculo de outra proposta (P2) continua ligado.
    store.redo();
    expect(calls).toEqual(['undo-P2', 'redo-P2']);
    // `discardRedoOf` já não enxerga a proposta tirada.
    store.undo();
    store.undo();
    store.undo();
    store.discardRedoOf('P1');
    expect(store.canRedo.value).toBe(true);
  });

  it('detachLinks sem entradas daquela proposta não mexe no histórico', () => {
    const { store, actions } = setup();
    actions.renameLayer('L1', 'Antes');
    store.undo();
    store.detachLinks('P1');
    expect(store.canUndo.value).toBe(false);
    expect(store.canRedo.value).toBe(true);
  });

  it('fechar o projeto desliga a revisão; carregar outro (recarga externa) não', () => {
    const { store } = setup();
    store.setReviewing('P1');
    store.load(sampleProject());
    expect(store.reviewing.value).toBe(true);
    store.close();
    expect(store.reviewing.value).toBe(false);
  });
});

describe('store: vínculo assíncrono do histórico (desfazer espera a gravação da proposta)', () => {
  function deferred() {
    let resolve: (r: { ok: true } | { ok: false; error: string }) => void = () => {};
    const promise = new Promise<{ ok: true } | { ok: false; error: string }>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  function asyncLinked() {
    const pending: ReturnType<typeof deferred>[] = [];
    const next = () => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    };
    return { pending, link: { tag: 'P1', undo: next, redo: next } };
  }

  it('com o desfazer pendente, canUndo/canRedo ficam falsos e undo/redo recusam; resolvido, voltam', async () => {
    const { store } = setup();
    const { pending, link } = asyncLinked();
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado'), { link });

    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
    expect(store.canRedo.value).toBe(false);
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(false);

    pending[0]?.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.canRedo.value).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
    pending[1]?.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.canUndo.value).toBe(true);
  });

  it('falha da gravação no desfazer: o passo é revertido (projeto e pilhas) e o erro fica à vista', async () => {
    const { store } = setup();
    const { pending, link } = asyncLinked();
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado'), { link });
    const applied = project(store);

    expect(store.undo()).toBe(true);
    pending[0]?.resolve({ ok: false, error: 'write-failed' });
    await Promise.resolve();
    await Promise.resolve();

    expect(project(store).layers.find((l) => l.id === 'L1')?.name).toBe('Aplicado');
    expect(project(store).layers).toEqual(applied.layers);
    expect(store.canUndo.value).toBe(true);
    expect(store.canRedo.value).toBe(false);
    expect(store.linkFailure.value?.error).toBe('write-failed');
  });

  it('commit, undo e redo escrevem os sinais num batch: um effect que lê os quatro roda uma vez', () => {
    const { store } = setup();
    let runs = 0;
    const stop = effect(() => {
      void store.project.value;
      void store.revision.value;
      void store.canUndo.value;
      void store.canRedo.value;
      runs++;
    });
    try {
      for (const step of [
        () => store.apply((p) => renameLayer(p, 'L1', 'Um')),
        () => store.undo(),
        () => store.redo(),
      ]) {
        const before = runs;
        step();
        expect(runs - before).toBe(1);
      }
    } finally {
      stop();
    }
  });

  it('falha síncrona (exceção) no desfazer: o passo é revertido e linkFailure é definido', () => {
    const { store } = setup();
    const boom = () => {
      throw new Error('sync');
    };
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado'), {
      link: { tag: 'P1', undo: boom, redo: boom },
    });

    expect(store.undo()).toBe(true);
    expect(project(store).layers.find((l) => l.id === 'L1')?.name).toBe('Aplicado');
    expect(store.canUndo.value).toBe(true);
    expect(store.canRedo.value).toBe(false);
    expect(store.linkFailure.value?.error).toBe('failed');
  });

  it('falha síncrona (exceção) no refazer: o passo é revertido e linkFailure é definido', async () => {
    const { store } = setup();
    const { pending, link } = asyncLinked();
    const boom = () => {
      throw new Error('sync');
    };
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado'), {
      link: { ...link, redo: boom },
    });
    store.undo();
    pending[0]?.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.redo()).toBe(true);
    expect(project(store).layers.find((l) => l.id === 'L1')?.name).not.toBe('Aplicado');
    expect(store.canRedo.value).toBe(true);
    expect(store.linkFailure.value?.error).toBe('failed');
  });

  it('falha da gravação no refazer: o passo é revertido e o erro fica à vista', async () => {
    const { store } = setup();
    const { pending, link } = asyncLinked();
    store.apply((p) => renameLayer(p, 'L1', 'Aplicado'), { link });
    store.undo();
    pending[0]?.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.redo()).toBe(true);
    pending[1]?.resolve({ ok: false, error: 'write-failed' });
    await Promise.resolve();
    await Promise.resolve();

    expect(project(store).layers.find((l) => l.id === 'L1')?.name).not.toBe('Aplicado');
    expect(store.canRedo.value).toBe(true);
    expect(store.canUndo.value).toBe(false);
    expect(store.linkFailure.value?.error).toBe('write-failed');
  });
});
