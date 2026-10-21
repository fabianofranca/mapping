import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  createMarking,
  approximateMeasurer,
  setFieldValue,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { setMarkingDisplay, setShowComponentsOnPhotos } from '../../src/store/settings';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi, setActiveLayer } from '../../src/store/ui';
import { SPEC_ID, componentProject, testCatalog } from '../model/componentFixtures';

const catalog = testCatalog();

const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function add(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      imageId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** Dois textos e uma folha que não cabe, na imagem I1. */
function screen(): Project {
  let p = componentProject();
  p = add(p, 'T1', 'text', box(100, 100, 100, 40));
  p = add(p, 'T2', 'text', box(300, 100, 100, 40));
  return p;
}

function setup(
  initial: Project = screen(),
  components: { catalog: ComponentCatalog } = { catalog },
) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  const actions = createProjectActions(store, {
    newId: (() => {
      let n = 0;
      return () => `N${++n}`;
    })(),
    components: () => components.catalog,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  const ui = createEditorUi();
  const sources = {
    catalog: signal(components.catalog),
    fontsEpoch: signal(0),
  };
  const shown = signal<Project | null>(null);
  const derived = createEditorDerived(
    store,
    ui,
    // Sem revisão: o projeto à vista é o confirmado, até um teste trocar `shown`.
    undefined,
    sources,
  );
  return { store, actions, ui, derived, sources, shown };
}

/** Todo o texto do desenho (a cena em JSON basta para procurar um valor). */
const drawnText = (root: unknown): string => JSON.stringify(root);

beforeEach(() => {
  setMarkingDisplay('all');
  setShowComponentsOnPhotos(false);
});
afterEach(() => {
  textMeasurer.value = approximateMeasurer;
  localStorage.clear();
});

describe('derivado: desenhos dos componentes', () => {
  it('sem catálogo, ninguém tem desenho', () => {
    const { derived } = setup(screen(), { catalog: new Map() });
    expect(derived.componentScenes.value.size).toBe(0);
    expect(derived.drawnMarkings.value.size).toBe(0);
    expect(derived.componentTypes.value).toEqual([]);
  });

  it('desenha as marcações com componente, na ordem do array', () => {
    const { derived } = setup();
    const scenes = derived.componentScenes.value;
    expect([...scenes.keys()]).toEqual(['T1', 'T2']);
    expect(scenes.get('T1')?.annotationId).toBe('A_T1');
    expect(derived.catalog.value).toBe(catalog);
  });

  it('editar um campo reinstancia só aquela marcação', () => {
    const { derived, actions } = setup();
    const before = derived.componentScenes.value;
    expect(actions.setFieldValue('A_T1', 'label', 'Texto novo').ok).toBe(true);
    const after = derived.componentScenes.value;
    expect(after.get('T1')).not.toBe(before.get('T1'));
    expect(drawnText(after.get('T1')?.root)).toContain('Texto novo');
    expect(after.get('T2')).toBe(before.get('T2'));
  });

  it('desfazer e refazer redesenham pelo mesmo caminho', () => {
    const { derived, actions, store } = setup();
    actions.setFieldValue('A_T1', 'label', 'Texto novo');
    const edited = derived.componentScenes.value;
    store.undo();
    const undone = derived.componentScenes.value;
    expect(drawnText(undone.get('T1')?.root)).not.toContain('Texto novo');
    expect(undone.get('T2')).toBe(edited.get('T2'));
    store.redo();
    expect(drawnText(derived.componentScenes.value.get('T1')?.root)).toContain(
      'Texto novo',
    );
  });

  it('recarga externa (outro projeto na mesma sessão) redesenha só o que mudou', () => {
    const { derived, store } = setup();
    const before = derived.componentScenes.value;
    store.load(setFieldValue(screen(), 'A_T2', 'label', 'Veio do disco'));
    const after = derived.componentScenes.value;
    expect(drawnText(after.get('T2')?.root)).toContain('Veio do disco');
    expect(after.get('T1')).toBe(before.get('T1'));
  });

  it('um catálogo que chega depois desenha as marcações que já estavam no projeto', () => {
    const { derived, sources } = setup();
    sources.catalog.value = new Map();
    expect(derived.componentScenes.value.size).toBe(0);
    sources.catalog.value = catalog;
    expect(derived.componentScenes.value.size).toBe(2);
  });

  it('o medidor e a época das fontes redesenham', () => {
    const { derived, sources } = setup();
    const before = derived.componentScenes.value;
    sources.fontsEpoch.value++;
    const afterFonts = derived.componentScenes.value;
    expect(afterFonts.get('T1')).not.toBe(before.get('T1'));
    textMeasurer.value = (text, font, maxWidth) =>
      approximateMeasurer(text, font, maxWidth);
    expect(derived.componentScenes.value.get('T1')).not.toBe(afterFonts.get('T1'));
  });

  it('a visão Proposto desenha os valores propostos', () => {
    const base = screen();
    const store = createProjectStore();
    store.load(base);
    const proposed = signal<Project | null>(base);
    const derived = createEditorDerived(store, createEditorUi(), proposed, {
      catalog: signal(catalog),
      fontsEpoch: signal(0),
    });
    const current = derived.componentScenes.value;
    proposed.value = setFieldValue(base, 'A_T1', 'label', 'Proposto');
    const next = derived.componentScenes.value;
    expect(drawnText(next.get('T1')?.root)).toContain('Proposto');
    expect(next.get('T2')).toBe(current.get('T2'));
  });

  it('drawingsOf devolve a cena do projeto à vista e reaproveita as demais com a prévia do gesto', () => {
    const { derived, actions, store } = setup();
    const scenes = derived.componentScenes.value;
    expect(derived.drawingsOf(store.project.value)).toBe(scenes);

    actions.beginGesture();
    actions.previewMarkingRect('T1', box(100, 100, 120, 40));
    const preview = derived.drawingsOf(store.project.value);
    expect(preview).not.toBe(scenes);
    expect(preview.get('T1')?.root.width).toBe(120);
    expect(preview.get('T2')).toBe(scenes.get('T2'));
    // Durante o gesto o projeto à vista (confirmado) não muda.
    expect(derived.componentScenes.value).toBe(scenes);
    actions.commitGesture();
    expect(derived.componentScenes.value.get('T1')?.root.width).toBe(120);
    expect(derived.componentScenes.value.get('T2')).toBe(scenes.get('T2'));
    expect(derived.drawingsOf(null).size).toBe(0);
  });
});

describe('derivado: marcações desenhadas', () => {
  it('na foto só com a opção ligada; na tela em branco, sempre', () => {
    const { derived, actions, store } = setup();
    expect(derived.drawnMarkings.value.size).toBe(0);
    setShowComponentsOnPhotos(true);
    expect([...derived.drawnMarkings.value]).toEqual(['T1', 'T2']);
    setShowComponentsOnPhotos(false);
    expect(derived.drawnMarkings.value.size).toBe(0);

    const blank = actions.addBlankImage({
      name: null,
      width: 400,
      height: 600,
      background: '#FFFFFF',
    });
    if (!blank.ok) throw new Error('addBlankImage');
    const created = actions.addComponent({
      imageId: blank.value,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
    });
    if (!created.ok) throw new Error('addComponent');
    expect([...derived.drawnMarkings.value]).toEqual([created.value]);
    expect(store.project.value?.markings).toHaveLength(3);
  });

  it('o filtro "sem anotação" não esconde marcação que desenha; a comum segue a regra', () => {
    // Container com filha, mais uma marcação comum sem anotação, na tela em branco... e na foto.
    let p = add(screen(), 'C', 'row', box(100, 300, 300, 100));
    p = add(p, 'K', 'text', box(100, 300, 100, 40), { parentId: 'C' });
    p = createMarking(p, { id: 'P', imageId: 'I1', rect: box(500, 500, 50, 50) });
    const { derived, ui, store } = setup(p);
    setShowComponentsOnPhotos(true);
    const layers = store.project.value?.layers ?? [];
    const other = layers.find((l) => l.spec === null);
    const typed = layers.find((l) => l.spec !== null);
    if (!other || !typed) throw new Error('camadas');
    const drawable = ['T1', 'T2', 'C', 'K'];
    for (const mode of ['hide', 'dim'] as const) {
      setMarkingDisplay(mode);
      // Camada ativa sem as anotações dos componentes: eles seguem por inteiro e desenhados.
      setActiveLayer(ui, other.id);
      const marks = derived.markingVisibility.value;
      for (const id of drawable) expect(marks.get(id)).toBe('full');
      expect(marks.get('P')).toBe(mode === 'hide' ? 'hidden' : 'dim');
      expect([...derived.drawnMarkings.value].sort()).toEqual([...drawable].sort());
      setActiveLayer(ui, typed.id);
      expect(derived.markingVisibility.value.get('C')).toBe('full');
    }
    // Ver limpo: nenhuma marcação aparece, nem a selecionada, mas o desenho segue à vista.
    setMarkingDisplay('all');
    ui.selection.value = { kind: 'marking', id: 'T1' };
    ui.cleanView.value = true;
    const clean = derived.markingVisibility.value;
    expect(clean.size).toBeGreaterThan(0);
    expect([...clean.values()].every((v) => v === 'hidden')).toBe(true);
    expect([...derived.drawnMarkings.value].sort()).toEqual([...drawable].sort());
    ui.cleanView.value = false;
    ui.selection.value = null;
    expect(derived.markingVisibility.value.get('T1')).toBe('full');
    // Sem a opção, na foto nada desenha; o filtro volta a valer para o que não desenha.
    setShowComponentsOnPhotos(false);
    setMarkingDisplay('hide');
    setActiveLayer(ui, other.id);
    expect(derived.drawnMarkings.value.size).toBe(0);
    expect(derived.markingVisibility.value.get('T1')).toBe('hidden');
  });

  it('na tela em branco o componente aparece mesmo com a opção de fotos desligada', () => {
    const { derived, actions, ui, store } = setup();
    const blank = actions.addBlankImage({
      name: null,
      width: 400,
      height: 600,
      background: '#FFFFFF',
    });
    if (!blank.ok) throw new Error('addBlankImage');
    const created = actions.addComponent({
      imageId: blank.value,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'row',
    });
    if (!created.ok) throw new Error('addComponent');
    const other = store.project.value?.layers.find((l) => l.spec === null);
    if (!other) throw new Error('camada');
    setMarkingDisplay('hide');
    setActiveLayer(ui, other.id);
    expect(derived.markingVisibility.value.get(created.value)).toBe('full');
    expect([...derived.drawnMarkings.value]).toEqual([created.value]);
  });

  it('mantém o mesmo conjunto quando nada muda', () => {
    const { derived, actions } = setup();
    setShowComponentsOnPhotos(true);
    const before = derived.drawnMarkings.value;
    actions.renameProject('Outro nome');
    expect(derived.drawnMarkings.value).toBe(before);
  });
});

describe('derivado: pendência "componente não cabe"', () => {
  function withWide() {
    return setup(add(screen(), 'W', 'wide', box(500, 100, 100, 40)));
  }

  it('aparece na anotação que desenha e entra nas incompletas', () => {
    const { derived } = withWide();
    expect(derived.issues.value.get('A_W')).toEqual([{ code: 'component-overflow' }]);
    expect(derived.issues.value.has('A_T1')).toBe(false);
    expect(derived.incompleteMarkings.value.has('W')).toBe(true);
    expect(derived.incompleteCount.value).toBe(1);
    expect(derived.incompleteList.value.length).toBeGreaterThan(0);
  });

  it('some quando a marcação passa a caber ou deixa de existir', () => {
    const { derived, actions } = withWide();
    expect(derived.incompleteCount.value).toBe(1);
    // Mais larga: as duas caixas de 80 cabem numa linha de 160 ou mais.
    expect(actions.setMarkingRect('W', box(500, 100, 200, 40)).ok).toBe(true);
    expect(derived.issues.value.has('A_W')).toBe(false);
    expect(derived.incompleteCount.value).toBe(0);
    actions.setMarkingRect('W', box(500, 100, 100, 40));
    expect(derived.incompleteCount.value).toBe(1);
    actions.removeMarking('W');
    expect(derived.incompleteCount.value).toBe(0);
  });

  it('mantém o mesmo mapa quando uma edição não mexe nas pendências', () => {
    const { derived, actions } = withWide();
    const before = derived.issues.value;
    actions.renameMarking('T1', 'Outro');
    expect(derived.issues.value).toBe(before);
  });

  it('soma ao que o modelo já aponta na mesma anotação', () => {
    const { derived, actions } = withWide();
    // Um valor inválido numa anotação que também transborda: as duas pendências aparecem.
    actions.addAnnotation('W', derived.activeLayerId.value as string);
    const issues = derived.issues.value.get('A_W') ?? [];
    expect(issues.map((i) => i.code)).toContain('component-overflow');
  });
});

describe('derivado: tamanho mínimo, paleta e avisos', () => {
  it('componentMinSizes traz o mínimo dos componentes que têm', () => {
    const { derived, actions } = setup(
      add(screen(), 'W', 'wide', box(500, 100, 100, 40)),
    );
    const sizes = derived.componentMinSizes.value;
    expect(sizes.get('T1')).toEqual({ width: 60, height: 24 });
    expect(sizes.has('W')).toBe(false);
    const before = sizes;
    actions.renameMarking('T1', 'Outro');
    expect(derived.componentMinSizes.value).toBe(before);
  });

  it('componentTypes lista os tipos com componente e mantém a lista', () => {
    const { derived, actions } = setup();
    const types = derived.componentTypes.value;
    expect(types.map((t) => t.typeId)).toContain('text');
    expect(types.map((t) => t.typeId)).not.toContain('plain');
    actions.renameMarking('T1', 'Outro');
    expect(derived.componentTypes.value).toBe(types);
  });

  it('componentWarnings só traz as marcações com aviso', () => {
    const { derived } = setup(add(screen(), 'W', 'wide', box(500, 100, 100, 40)));
    const warnings = derived.componentWarnings.value;
    expect(warnings.map((w) => w.markingId)).toEqual(['W']);
    expect(warnings[0]?.warnings.join(' ')).toContain('conteúdo maior que a caixa');
  });
});
