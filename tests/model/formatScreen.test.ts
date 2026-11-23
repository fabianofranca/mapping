import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  type FormatFailure,
  type FormatOutcome,
  type FormatRunner,
} from '../../src/model';
import { loadLibrary, type Library } from '../../src/model/components/library';
import { formatScreens, sandboxFailureCode } from '../../src/model/formatScreen';
import { FIXTURE, COMPONENTS } from '../mcp/slotsProject';

// The model turns a format plugin's result into the screens the viewer draws (stage #2059, VF1,
// decisions 9 and 10). The plugin is a fake runner keyed by the plugin text, as in
// `catalogFormats.test.ts`.

const PLUGIN = 'plugins/screen.js';

type Operations = readonly Record<string, unknown>[];
type Spec = Record<string, unknown>;

const ok = (value: unknown): FormatOutcome => ({ ok: true, value });

/** A runner whose `parse` result depends on the plugin text it receives. */
function runnerOf(
  plugins: Readonly<Record<string, FormatOutcome | Error>>,
): FormatRunner {
  return (source, fn) => {
    const outcome = plugins[source];
    if (outcome instanceof Error) return Promise.reject(outcome);
    return Promise.resolve(
      outcome === undefined || fn !== 'parse'
        ? { ok: false, failure: { code: 'plugin-failed', message: 'no plugin' } }
        : outcome,
    );
  };
}

const parsed = (operations: Operations, warnings: readonly string[] = []) =>
  ok({ operations, warnings });

/** The `slots` library with one `screen` format whose plugin text is `SCREEN`. */
function libraryOf(edit?: (spec: Spec) => void): Library {
  const spec = JSON.parse(readFileSync(join(FIXTURE, 'slots.spec.json'), 'utf8')) as Spec;
  spec['formatVersion'] = 22;
  spec['fileFormats'] = [
    { id: 'screen', name: 'Screen', extension: 'json', plugin: PLUGIN, contract: 1 },
    {
      id: 'other',
      name: 'Other',
      extension: 'txt',
      plugin: 'plugins/other.js',
      contract: 1,
    },
  ];
  edit?.(spec);
  return loadLibrary([
    { path: 'slots.spec.json', text: JSON.stringify(spec) },
    { path: PLUGIN, text: 'SCREEN' },
    ...COMPONENTS.map((id) => ({
      path: `components/${id}.json`,
      text: readFileSync(join(FIXTURE, 'components', `${id}.json`), 'utf8'),
    })),
  ]);
}

const container = (as: string, extra: Record<string, unknown> = {}) => ({
  op: 'add_container',
  as,
  name: as.slice(1),
  width: 800,
  height: 600,
  background: '#FFFFFF',
  ...extra,
});

const bar = (as: string, inContainer: string, extra: Record<string, unknown> = {}) => ({
  op: 'create_marking',
  as,
  container: inContainer,
  rect: { x: 100, y: 100, width: 360, height: 56 },
  annotation: { type: 'slots/bar' },
  ...extra,
});

async function screensOf(operations: Operations, library = libraryOf()) {
  return formatScreens(library, 'text', {
    format: 'slots/screen',
    measure: approximateMeasurer,
    run: runnerOf({ SCREEN: parsed(operations) }),
  });
}

