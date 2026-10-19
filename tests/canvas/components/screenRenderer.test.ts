// Visualizador (L1): o ScreenRenderer desenha uma tela num Konva.Group e faz o diff por
// instância (identidade dos objetos).
import Konva from 'konva';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../../../lab/components/samples';
import {
  type Instance,
  type Screen,
  renderOrder,
} from '../../../src/model/components/screen';
import { ScreenRenderer } from '../../../src/canvas/components/screenRenderer';

beforeAll(() => installFakeCanvas());

const library = loadLibrary(SAMPLE_FILES);

function setup(options: ConstructorParameters<typeof ScreenRenderer>[1] = {}) {
  const group = new Konva.Group();
  const renderer = new ScreenRenderer(group, {
    measure: approximateMeasurer,
    ...options,
  });
  return { group, renderer };
}

/** Troca uma instância por um objeto novo com o valor `key` diferente. */
function withValue(screen: Screen, id: string, key: string, value: string): Screen {
  return {
    ...screen,
    instances: screen.instances.map((i) =>
      i.id === id ? { ...i, values: { ...i.values, [key]: value } } : i,
    ),
  };
}

describe('ScreenRenderer', () => {
  it('cria um grupo por instância, com instanceId, na ordem de renderOrder', () => {
    const { group, renderer } = setup();
    expect(renderer.update(library, SAMPLE_SCREEN)).toBe(true);
    const expected = renderOrder(SAMPLE_SCREEN).map((i) => i.id);
    expect(renderer.ids()).toEqual(expected);
    expect(group.getChildren().map((n: Konva.Node) => n.getAttr('instanceId'))).toEqual(
      expected,
    );
    const bar = renderer.nodeOf('i-bar');
    expect(bar).toBeInstanceOf(Konva.Group);
    expect(bar?.getAttr('instanceId')).toBe('i-bar');
    const email = SAMPLE_SCREEN.instances.find((i) => i.id === 'i-email');
    expect(renderer.nodeOf('i-email')?.position()).toEqual({
      x: email?.box.x,
      y: email?.box.y,
    });
    expect(renderer.warnings().size).toBe(0);
    expect(renderer.labelOf('i-enter')).toBe('Entrar');
  });

  it('respeita zBase (o chamador pode ter outros filhos antes)', () => {
    const { group, renderer } = setup();
    group.add(new Konva.Rect({ name: 'artboard' }));
    renderer.update(library, SAMPLE_SCREEN, { zBase: 1 });
    expect(group.getChildren()[0]?.name()).toBe('artboard');
    expect(
      (group.getChildren()[1] as Konva.Node | undefined)?.getAttr('instanceId'),
    ).toBe(renderer.ids()[0]);
    expect(group.getChildren()).toHaveLength(1 + SAMPLE_SCREEN.instances.length);
  });

  it('segundo update com a mesma tela não re-instancia nada', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const before = renderer.ids().map((id) => renderer.nodeOf(id));
    const children = renderer.ids().map((id) => renderer.nodeOf(id)?.getChildren()[0]);
    expect(renderer.update(library, SAMPLE_SCREEN)).toBe(false);
    expect(renderer.ids().map((id) => renderer.nodeOf(id))).toEqual(before);
    renderer.ids().forEach((id, index) => {
      expect(renderer.nodeOf(id)).toBe(before[index]);
      expect(renderer.nodeOf(id)?.getChildren()[0]).toBe(children[index]);
    });
  });

  it('trocar uma instância re-instancia só ela', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const nodes = new Map(renderer.ids().map((id) => [id, renderer.nodeOf(id)]));
    const inner = new Map(
      renderer.ids().map((id) => [id, renderer.nodeOf(id)?.getChildren()[0]]),
    );
    const next = withValue(SAMPLE_SCREEN, 'i-enter', 'label', 'Continuar');
    expect(renderer.update(library, next)).toBe(true);
    for (const id of renderer.ids()) {
      // Os grupos são os mesmos objetos.
      expect(renderer.nodeOf(id)).toBe(nodes.get(id));
      if (id === 'i-enter') {
        expect(renderer.nodeOf(id)?.getChildren()[0]).not.toBe(inner.get(id));
      } else {
        expect(renderer.nodeOf(id)?.getChildren()[0]).toBe(inner.get(id));
      }
    }
    expect(renderer.labelOf('i-enter')).toBe('Continuar');
    expect(renderer.instanceOf('i-enter')?.values.label).toBe('Continuar');
  });

  it('remover uma instância destrói o grupo dela', () => {
    const { group, renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const node = renderer.nodeOf('i-create');
    const next: Screen = {
      ...SAMPLE_SCREEN,
      instances: SAMPLE_SCREEN.instances.filter((i) => i.id !== 'i-create'),
    };
    expect(renderer.update(library, next)).toBe(true);
    expect(renderer.nodeOf('i-create')).toBeUndefined();
    expect(renderer.ids()).not.toContain('i-create');
    expect(node?.getStage()).toBeNull();
    expect(node?.parent).toBeNull();
    expect(group.getChildren()).toHaveLength(next.instances.length);
  });

  it('biblioteca trocada (objeto novo) re-instancia tudo', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const inner = renderer.ids().map((id) => renderer.nodeOf(id)?.getChildren()[0]);
    const other = loadLibrary(SAMPLE_FILES);
    expect(renderer.update(other, SAMPLE_SCREEN)).toBe(true);
    renderer.ids().forEach((id, index) => {
      expect(renderer.nodeOf(id)?.getChildren()[0]).not.toBe(inner[index]);
    });
    // force também re-instancia, mesmo com tudo igual.
    const again = renderer.nodeOf('i-bar')?.getChildren()[0];
    expect(renderer.update(other, SAMPLE_SCREEN)).toBe(false);
    expect(renderer.update(other, SAMPLE_SCREEN, { force: true })).toBe(true);
    expect(renderer.nodeOf('i-bar')?.getChildren()[0]).not.toBe(again);
  });

  it('tipo desconhecido gera o reservado e um aviso', () => {
    const { renderer } = setup();
    const unknown: Instance = {
      id: 'x',
      typeId: 'nao-existe',
      box: { x: 5, y: 6, width: 100, height: 40 },
      values: {},
    };
    renderer.update(library, { ...SAMPLE_SCREEN, instances: [unknown] });
    const node = renderer.nodeOf('x');
    const rect = node?.findOne<Konva.Rect>('Rect');
    expect(rect?.dash()).toEqual([6, 4]);
    expect(rect?.stroke()).toBe('#D81B60');
    expect(node?.findOne<Konva.Text>('Text')?.text()).toContain('nao-existe');
    expect(renderer.warnings().get('x')).toEqual(['tipo não existe na especialização']);
    // Sem biblioteca nenhuma: todos viram reservado.
    const empty = setup();
    empty.renderer.update(undefined, SAMPLE_SCREEN);
    expect(empty.renderer.warnings().size).toBe(SAMPLE_SCREEN.instances.length);
  });

  it('render(instance) temporário muda instanceOf e o próximo update desfaz', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const original = renderer.instanceOf('i-enter');
    expect(original).toBeDefined();
    if (!original) return;
    const resized: Instance = { ...original, box: { ...original.box, width: 200 } };
    renderer.render(resized);
    expect(renderer.instanceOf('i-enter')).toBe(resized);
    expect(renderer.instanceOf('i-enter')?.box.width).toBe(200);
    expect(renderer.nodeOf('i-enter')?.getAttr('boxSize')).toEqual({
      width: 200,
      height: original.box.height,
    });
    expect(renderer.update(library, SAMPLE_SCREEN)).toBe(true);
    expect(renderer.instanceOf('i-enter')).toBe(original);
    // Instância desconhecida: ignorada.
    expect(() => renderer.render({ ...original, id: 'fantasma' })).not.toThrow();
    expect(renderer.nodeOf('fantasma')).toBeUndefined();
  });

  it('instanceIdOf acha a instância a partir de um nó filho', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const hit = renderer.nodeOf('i-enter')?.findOne('.hit');
    expect(hit).toBeDefined();
    expect(renderer.instanceIdOf(hit)).toBe('i-enter');
    expect(renderer.instanceIdOf(renderer.nodeOf('i-enter'))).toBe('i-enter');
    expect(renderer.instanceIdOf(new Konva.Rect())).toBeUndefined();
    expect(renderer.instanceIdOf(null)).toBeUndefined();
    expect(renderer.instanceIdOf(undefined)).toBeUndefined();
  });

  it('instanceAt devolve a mais acima', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    // O campo de e-mail está dentro do card (desenhado depois, fica por cima).
    expect(renderer.instanceAt({ x: 100, y: 300 })).toBe('i-email');
    expect(renderer.instanceAt({ x: 30, y: 220 })).toBe('i-card');
    expect(renderer.instanceAt({ x: 380, y: 800 })).toBeUndefined();
  });

  it('onInstanceCreated é chamado uma vez por instância', () => {
    const created: string[] = [];
    const onInstanceCreated = vi.fn((id: string, node: Konva.Group) => {
      created.push(id);
      expect(node.getAttr('instanceId')).toBe(id);
    });
    const { renderer } = setup({ onInstanceCreated });
    renderer.update(library, SAMPLE_SCREEN);
    expect(onInstanceCreated).toHaveBeenCalledTimes(SAMPLE_SCREEN.instances.length);
    renderer.update(library, withValue(SAMPLE_SCREEN, 'i-enter', 'label', 'Ir'));
    renderer.update(loadLibrary(SAMPLE_FILES), SAMPLE_SCREEN);
    expect(onInstanceCreated).toHaveBeenCalledTimes(SAMPLE_SCREEN.instances.length);
    expect(new Set(created).size).toBe(created.length);
  });

  it('dispose destrói os grupos das instâncias', () => {
    const { group, renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const node = renderer.nodeOf('i-bar');
    renderer.dispose();
    expect(group.getChildren()).toHaveLength(0);
    expect(node?.parent).toBeNull();
    expect(renderer.ids()).toEqual([]);
    expect(renderer.nodeOf('i-bar')).toBeUndefined();
    expect(renderer.warnings().size).toBe(0);
  });
});
