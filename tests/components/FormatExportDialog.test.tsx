import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import type { Signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormatOutcome } from '../../src/model';
import type { ProjectCatalog } from '../../src/store/projectCatalogs';
import { locale } from '../../src/store/settings';

// The dialog of Export in a format (stage #2035, AF3): the formats of the applied specializations,
// the container select for scope `container`, the run and the error line. The plugin does not run
// here (the executor is replaced); the real sandbox is covered by `tests/e2e/formatPlugins.spec.ts`.

const run = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/formatRunner', () => ({ runFormat: run }));

import { FormatExportDialog } from '../../src/app/FormatExportDialog';
import { formatProject } from '../model/formatFixtures';
import { createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
  run.mockReset();
});
afterEach(cleanup);

const format = (
  id: string,
  name: string,
  scope: 'project' | 'container',
  plugin: string,
  extension = id,
) => ({
  id,
  name,
  extension,
  scope,
  plugin: `plugins/${id}.js`,
  pluginText: plugin,
  examples: [],
});

function catalogsOf(formats: ReturnType<typeof format>[]): ProjectCatalog[] {
  return [
    { specId: 'data-model', name: 'Data model', catalog: { formats } },
  ] as unknown as ProjectCatalog[];
}

function setup(catalogs: ProjectCatalog[] | null) {
  const harness = createHarness(formatProject());
  const { catalogs: store } = harness.context.session;
  (store.entries as Signal<readonly ProjectCatalog[] | null>).value = catalogs;
  Reflect.set(store, 'request', vi.fn());
  const onGenerated = vi.fn();
  const view = renderLive(harness, () => (
    <FormatExportDialog onClose={vi.fn()} onGenerated={onGenerated} />
  ));
  const setEntries = (next: ProjectCatalog[]) => {
    (store.entries as Signal<readonly ProjectCatalog[] | null>).value = next;
  };
  return { onGenerated, view, setEntries };
}

const exportButton = () => screen.getByRole('button', { name: 'Export' });

describe('FormatExportDialog', () => {
  it('lists the formats that define generate, as "specialization › format (.extension)"', () => {
    setup(
      catalogsOf([
        format('openapi', 'OpenAPI', 'project', 'function generate() {}', 'yaml'),
        format('csv', 'Attributes', 'container', 'function generate() {}'),
        format('json', 'Reader', 'project', 'function parse() {}'),
      ]),
    );
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Data model › OpenAPI (.yaml)');
    expect(options).toContain('Data model › Attributes (.csv)');
    expect(options.join('|')).not.toContain('Reader');
  });

  it('says so when no applied format exports', () => {
    setup(catalogsOf([format('json', 'Reader', 'project', 'function parse() {}')]));
    expect(
      screen.getByText('No applied specialization has a format that exports.'),
    ).toBeTruthy();
    expect((exportButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for a container only when the format has scope container', () => {
    setup(
      catalogsOf([
        format('openapi', 'OpenAPI', 'project', 'function generate() {}', 'yaml'),
        format('csv', 'Attributes', 'container', 'function generate() {}'),
      ]),
    );
    expect(screen.queryByLabelText('Container')).toBeNull();
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: '1' } });
    expect(screen.getByLabelText('Container')).toBeTruthy();
  });

  it('hands over the file the plugin generated', async () => {
    run.mockResolvedValue({ ok: true, value: 'the text' } satisfies FormatOutcome);
    const { onGenerated } = setup(
      catalogsOf([
        format('openapi', 'OpenAPI', 'project', 'function generate() {}', 'yaml'),
      ]),
    );
    fireEvent.click(exportButton());
    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    const file = onGenerated.mock.calls[0]?.[0] as File;
    expect(file.name).toMatch(/\.yaml$/);
    expect(await file.text()).toBe('the text');
  });

  it('shows the plugin failure on an error line and hands nothing over', async () => {
    run.mockResolvedValue({
      ok: false,
      failure: { code: 'plugin-failed', message: 'boom', line: 3, column: 5 },
    } satisfies FormatOutcome);
    const { onGenerated } = setup(
      catalogsOf([
        format('openapi', 'OpenAPI', 'project', 'function generate() {}', 'yaml'),
      ]),
    );
    fireEvent.click(exportButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The plugin failed: boom (line 3, column 5)');
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('an export that rejects shows an error line and the dialog can run again', async () => {
    run.mockRejectedValue(new Error('storage exploded'));
    setup(
      catalogsOf([
        format('openapi', 'OpenAPI', 'project', 'function generate() {}', 'yaml'),
      ]),
    );
    fireEvent.click(exportButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The export failed for an unexpected reason.');
    expect((exportButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('a run that ends after the dialog closed hands nothing over', async () => {
    let finish: (outcome: FormatOutcome) => void = () => undefined;
    run.mockReturnValue(new Promise<FormatOutcome>((resolve) => (finish = resolve)));
    const { onGenerated, view } = setup(
      catalogsOf([
        format('openapi', 'OpenAPI', 'project', 'function generate() {}', 'yaml'),
      ]),
    );
    fireEvent.click(exportButton());
    // Preact 11 runs the cleanup of passive effects after the paint; `act` flushes it.
    act(() => view.unmount());
    await act(async () => {
      finish({ ok: true, value: 'late' });
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('the picked format follows its ref when the catalogs reload in another order', () => {
    const openapi = format(
      'openapi',
      'OpenAPI',
      'project',
      'function generate() {}',
      'yaml',
    );
    const csvFormat = format('csv', 'Attributes', 'container', 'function generate() {}');
    const { setEntries } = setup(catalogsOf([openapi, csvFormat]));
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: '1' } });
    expect(
      (screen.getByLabelText('Format') as HTMLSelectElement).selectedOptions[0]?.text,
    ).toBe('Data model › Attributes (.csv)');
    act(() => setEntries(catalogsOf([csvFormat, openapi])));
    expect(
      (screen.getByLabelText('Format') as HTMLSelectElement).selectedOptions[0]?.text,
    ).toBe('Data model › Attributes (.csv)');
  });
});