describe('formatScreens', () => {
  it('gives one screen per container with component markings, in project order', async () => {
    const result = await screensOf([
      container('$home'),
      container('$empty'),
      container('$detail', { width: 400, height: 300, background: '#112233' }),
      bar('$a', '$home'),
      bar('$b', '$detail', { rect: { x: 10, y: 20, width: 360, height: 56 } }),
    ]);
    expect(result.error).toBeUndefined();
    expect(result.screens.map((s) => [s.id, s.name])).toEqual([
      ['s1', 'home'],
      ['s2', 'detail'],
    ]);
    expect(result.screen).toBe(result.screens[0]);
    const [home, detail] = result.screens;
    expect([home!.width, home!.height, home!.background]).toEqual([800, 600, '#FFFFFF']);
    expect([detail!.width, detail!.height, detail!.background]).toEqual([
      400,
      300,
      '#112233',
    ]);
    expect(home!.instances).toHaveLength(1);
    expect(home!.instances[0]).toMatchObject({
      typeId: 'bar',
      box: { x: 100, y: 100, width: 360, height: 56 },
    });
    expect(detail!.instances[0]!.box).toEqual({ x: 10, y: 20, width: 360, height: 56 });
  });

  it('divides the size and the boxes by the density: density 2 gives half the size', async () => {
    const result = await screensOf([
      container('$home', { density: 2 }),
      bar('$a', '$home', { rect: { x: 100, y: 60, width: 360, height: 112 } }),
    ]);
    const [screen] = result.screens;
    expect([screen!.width, screen!.height]).toEqual([400, 300]);
    expect(screen!.instances[0]!.box).toEqual({ x: 50, y: 30, width: 180, height: 56 });
  });

  it('carries the reading direction only when it is rtl', async () => {
    const rtl = await screensOf([container('$a', { direction: 'rtl' }), bar('$b', '$a')]);
    expect(rtl.screens[0]!.direction).toBe('rtl');
    const ltr = await screensOf([container('$a'), bar('$b', '$a')]);
    expect(ltr.screens[0]).not.toHaveProperty('direction');
  });

  it('sets parentId on a slot child, and slot only when the parent has more than one slot', async () => {
    const result = await screensOf([
      container('$home'),
      bar('$bar', '$home'),
      {
        op: 'create_marking',
        as: '$pin',
        inside: '$bar',
        slot: 'actions',
        annotation: { type: 'slots/pin' },
      },
    ]);
    expect(result.error).toBeUndefined();
    const [barInstance, pinInstance] = result.screens[0]!.instances;
    expect(barInstance).not.toHaveProperty('parentId');
    expect(barInstance).not.toHaveProperty('slot');
    expect(pinInstance).toMatchObject({
      typeId: 'pin',
      parentId: barInstance!.id,
      slot: 'actions',
    });
  });

  it('leaves slot out when the parent has a single slot', async () => {
    const library = libraryOf((spec) => {
      const layers = spec['layers'] as { annotationTypes: Spec[] }[];
      const rounded = layers[0]!.annotationTypes.find((t) => t['id'] === 'rounded-bar')!;
      rounded['slots'] = [{ id: 'content', name: 'Content', accepts: ['pin'], max: 3 }];
    });
    const result = await screensOf(
      [
        container('$home'),
        {
          op: 'create_marking',
          as: '$rounded',
          container: '$home',
          rect: { x: 100, y: 100, width: 200, height: 80 },
          annotation: { type: 'slots/rounded-bar' },
        },
        {
          op: 'create_marking',
          as: '$pin',
          inside: '$rounded',
          annotation: { type: 'slots/pin' },
        },
      ],
      library,
    );
    expect(result.error).toBeUndefined();
    const [parent, child] = result.screens[0]!.instances;
    expect(child).toMatchObject({ typeId: 'pin', parentId: parent!.id });
    expect(child).not.toHaveProperty('slot');
  });

  describe('instance ids', () => {
    const source = (id: string) => ({ system: 'sdui', id, url: null });
    const marked = (sources: (string | null)[]): Operations => [
      container('$home'),
      ...sources.map((id, i) =>
        bar(`$m${i}`, '$home', id === null ? {} : { source: source(id) }),
      ),
    ];

    it('uses source.id when it has one and it is unique, otherwise m<n>', async () => {
      const result = await screensOf(marked(['title', null, 'dup', 'dup', 'last']));
      expect(result.screens[0]!.instances.map((i) => i.id)).toEqual([
        'title',
        'm2',
        'm3',
        'm4',
        'last',
      ]);
    });

    it('never uses a source id that looks like a generated one', async () => {
      const result = await screensOf(marked(['m2', null]));
      const ids = result.screens[0]!.instances.map((i) => i.id);
      expect(new Set(ids).size).toBe(2);
      expect(ids).toEqual(['m1', 'm2']);
    });

    it('gives the same ids on two runs of the same text', async () => {
      const operations = marked(['title', null, 'dup', 'dup']);
      const first = await screensOf(operations);
      const second = await screensOf(operations);
      expect(second.screens).toEqual(first.screens);
      expect(first.screens[0]!.instances.map((i) => i.id)).toEqual([
        'title',
        'm2',
        'm3',
        'm4',
      ]);
    });
  });

  it('puts the plugin warnings and the drawing values warnings in warnings, as texts', async () => {
    const result = await formatScreens(libraryOf(), 'text', {
      format: 'slots/screen',
      measure: approximateMeasurer,
      run: runnerOf({
        SCREEN: parsed([container('$home'), bar('$a', '$home')], ['plugin said hello']),
      }),
    });
    expect(result.warnings).toContain('plugin said hello');
    expect(result.warnings.every((w) => typeof w === 'string')).toBe(true);
  });

  describe('failures, as a code and a message', () => {
    it('nothing-to-draw when no container has component markings', async () => {
      const result = await screensOf([container('$home')]);
      expect(result.screens).toEqual([]);
      expect(result.screen).toBeUndefined();
      expect(result.error?.code).toBe('nothing-to-draw');
      expect(result.error?.message.length).toBeGreaterThan(0);
    });

    it('format-not-found lists the available formats', async () => {
      const result = await formatScreens(libraryOf(), 'text', {
        format: 'slots/missing',
        measure: approximateMeasurer,
        run: runnerOf({}),
      });
      expect(result.screens).toEqual([]);
      expect(result.error?.code).toBe('format-not-found');
      expect(result.error?.message).toContain('slots/missing');
      expect(result.error?.message).toContain('slots/screen');
      expect(result.error?.message).toContain('slots/other');
    });

    it('format-not-found for another specialization id', async () => {
      const result = await formatScreens(libraryOf(), 'text', {
        format: 'other/screen',
        measure: approximateMeasurer,
        run: runnerOf({}),
      });
      expect(result.error?.code).toBe('format-not-found');
    });

    it('format-not-found when the library has no formats', async () => {
      const library = libraryOf((spec) => {
        delete spec['fileFormats'];
        spec['formatVersion'] = 17;
      });
      const result = await screensOf([], library);
      expect(result.error?.code).toBe('format-not-found');
    });

    it('format-not-found when the plugin text did not come with the library', async () => {
      const result = await formatScreens(libraryOf(), 'text', {
        format: 'slots/other',
        measure: approximateMeasurer,
        run: runnerOf({}),
      });
      expect(result.error?.code).toBe('format-not-found');
      expect(result.error?.message).toContain('plugins/other.js');
    });

    it('spec-invalid brings the first issue', async () => {
      const library = libraryOf();
      const broken: Library = { ...library, specJson: { format: 'mapping-spec' } };
      const result = await screensOf([], broken);
      expect(result.screens).toEqual([]);
      expect(result.error?.code).toBe('spec-invalid');
      expect(result.error?.message.length).toBeGreaterThan(0);
    });

    it('a refused operation says which one', async () => {
      const result = await screensOf([
        container('$home'),
        {
          op: 'create_marking',
          container: '$home',
          rect: { x: 0, y: 0, width: 10, height: 10 },
          annotation: { type: 'slots/not-a-type' },
        },
      ]);
      expect(result.screens).toEqual([]);
      expect(result.error?.message).toMatch(/^operation 1 \(create_marking\) refused/);
    });

    it('plugin-failed keeps line and column', async () => {
      const failure: FormatFailure = {
        code: 'plugin-failed',
        message: 'boom',
        line: 3,
        column: 7,
      };
      const result = await formatScreens(libraryOf(), 'text', {
        format: 'slots/screen',
        measure: approximateMeasurer,
        run: runnerOf({ SCREEN: { ok: false, failure } }),
      });
      expect(result.screens).toEqual([]);
      expect(result.error).toMatchObject({
        code: 'plugin-failed',
        line: 3,
        column: 7,
      });
      expect(result.error?.message).toContain('boom');
      expect(result.error?.message).toContain(`${PLUGIN}:3:7`);
    });

    it.each(['plugin-timeout', 'plugin-limit', 'plugin-output-invalid'] as const)(
      'gives %s as the runner does',
      async (code) => {
        const result = await formatScreens(libraryOf(), 'text', {
          format: 'slots/screen',
          measure: approximateMeasurer,
          run: runnerOf({ SCREEN: { ok: false, failure: { code, message: 'x' } } }),
        });
        expect(result.error?.code).toBe(code);
      },
    );

    it('a failure of the phase sandbox is sandbox-unavailable', async () => {
      const failure = {
        code: 'plugin-failed',
        message: 'the sandbox that runs the plugin did not start',
        phase: 'sandbox',
      } as unknown as FormatFailure;
      const result = await formatScreens(libraryOf(), 'text', {
        format: 'slots/screen',
        measure: approximateMeasurer,
        run: runnerOf({ SCREEN: { ok: false, failure } }),
      });
      expect(result.screens).toEqual([]);
      expect(result.error?.code).toBe('sandbox-unavailable');
      expect(result.error?.message).toContain('did not start');
    });

    it('never throws: an exception of the runner becomes error', async () => {
      const result = await formatScreens(libraryOf(), 'text', {
        format: 'slots/screen',
        measure: approximateMeasurer,
        run: runnerOf({ SCREEN: new Error('runner exploded') }),
      });
      expect(result.screens).toEqual([]);
      expect(result.error?.code).toBe('plugin-failed');
      expect(result.error?.message).toContain('runner exploded');
    });

    it('never throws: an exception of the model becomes error', async () => {
      const library = libraryOf();
      const hostile = new Proxy(library, {
        get(target, key, receiver) {
          if (key === 'fileFormats') throw new Error('model exploded');
          return Reflect.get(target, key, receiver);
        },
      });
      const result = await screensOf([], hostile);
      expect(result.screens).toEqual([]);
      expect(result.error?.message).toContain('model exploded');
    });
  });

  describe('sandboxFailureCode', () => {
    it('maps phase sandbox to sandbox-unavailable and leaves the others', () => {
      const sandbox = { code: 'plugin-failed', message: 'm', phase: 'sandbox' };
      expect(sandboxFailureCode(sandbox)).toBe('sandbox-unavailable');
      expect(sandboxFailureCode({ code: 'plugin-timeout' })).toBe('plugin-timeout');
      expect(sandboxFailureCode({ code: 'plugin-failed', phase: 'call' })).toBe(
        'plugin-failed',
      );
    });
  });
});
