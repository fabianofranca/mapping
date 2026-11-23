import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  buildCatalog,
  drawFormatExample,
  type Catalog,
  type FormatOutcome,
  type FormatRunner,
} from '../../src/model';
import type { LibraryFile } from '../../src/model/library';
import { FIXTURE, COMPONENTS } from '../mcp/slotsProject';

// The Catalog's "File formats" page (stage #2035, AF5, decision 14): an example's `parse` result applied
// to an empty project with the specialization, and each container drawn as a frame with its component
// markings at their rectangles. The plugin is a fake runner keyed by the plugin text.

const PLUGIN = 'plugins/screen.js';
const EXAMPLE = 'examples/home.json';
const EXAMPLE_TEXT = '{"screen":"home"}';

type Operations = readonly Record<string, unknown>[];

const HOME: Operations = [
  {
    op: 'add_container',
    as: '$screen',
    name: 'Home',
    width: 800,
    height: 600,
    background: '#FFFFFF',
  },
  {
    op: 'create_marking',
    as: '$bar',
    container: '$screen',
    rect: { x: 100, y: 100, width: 360, height: 56 },
    annotation: { type: 'slots/bar' },
  },
  {
    op: 'create_marking',
    as: '$pin',
    inside: '$bar',
    slot: 'actions',
    annotation: { type: 'slots/pin' },
  },
];

const ok = (value: unknown): FormatOutcome => ({ ok: true, value });

function runnerOf(operations: Operations): FormatRunner {
  return (_source, fn) =>
    Promise.resolve(
      fn === 'parse'
        ? ok({ operations, warnings: [] })
        : { ok: false, failure: { code: 'plugin-failed', message: 'no generate' } },
    );
}

/** The `slots` library with one format, a plugin and one example (JSON, so the Catalog reads its text). */
function catalogOf(edit?: (spec: Record<string, unknown>) => void): Catalog {
  const spec = JSON.parse(
    readFileSync(join(FIXTURE, 'slots.spec.json'), 'utf8'),
  ) as Record<string, unknown>;
  spec['formatVersion'] = 20;
  spec['fileFormats'] = [
    {
      id: 'screen',
      name: 'Screen',
      extension: 'json',
      plugin: PLUGIN,
      contract: 1,
      examples: [{ name: 'home', file: EXAMPLE }],
    },
  ];
  edit?.(spec);
  const files: LibraryFile[] = [
    { path: 'slots.spec.json', text: JSON.stringify(spec) },
    { path: PLUGIN, text: 'SCREEN' },
    { path: EXAMPLE, text: EXAMPLE_TEXT },
    ...COMPONENTS.map((id) => ({
      path: `components/${id}.json`,
      text: readFileSync(join(FIXTURE, 'components', `${id}.json`), 'utf8'),
    })),
  ];
  return buildCatalog(files);
}

async function draw(catalog: Catalog, operations: Operations) {
  const format = catalog.formats[0]!;
  return drawFormatExample(catalog, format, format.examples[0]!, {
    run: runnerOf(operations),
    measure: approximateMeasurer,
  });
}

describe('drawFormatExample', () => {
  it('draws a container with a slot child, each at its rectangle', async () => {
    const view = await draw(catalogOf(), HOME);
    if (view.kind !== 'drawing') throw new Error(`expected a drawing: ${view.kind}`);
    expect(view.containers).toHaveLength(1);
    const [home] = view.containers;
    expect(home!.name).toBe('Home');
    expect(home!.drawing.root).toMatchObject({ type: 'frame' });
    expect(home!.drawing.root.width).toBe(800);
    expect(home!.drawing.root.height).toBe(600);
    expect(home!.instances.map((i) => i.typeId)).toEqual(['bar', 'pin']);
    expect(home!.instances[0]!.rect).toEqual({ x: 100, y: 100, width: 360, height: 56 });
    // the pin sits inside the bar's rectangle (a slot child)
    const pin = home!.instances[1]!.rect;
    expect(pin.x).toBeGreaterThanOrEqual(100);
    expect(pin.y).toBeGreaterThanOrEqual(100);
    expect(pin.x + pin.width).toBeLessThanOrEqual(460);
    expect(home!.drawing.root.children).toHaveLength(2);
  });

  it('reports nothing to draw for a format whose types have no component', async () => {
    const catalog = catalogOf((spec) => {
      for (const layer of spec['layers'] as { annotationTypes: object[] }[]) {
        for (const type of layer.annotationTypes) {
          delete (type as { component?: string }).component;
        }
      }
    });
    const view = await draw(catalog, [
      {
        op: 'add_container',
        as: '$screen',
        name: 'Home',
        width: 800,
        height: 600,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: '$screen',
        rect: { x: 10, y: 10, width: 100, height: 40 },
        annotation: { type: 'slots/bar' },
      },
    ]);
    expect(view.kind).toBe('nothing');
  });

  it('gives the code and the message of a result the plugin got wrong', async () => {
    const view = await draw(catalogOf(), [{ op: 'frobnicate' }]);
    if (view.kind !== 'failed') throw new Error(`expected a failure: ${view.kind}`);
    expect(view.code).toBe('plugin-output-invalid');
    expect(view.message.length).toBeGreaterThan(0);
  });

  it('gives the code and the message of an operation the model refuses', async () => {
    const view = await draw(catalogOf(), [
      {
        op: 'create_marking',
        container: 'mapping://nope/i/1',
        rect: { x: 0, y: 0, width: 10, height: 10 },
        annotation: { type: 'slots/bar' },
      },
    ]);
    expect(view.kind).toBe('failed');
  });

  it('gives the failure of a plugin that throws', async () => {
    const catalog = catalogOf();
    const format = catalog.formats[0]!;
    const run: FormatRunner = () =>
      Promise.resolve({
        ok: false,
        failure: { code: 'plugin-failed', message: 'Error: boom', phase: 'call' },
      });
    const view = await drawFormatExample(catalog, format, format.examples[0]!, {
      run,
      measure: approximateMeasurer,
    });
    expect(view).toEqual({
      kind: 'failed',
      code: 'plugin-failed',
      message: 'Error: boom',
    });
  });

  it('says the example is unavailable when the Catalog has no text for it', async () => {
    const catalog = catalogOf();
    const format = catalog.formats[0]!;
    const view = await drawFormatExample(
      catalog,
      format,
      { ...format.examples[0]!, text: null },
      { run: runnerOf(HOME), measure: approximateMeasurer },
    );
    expect(view.kind).toBe('unavailable');
  });

  it('is unavailable when the plugin file is missing from the package', async () => {
    const catalog = catalogOf();
    const format = { ...catalog.formats[0]!, pluginText: null };
    const view = await drawFormatExample(catalog, format, format.examples[0]!, {
      run: runnerOf(HOME),
      measure: approximateMeasurer,
    });
    expect(view.kind).toBe('unavailable');
  });

  it('draws nothing for an example that feeds generate (it has an input)', async () => {
    const catalog = catalogOf();
    const format = catalog.formats[0]!;
    const view = await drawFormatExample(
      catalog,
      format,
      { ...format.examples[0]!, input: 'examples/home.input.json', inputText: '{}' },
      { run: runnerOf(HOME), measure: approximateMeasurer },
    );
    expect(view.kind).toBe('generate');
  });
});
