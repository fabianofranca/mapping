// Viewer (L1): the ScreenRenderer draws a screen in a Konva.Group and diffs per
// instance (object identity).
import Konva from 'konva';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../../../viewer/samples/samples';
import {
  type Instance,
  type Screen,
  renderOrder,
} from '../../../src/model/components/screen';
import { DEFAULT_PALETTE } from '../../../src/canvas/components/palette';
import {
  ScreenRenderer,
  type ScreenRendererLabels,
} from '../../../src/canvas/components/screenRenderer';

beforeAll(() => installFakeCanvas());

const library = loadLibrary(SAMPLE_FILES);

const LABELS: ScreenRendererLabels = {
  typeWithoutComponent: (name) => `${name}\n(no component)`,
  unknownType: (id) => `${id}\n(unknown type)`,
  warningTypeWithoutComponent: 'type without component in the specialization',
  warningUnknownType: 'type does not exist in the specialization',
  drawWarning: ({ code }) => code,
};

function setup(options: Partial<ConstructorParameters<typeof ScreenRenderer>[1]> = {}) {
  const group = new Konva.Group();
  const renderer = new ScreenRenderer(group, {
    labels: LABELS,
    measure: approximateMeasurer,
    ...options,
  });
  return { group, renderer };
}

/** Swaps an instance for a new object with a different `key` value. */
function withValue(screen: Screen, id: string, key: string, value: string): Screen {
  return {
    ...screen,
    instances: screen.instances.map((i) =>
      i.id === id ? { ...i, values: { ...i.values, [key]: value } } : i,
    ),
  };
}

