// Editor do laboratório (L1): desenha pelo ScreenRenderer; o editor só liga a edição.
import Konva from 'konva';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../canvas/harness';
import { newBoard } from '../../../lab/components/board';
import { type EditorCallbacks, ScreenEditor } from '../../../lab/components/editor';
import { loadLibrary } from '../../../src/model/components/library';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../../../lab/components/samples';
import type { Screen } from '../../../src/model/components/screen';

beforeAll(() => installFakeCanvas());

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

const library = loadLibrary(SAMPLE_FILES);
let editors: ScreenEditor[] = [];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  for (const editor of editors) editor.dispose();
  editors = [];
  vi.unstubAllGlobals();
});

function setup() {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800 });
  Object.defineProperty(container, 'clientHeight', { value: 600 });
  document.body.append(container);
  const callbacks = {
    onSelect: vi.fn<NonNullable<EditorCallbacks['onSelect']>>(),
    onWarnings: vi.fn<NonNullable<EditorCallbacks['onWarnings']>>(),
  };
  const editor = new ScreenEditor(container, callbacks);
  editors.push(editor);
  editor.setLibrary(library);
  editor.setBoard(newBoard(SAMPLE_SCREEN));
  // O Stage é o único que guarda o container; acha-se pelos grupos pelo atributo.
  const stage = Konva.stages[Konva.stages.length - 1] as Konva.Stage;
  const groups = () =>
    stage.find((n: Konva.Node) => typeof n.getAttr('instanceId') === 'string');
  return { editor, callbacks, stage, groups, container };
}

function withValue(screen: Screen, id: string, key: string, value: string): Screen {
  return {
    ...screen,
    instances: screen.instances.map((i) =>
      i.id === id ? { ...i, values: { ...i.values, [key]: value } } : i,
    ),
  };
}

describe('ScreenEditor', () => {
  it('avisa os avisos da instanciação ao montar o quadro', () => {
    const { callbacks } = setup();
    expect(callbacks.onWarnings).toHaveBeenCalled();
    const [byInstance] = callbacks.onWarnings.mock.calls.at(-1) ?? [];
    expect(byInstance).toBeInstanceOf(Map);
  });

  it('desenha um grupo por instância da tela', () => {
    const { groups } = setup();
    expect(groups()).toHaveLength(SAMPLE_SCREEN.instances.length);
  });

  it('select avisa a seleção; id inexistente seleciona nada', () => {
    const { editor, callbacks } = setup();
    const id = SAMPLE_SCREEN.instances[0]?.id as string;
    editor.select(id);
    expect(callbacks.onSelect).toHaveBeenLastCalledWith(id);
    editor.select('nao-existe');
    expect(callbacks.onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it('trocar uma instância redesenha só ela e mantém os outros grupos', () => {
    const { editor, groups } = setup();
    const before = new Map(groups().map((g) => [g.getAttr('instanceId') as string, g]));
    const changedId = 'i-email';
    const next = withValue(SAMPLE_SCREEN, changedId, 'label', 'Outro texto');
    const children = new Map(
      [...before].map(([id, g]) => [id, (g as Konva.Group).getChildren().slice()]),
    );
    editor.setBoard(newBoard(next));
    const after = new Map(groups().map((g) => [g.getAttr('instanceId') as string, g]));
    expect(after.size).toBe(before.size);
    for (const [id, group] of after) {
      expect(group).toBe(before.get(id));
      const same = (group as Konva.Group)
        .getChildren()
        .every((c, i) => c === children.get(id)?.[i]);
      // Só a instância trocada teve os filhos refeitos.
      expect(same).toBe(id !== changedId);
    }
  });

  it('setFixed(true) tira o arrasto das instâncias', () => {
    const { editor, groups } = setup();
    expect(groups().every((g) => (g as Konva.Group).draggable())).toBe(true);
    editor.setFixed(true);
    expect(groups().every((g) => !(g as Konva.Group).draggable())).toBe(true);
    editor.setFixed(false);
    expect(groups().every((g) => (g as Konva.Group).draggable())).toBe(true);
  });

  it('toDataURL devolve uma string', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,AAAA',
    );
    const { editor } = setup();
    expect(editor.toDataURL(SAMPLE_SCREEN.id)).toBe('data:image/png;base64,AAAA');
    expect(editor.toDataURL('nao-existe')).toBe('');
  });

  it('dispose não lança', () => {
    const { editor } = setup();
    expect(() => editor.dispose()).not.toThrow();
  });
});
