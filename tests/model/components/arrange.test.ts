// Laboratório Componentes: containers com layout row/column gravam os retângulos dos filhos.
import { describe, expect, it } from 'vitest';
import {
  arrange,
  dropIndex,
  findSlot,
  hasSlot,
  resolveSlotLayout,
  slotBox,
} from '../../../src/model/components/arrange';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import {
  type Box,
  type Instance,
  type Screen,
  setValue,
  updateBox,
} from '../../../src/model/components/screen';

// --- biblioteca montada em memória ----------------------------------------------------------

interface SlotSpec {
  readonly layout?: Record<string, unknown>;
  readonly extra?: Record<string, unknown>;
}

function component(id: string, children: unknown[], frame: Record<string, unknown> = {}) {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id,
    name: id,
    size: { width: 200, height: 100 },
    template: { type: 'frame', layout: { type: 'none' }, children, ...frame },
  };
}

/** Container: quadro `none` com um slot que ocupa tudo; o layout do slot varia por componente. */
function container(id: string, slot: SlotSpec = {}) {
  return component(id, [
    {
      type: 'slot',
      width: 'fill',
      height: 'fill',
      ...(slot.layout ? { layout: slot.layout } : {}),
      ...slot.extra,
    },
  ]);
}

function flow(type: 'row' | 'column', extra: Record<string, unknown> = {}) {
  return {
    type,
    gap: { $field: 'spacing', default: 8 },
    padding: { $field: 'padding' },
    align: 'start',
    ...extra,
  };
}

const COMPONENTS = [
  container('row-start', { layout: flow('row') }),
  container('row-center', { layout: flow('row', { justify: 'center' }) }),
  container('row-end', { layout: flow('row', { justify: 'end' }) }),
  container('row-between', { layout: flow('row', { justify: 'space-between' }) }),
  container('row-align-center', { layout: flow('row', { align: 'center' }) }),
  container('row-align-end', { layout: flow('row', { align: 'end' }) }),
  container('row-stretch', { layout: flow('row', { align: 'stretch' }) }),
  container('column-start', { layout: flow('column') }),
  container('column-stretch', { layout: flow('column', { align: 'stretch' }) }),
  container('box'),
  container('hidden', { layout: flow('row'), extra: { visible: false } }),
  component(
    'inset',
    [
      {
        type: 'slot',
        anchors: { left: 10, top: 5, right: 10, bottom: 5 },
        layout: flow('row'),
      },
    ],
    { layout: { type: 'none' } },
  ),
  component('leaf', [
    {
      type: 'rect',
      width: 40,
      height: 20,
      anchors: { left: 0, top: 0 },
      fill: '#CCCCCC',
    },
  ]),
];

const FIELDS = [
  { key: 'spacing', label: 'Espaço', type: 'number', default: 8 },
  { key: 'padding', label: 'Margem', type: 'number', default: 0 },
];

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'arrange-test',
  name: 'Arrange',
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#1E88E5',
      annotationTypes: COMPONENTS.map((c) => ({
        id: c.id,
        name: c.id,
        component: `components/${c.id}.json`,
        fields: c.id === 'leaf' ? [] : FIELDS,
      })),
    },
  ],
};

const library = loadLibrary([
  { path: 'spec.json', text: JSON.stringify(SPEC) },
  ...COMPONENTS.map((c) => ({
    path: `components/${c.id}.json`,
    text: JSON.stringify(c),
  })),
]);

const measure = approximateMeasurer;

function typeOf(id: string) {
  const type = library.types.find((t) => t.id === id);
  if (!type?.component) throw new Error(`tipo sem componente: ${id}`);
  return { type, component: type.component };
}

// --- construtores de tela ---------------------------------------------------------------------

function host(
  id: string,
  typeId: string,
  box: Box,
  values: Instance['values'] = { spacing: 8, padding: 0 },
  parentId?: string,
): Instance {
  return { id, typeId, box, values, ...(parentId ? { parentId } : {}) };
}

function leaf(id: string, width: number, parentId: string, height = 20): Instance {
  return {
    id,
    typeId: 'leaf',
    box: { x: 0, y: 0, width, height },
    values: {},
    parentId,
  };
}

function screenOf(...instances: Instance[]): Screen {
  return {
    id: 's',
    name: 'Tela',
    width: 600,
    height: 600,
    background: '#FFFFFF',
    instances,
  };
}

function boxOf(screen: Screen, id: string): Box {
  const found = screen.instances.find((i) => i.id === id);
  if (!found) throw new Error(`instância ausente: ${id}`);
  return found.box;
}

const CONTAINER_BOX: Box = { x: 100, y: 50, width: 400, height: 100 };

