import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../src/i18n';
import {
  approximateMeasurer,
  buildCatalog,
  type Catalog,
  type FormatOutcome,
  type FormatRunner,
} from '../../../src/model';
import type { LibraryFile } from '../../../src/model/library';
import { locale } from '../../../src/store/settings';
import { FormatsPage } from '../../../src/ui/catalog/FormatsPage';
import { createCatalogRenderer } from '../../../src/ui/catalog/renderer';
import { COMPONENTS, FIXTURE } from '../../mcp/slotsProject';

// The Catalog's "File formats" page (stage #2035, AF5): each format with its facts and each example
// drawn as the screens `parse` builds, over the `slots` library with a fake plugin runner.

const EXAMPLE_TEXT = '{"screen":"home"}';
const ok = (value: unknown): FormatOutcome => ({ ok: true, value });

const HOME = [
  {
    op: 'add_container',
    as: '$s',
    name: 'Home',
    width: 800,
    height: 600,
    background: '#FFFFFF',
  },
  {
    op: 'create_marking',
    container: '$s',
    rect: { x: 100, y: 100, width: 360, height: 56 },
    annotation: { type: 'slots/bar' },
  },
];

function catalogOf(options: { description?: string; examples?: object[] } = {}): Catalog {
  const spec = JSON.parse(
    readFileSync(join(FIXTURE, 'slots.spec.json'), 'utf8'),
  ) as Record<string, unknown>;
  spec['formatVersion'] = 20;
  spec['fileFormats'] = [
    {
      id: 'screen',
      name: 'Screen',
      extension: 'json',
      ...(options.description === undefined ? {} : { description: options.description }),
      plugin: 'plugins/screen.js',
      contract: 1,
      examples: options.examples ?? [{ name: 'home', file: 'examples/home.json' }],
    },
  ];
  const files: LibraryFile[] = [
    { path: 'slots.spec.json', text: JSON.stringify(spec) },
    { path: 'plugins/screen.js', text: 'SCREEN' },
    { path: 'examples/home.json', text: EXAMPLE_TEXT },
    ...COMPONENTS.map((id) => ({
      path: `components/${id}.json`,
      text: readFileSync(join(FIXTURE, 'components', `${id}.json`), 'utf8'),
    })),
  ];
  return buildCatalog(files);
}

/** A plugin that defines `parse` (and `generate` unless `parseOnly`) and answers with `operations`. */
function runnerOf(operations: readonly object[], parseOnly = true): FormatRunner {
  return (_source, fn) =>
    Promise.resolve(
      fn === 'parse'
        ? ok({ operations, warnings: [] })
        : parseOnly
          ? {
              ok: false,
              failure: {
                code: 'plugin-failed',
                message: 'the plugin does not define generate',
              },
            }
          : ok(''),
    );
}

let counter = 0;
const rasterize = vi.fn(() => `data:image/png;base64,fake${counter++}`);

beforeEach(() => {
  locale.value = 'en-US';
  rasterize.mockClear();
});
afterEach(cleanup);

function page(catalog: Catalog, run?: FormatRunner) {
  const renderer = createCatalogRenderer(approximateMeasurer, rasterize);
  return render(
    <FormatsPage
      catalog={catalog}
      specId="slots"
      version={1}
      renderer={renderer}
      fontsEpoch={0}
      run={run}
    />,
  );
}

describe('FormatsPage', () => {
  it('shows the name, extension, scope, description and what the plugin defines', async () => {
    page(catalogOf({ description: 'One screen per file' }), runnerOf(HOME));
    expect(screen.getByRole('heading', { name: 'Screen' })).toBeTruthy();
    expect(screen.getByText('One screen per file')).toBeTruthy();
    expect(screen.getByText('.json')).toBeTruthy();
    expect(screen.getByText(t('catalog.formats.scope.project'))).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText(t('catalog.formats.defines', { functions: 'parse' })),
      ).toBeTruthy(),
    );
  });

  it('draws the screens an example builds, one image per container', async () => {
    page(catalogOf(), runnerOf(HOME));
    const image = await screen.findByRole('img', { name: 'Home' });
    expect(image.getAttribute('src')).toMatch(/^data:image\/png/);
    expect(rasterize).toHaveBeenCalledTimes(1);
  });

  it('keeps the example text in a collapsible block', async () => {
    const user = userEvent.setup();
    page(catalogOf(), runnerOf(HOME));
    await screen.findByRole('img', { name: 'Home' });
    expect(screen.queryByText(EXAMPLE_TEXT)).toBeNull();
    await user.click(screen.getByRole('button', { name: t('catalog.formats.showText') }));
    expect(screen.getByText(EXAMPLE_TEXT)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t('catalog.formats.hideText') }));
    expect(screen.queryByText(EXAMPLE_TEXT)).toBeNull();
  });

  it('shows the code and the message instead of the drawing when the example fails', async () => {
    page(catalogOf(), runnerOf([{ op: 'frobnicate' }]));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('plugin-output-invalid');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('says "nothing to draw" when the result has no component marking', async () => {
    page(
      catalogOf(),
      runnerOf([
        {
          op: 'add_container',
          as: '$s',
          name: 'Home',
          width: 800,
          height: 600,
          background: '#FFFFFF',
        },
      ]),
    );
    expect(await screen.findByText(t('catalog.formats.nothing'))).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('says so when the plugin does not load', async () => {
    const run: FormatRunner = () =>
      Promise.resolve({
        ok: false,
        failure: { code: 'plugin-failed', message: 'Error: boom', phase: 'load' },
      });
    page(catalogOf(), run);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => a.textContent?.includes('Error: boom'))).toBe(true);
  });

  it('does not draw the examples without a runner, and says so', () => {
    page(catalogOf());
    expect(screen.getByText(t('catalog.formats.noRunner'))).toBeTruthy();
    expect(screen.queryByText(t('catalog.formats.running'))).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('says when a format has no examples', () => {
    page(catalogOf({ examples: [] }), runnerOf(HOME));
    expect(screen.getByText(t('catalog.formats.noExamples'))).toBeTruthy();
  });
});