describe('ScreenRenderer', () => {
  it('creates a group per instance, with instanceId, in renderOrder order', () => {
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

  it('respects zBase (the caller may have other children before)', () => {
    const { group, renderer } = setup();
    group.add(new Konva.Rect({ name: 'artboard' }));
    renderer.update(library, SAMPLE_SCREEN, { zBase: 1 });
    expect(group.getChildren()[0]?.name()).toBe('artboard');
    expect(
      (group.getChildren()[1] as Konva.Node | undefined)?.getAttr('instanceId'),
    ).toBe(renderer.ids()[0]);
    expect(group.getChildren()).toHaveLength(1 + SAMPLE_SCREEN.instances.length);
  });

  it('a second update with the same screen does not re-instantiate anything', () => {
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

  it('swapping one instance re-instantiates only it', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const nodes = new Map(renderer.ids().map((id) => [id, renderer.nodeOf(id)]));
    const inner = new Map(
      renderer.ids().map((id) => [id, renderer.nodeOf(id)?.getChildren()[0]]),
    );
    const next = withValue(SAMPLE_SCREEN, 'i-enter', 'label', 'Continuar');
    expect(renderer.update(library, next)).toBe(true);
    for (const id of renderer.ids()) {
      // The groups are the same objects.
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

  it('removing an instance destroys its group', () => {
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

  it('a swapped library (new object) re-instantiates everything', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const inner = renderer.ids().map((id) => renderer.nodeOf(id)?.getChildren()[0]);
    const other = loadLibrary(SAMPLE_FILES);
    expect(renderer.update(other, SAMPLE_SCREEN)).toBe(true);
    renderer.ids().forEach((id, index) => {
      expect(renderer.nodeOf(id)?.getChildren()[0]).not.toBe(inner[index]);
    });
    // force also re-instantiates, even with everything equal.
    const again = renderer.nodeOf('i-bar')?.getChildren()[0];
    expect(renderer.update(other, SAMPLE_SCREEN)).toBe(false);
    expect(renderer.update(other, SAMPLE_SCREEN, { force: true })).toBe(true);
    expect(renderer.nodeOf('i-bar')?.getChildren()[0]).not.toBe(again);
  });

  it('unknown type generates the placeholder and a warning', () => {
    const { renderer } = setup();
    const unknown: Instance = {
      id: 'x',
      typeId: 'does-not-exist',
      box: { x: 5, y: 6, width: 100, height: 40 },
      values: {},
    };
    renderer.update(library, { ...SAMPLE_SCREEN, instances: [unknown] });
    const node = renderer.nodeOf('x');
    const rect = node?.findOne<Konva.Rect>('Rect');
    expect(rect?.dash()).toEqual([6, 4]);
    expect(rect?.stroke()).toBe(DEFAULT_PALETTE.unknownLine);
    expect(node?.findOne<Konva.Text>('Text')?.text()).toContain('does-not-exist');
    expect(renderer.warnings().get('x')).toEqual(['type does not exist in the specialization']);
    // Without any library: all become a placeholder.
    const empty = setup();
    empty.renderer.update(undefined, SAMPLE_SCREEN);
    expect(empty.renderer.warnings().size).toBe(SAMPLE_SCREEN.instances.length);
  });

  it('a temporary render(instance) changes instanceOf and the next update undoes it', () => {
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
    // Unknown instance: ignored.
    expect(() => renderer.render({ ...original, id: 'fantasma' })).not.toThrow();
    expect(renderer.nodeOf('fantasma')).toBeUndefined();
  });

  it('instanceIdOf finds the instance from a child node', () => {
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

  it('instanceAt returns the topmost one', () => {
    const { renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    // The e-mail field is inside the card (drawn later, stays on top).
    expect(renderer.instanceAt({ x: 100, y: 300 })).toBe('i-email');
    expect(renderer.instanceAt({ x: 30, y: 220 })).toBe('i-card');
    expect(renderer.instanceAt({ x: 380, y: 800 })).toBeUndefined();
  });

  it('onInstanceCreated is called once per instance', () => {
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

  it("the texts of the missing-type box and of the warnings come from the caller's labels", () => {
    const { renderer } = setup({
      labels: {
        ...LABELS,
        typeWithoutComponent: (name) => `${name}\n(no component)`,
        unknownType: (id) => `${id}\n(unknown type)`,
        warningUnknownType: 'type is not in the specialization',
      },
    });
    const unknown: Instance = {
      id: 'x',
      typeId: 'does-not-exist',
      box: { x: 5, y: 6, width: 100, height: 40 },
      values: {},
    };
    renderer.update(library, { ...SAMPLE_SCREEN, instances: [unknown] });
    expect(renderer.nodeOf('x')?.findOne<Konva.Text>('Text')?.text()).toBe(
      'does-not-exist\n(unknown type)',
    );
    expect(renderer.warnings().get('x')).toEqual(['type is not in the specialization']);
  });

  it('color, fill, font and size of the missing-type box come from the palette', () => {
    const { renderer } = setup({
      palette: {
        unknownLine: '#123456',
        unknownFill: '#abcdef',
        labelFontSize: 20,
        labelFontFamily: 'Test Font',
      },
    });
    const unknown: Instance = {
      id: 'x',
      typeId: 'does-not-exist',
      box: { x: 0, y: 0, width: 100, height: 40 },
      values: {},
    };
    renderer.update(library, { ...SAMPLE_SCREEN, instances: [unknown] });
    const node = renderer.nodeOf('x');
    const rect = node?.findOne<Konva.Rect>('Rect');
    const text = node?.findOne<Konva.Text>('Text');
    expect(rect?.stroke()).toBe('#123456');
    expect(rect?.fill()).toBe('#abcdef');
    expect(text?.fill()).toBe('#123456');
    expect(text?.fontSize()).toBe(20);
    expect(text?.fontFamily()).toBe('Test Font');
  });

  it('dispose destroys the instance groups', () => {
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

describe('ScreenRenderer: reading direction (R1, #1096)', () => {
  /** x position, on the screen, of each text drawn inside the instances. */
  function textXs(direction?: 'rtl'): number[] {
    const { group, renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN, direction ? { direction } : {});
    return (group.find('Text') as Konva.Text[]).map((t) => t.getAbsolutePosition().x);
  }

  it('in rtl the component interior is mirrored, not just the instance box', () => {
    const ltr = textXs();
    const rtl = textXs('rtl');
    expect(ltr.length).toBeGreaterThan(0);
    expect(rtl).not.toEqual(ltr);
  });

  it('the default (without the option) is ltr and changing the direction redraws the instances', () => {
    const { group, renderer } = setup();
    renderer.update(library, SAMPLE_SCREEN);
    const before = (group.find('Text') as Konva.Text[]).map(
      (t) => t.getAbsolutePosition().x,
    );
    expect(renderer.update(library, SAMPLE_SCREEN, { direction: 'ltr' })).toBe(false);
    expect(renderer.update(library, SAMPLE_SCREEN, { direction: 'rtl' })).toBe(true);
    const after = (group.find('Text') as Konva.Text[]).map(
      (t) => t.getAbsolutePosition().x,
    );
    expect(after).not.toEqual(before);
  });
});