/** Container na posição `CONTAINER_BOX` com três folhas 40/60/20 de largura. */
function rowScreen(typeId: string, values?: Instance['values']): Screen {
  return screenOf(
    host('c', typeId, CONTAINER_BOX, values),
    leaf('a', 40, 'c'),
    leaf('b', 60, 'c'),
    leaf('d', 20, 'c'),
  );
}

function xs(screen: Screen): number[] {
  return ['a', 'b', 'd'].map((id) => boxOf(screen, id).x);
}

// --- testes -----------------------------------------------------------------------------------

describe('findSlot / hasSlot / resolveSlotLayout', () => {
  it('a biblioteca de teste carrega sem problemas', () => {
    expect(library.problems).toEqual([]);
  });

  it('acha o slot em profundidade e reconhece containers', () => {
    expect(findSlot(typeOf('row-start').component)?.type).toBe('slot');
    expect(findSlot(typeOf('leaf').component)).toBeUndefined();
    expect(hasSlot(typeOf('row-start').type)).toBe(true);
    expect(hasSlot(typeOf('box').type)).toBe(true);
    expect(hasSlot(typeOf('leaf').type)).toBe(false);
    expect(hasSlot(undefined)).toBe(false);

    const nested = component('nested', [
      {
        type: 'frame',
        children: [{ type: 'frame', children: [{ type: 'slot', name: 'fundo' }] }],
      },
    ]);
    const slot = findSlot(nested as never);
    expect(slot?.name).toBe('fundo');
  });

  it('resolve gap e padding dos campos, com os padrões da expressão', () => {
    const slot = findSlot(typeOf('row-center').component)!;
    expect(resolveSlotLayout(slot, { spacing: 12, padding: 6 })).toEqual({
      type: 'row',
      gap: 12,
      padding: { top: 6, right: 6, bottom: 6, left: 6 },
      align: 'start',
      justify: 'center',
    });
    // Sem valores: `default` da expressão no gap; padding sem padrão vale 0.
    expect(resolveSlotLayout(slot, {})).toMatchObject({
      gap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    // Números chegam às vezes como texto.
    expect(resolveSlotLayout(slot, { spacing: '5', padding: '3' }).gap).toBe(5);
    expect(
      resolveSlotLayout(findSlot(typeOf('column-stretch').component)!, {}),
    ).toMatchObject({
      type: 'column',
      align: 'stretch',
    });
  });

  it('slot sem layout (Box) ou com layout none resolve para none', () => {
    const slot = findSlot(typeOf('box').component)!;
    expect(resolveSlotLayout(slot, {}).type).toBe('none');
    const none = { type: 'slot', layout: { type: 'none' } } as const;
    expect(resolveSlotLayout(none, {}).type).toBe('none');
  });
});

describe('slotBox', () => {
  it('é a caixa da instância quando o slot ocupa o quadro', () => {
    const instance = host('c', 'row-start', { x: 30, y: 40, width: 250, height: 120 });
    expect(slotBox(typeOf('row-start').component, instance, measure)).toEqual({
      x: 30,
      y: 40,
      width: 250,
      height: 120,
    });
  });

  it('respeita as âncoras do slot dentro de um quadro sem layout', () => {
    const instance = host('c', 'inset', { x: 10, y: 20, width: 200, height: 100 });
    expect(slotBox(typeOf('inset').component, instance, measure)).toEqual({
      x: 20,
      y: 25,
      width: 180,
      height: 90,
    });
  });

  it('não devolve nada quando o slot está invisível', () => {
    const instance = host('c', 'hidden', CONTAINER_BOX);
    expect(slotBox(typeOf('hidden').component, instance, measure)).toBeUndefined();
  });
});

describe('arrange: row', () => {
  it('start com gap e padding: x relativo 4, 52, 120; y no topo; tamanhos intactos', () => {
    const result = arrange(
      rowScreen('row-start', { spacing: 8, padding: 4 }),
      library,
      measure,
    );
    expect(xs(result).map((x) => x - CONTAINER_BOX.x)).toEqual([4, 52, 120]);
    for (const id of ['a', 'b', 'd'])
      expect(boxOf(result, id).y).toBe(CONTAINER_BOX.y + 4);
    expect(boxOf(result, 'a')).toMatchObject({ width: 40, height: 20 });
    expect(boxOf(result, 'b')).toMatchObject({ width: 60, height: 20 });
    expect(boxOf(result, 'd')).toMatchObject({ width: 20, height: 20 });
  });

  it('center, end e space-between distribuem a sobra no eixo principal', () => {
    // Total = 40 + 60 + 20 + 2·8 = 136; sobra = 400 − 136 = 264.
    const values = { spacing: 8, padding: 0 };
    expect(xs(arrange(rowScreen('row-center', values), library, measure))).toEqual([
      232, 280, 348,
    ]);
    expect(xs(arrange(rowScreen('row-end', values), library, measure))).toEqual([
      364, 412, 480,
    ]);
    // Gap extra = 264 / 2 = 132; o último termina na borda direita (500).
    expect(xs(arrange(rowScreen('row-between', values), library, measure))).toEqual([
      100, 280, 480,
    ]);
  });

  it('space-between com um filho só age como start', () => {
    const screen = screenOf(
      host('c', 'row-between', CONTAINER_BOX, { spacing: 8, padding: 4 }),
      leaf('a', 40, 'c'),
    );
    expect(boxOf(arrange(screen, library, measure), 'a').x).toBe(104);
  });

  it('align center, end e stretch no eixo cruzado', () => {
    const values = { spacing: 8, padding: 4 };
    // Altura de conteúdo = 100 − 8 = 92.
    const center = arrange(rowScreen('row-align-center', values), library, measure);
    expect(boxOf(center, 'a')).toMatchObject({ y: 90, height: 20 });
    const end = arrange(rowScreen('row-align-end', values), library, measure);
    expect(boxOf(end, 'a')).toMatchObject({ y: 126, height: 20 });
    const stretch = arrange(rowScreen('row-stretch', values), library, measure);
    for (const id of ['a', 'b', 'd'])
      expect(boxOf(stretch, id)).toMatchObject({ y: 54, height: 92 });
    expect(boxOf(stretch, 'b').width).toBe(60);
  });
});

describe('arrange: column', () => {
  const box: Box = { x: 10, y: 20, width: 200, height: 300 };
  function columnScreen(typeId: string): Screen {
    return screenOf(
      host('c', typeId, box, { spacing: 8, padding: 4 }),
      leaf('a', 40, 'c', 20),
      leaf('b', 50, 'c', 30),
      leaf('d', 60, 'c', 10),
    );
  }

  it('start: y 24, 52, 90 e x 14', () => {
    const result = arrange(columnScreen('column-start'), library, measure);
    expect(['a', 'b', 'd'].map((id) => boxOf(result, id).y)).toEqual([24, 52, 90]);
    for (const id of ['a', 'b', 'd']) expect(boxOf(result, id).x).toBe(14);
    expect(boxOf(result, 'b')).toMatchObject({ width: 50, height: 30 });
  });

  it('stretch: largura vira a largura do conteúdo (192)', () => {
    const result = arrange(columnScreen('column-stretch'), library, measure);
    for (const id of ['a', 'b', 'd'])
      expect(boxOf(result, id)).toMatchObject({ x: 14, width: 192 });
    expect(boxOf(result, 'b')).toMatchObject({ y: 52, height: 30 });
  });
});

describe('arrange: aninhamento e movimento', () => {
  function nested(): Screen {
    return screenOf(
      host(
        'outer',
        'column-start',
        { x: 0, y: 0, width: 300, height: 200 },
        {
          spacing: 5,
          padding: 10,
        },
      ),
      host(
        'inner',
        'row-start',
        { x: 0, y: 0, width: 100, height: 40 },
        {
          spacing: 6,
          padding: 2,
        },
        'outer',
      ),
      leaf('a', 40, 'inner'),
      leaf('b', 40, 'inner'),
    );
  }

  it('a coluna posiciona a linha e a linha posiciona as folhas (coordenadas absolutas)', () => {
    const result = arrange(nested(), library, measure);
    expect(boxOf(result, 'inner')).toEqual({ x: 10, y: 10, width: 100, height: 40 });
    expect(boxOf(result, 'a')).toMatchObject({ x: 12, y: 12 });
    expect(boxOf(result, 'b')).toMatchObject({ x: 58, y: 12 });
  });

  it('mover o container com updateBox leva os filhos; arrange os mantém coerentes', () => {
    const arranged = arrange(nested(), library, measure);
    const moved = updateBox(arranged, 'outer', {
      x: 200,
      y: 100,
      width: 300,
      height: 200,
    });
    expect(boxOf(moved, 'a')).toMatchObject({ x: 212, y: 112 });
    const again = arrange(moved, library, measure);
    expect(again).toBe(moved);
    expect(boxOf(again, 'inner')).toMatchObject({ x: 210, y: 110 });
    expect(boxOf(again, 'b')).toMatchObject({ x: 258, y: 112 });
  });

  it('mover um filho de container com layout o devolve ao lugar calculado', () => {
    const arranged = arrange(nested(), library, measure);
    const dragged = updateBox(arranged, 'inner', {
      x: 200,
      y: 100,
      width: 100,
      height: 40,
    });
    const again = arrange(dragged, library, measure);
    expect(boxOf(again, 'inner')).toMatchObject({ x: 10, y: 10 });
    expect(boxOf(again, 'a')).toMatchObject({ x: 12, y: 12 });
  });

  it('arrange conserta filhos que ficaram fora do lugar depois de mover o container', () => {
    const arranged = arrange(
      rowScreen('row-start', { spacing: 8, padding: 4 }),
      library,
      measure,
    );
    const moved = updateBox(arranged, 'c', { x: 300, y: 200, width: 400, height: 100 });
    expect(xs(arrange(moved, library, measure)).map((x) => x - 300)).toEqual([
      4, 52, 120,
    ]);
  });
});

describe('arrange: sem mudança e reorganização', () => {
  it('Box (slot sem layout) deixa os filhos e devolve a mesma tela', () => {
    const screen = screenOf(host('c', 'box', CONTAINER_BOX), {
      ...leaf('a', 40, 'c'),
      box: { x: 7, y: 9, width: 40, height: 20 },
    });
    expect(arrange(screen, library, measure)).toBe(screen);
  });

  it('uma tela já organizada volta idêntica', () => {
    const arranged = arrange(
      rowScreen('row-start', { spacing: 8, padding: 4 }),
      library,
      measure,
    );
    expect(arranged).not.toBe(undefined);
    expect(arrange(arranged, library, measure)).toBe(arranged);
    const between = arrange(
      rowScreen('row-between', { spacing: 7, padding: 3 }),
      library,
      measure,
    );
    expect(arrange(between, library, measure)).toBe(between);
  });

  it('container sem filhos, tipo ausente e slot invisível não mudam nada', () => {
    const empty = screenOf(host('c', 'row-start', CONTAINER_BOX));
    expect(arrange(empty, library, measure)).toBe(empty);
    const unknown = screenOf(host('c', 'nao-existe', CONTAINER_BOX), leaf('a', 40, 'c'));
    expect(arrange(unknown, library, measure)).toBe(unknown);
    const hidden = screenOf(host('c', 'hidden', CONTAINER_BOX), leaf('a', 40, 'c'));
    expect(arrange(hidden, library, measure)).toBe(hidden);
    expect(boxOf(hidden, 'a')).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  });

  it('mudar o spacing com setValue e reorganizar espaça de novo', () => {
    const arranged = arrange(
      rowScreen('row-start', { spacing: 8, padding: 4 }),
      library,
      measure,
    );
    const wider = arrange(setValue(arranged, 'c', 'spacing', 20), library, measure);
    expect(xs(wider)).toEqual([104, 164, 244]);
  });
});

describe('dropIndex', () => {
  const arranged = arrange(
    rowScreen('row-start', { spacing: 8, padding: 4 }),
    library,
    measure,
  );
  // Centros em x: 124, 182, 230.
  const rowLayout = resolveSlotLayout(findSlot(typeOf('row-start').component)!, {});

  it('row: conta os irmãos cujo centro x fica antes do ponto', () => {
    const at = (x: number, exclude?: string) =>
      dropIndex(arranged, 'c', rowLayout, { x, y: 0 }, exclude);
    expect(at(100)).toBe(0);
    expect(at(150)).toBe(1);
    expect(at(200)).toBe(2);
    expect(at(300)).toBe(3);
    // Sem o arrastado (b): sobram os centros 124 e 230.
    expect(at(150, 'b')).toBe(1);
    expect(at(200, 'b')).toBe(1);
    expect(at(300, 'b')).toBe(2);
  });

  it('column: usa o centro y', () => {
    const column = arrange(
      screenOf(
        host(
          'c',
          'column-start',
          { x: 10, y: 20, width: 200, height: 300 },
          {
            spacing: 8,
            padding: 4,
          },
        ),
        leaf('a', 40, 'c', 20),
        leaf('b', 50, 'c', 30),
        leaf('d', 60, 'c', 10),
      ),
      library,
      measure,
    );
    // Centros em y: 34, 67, 95.
    const layout = resolveSlotLayout(findSlot(typeOf('column-start').component)!, {});
    expect(dropIndex(column, 'c', layout, { x: 0, y: 10 })).toBe(0);
    expect(dropIndex(column, 'c', layout, { x: 0, y: 50 })).toBe(1);
    expect(dropIndex(column, 'c', layout, { x: 0, y: 80 })).toBe(2);
    expect(dropIndex(column, 'c', layout, { x: 0, y: 200 })).toBe(3);
    expect(dropIndex(column, 'c', layout, { x: 0, y: 80 }, 'a')).toBe(1);
  });

  it('none devolve o fim da lista de irmãos', () => {
    const none = resolveSlotLayout(findSlot(typeOf('box').component)!, {});
    expect(dropIndex(arranged, 'c', none, { x: 0, y: 0 })).toBe(3);
    expect(dropIndex(arranged, 'c', none, { x: 0, y: 0 }, 'a')).toBe(2);
  });
});
