import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import type { Signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormatOutcome, Project } from '../../src/model';
import type { ProjectCatalog } from '../../src/store/projectCatalogs';
import { locale } from '../../src/store/settings';

// The dialog of Import from a format (stage #2035, AF4): the formats that parse, the target container for
// scope `container`, the file, the Preview (counts, warnings or the error with its path) and Import, which
// applies the previewed result in one undo entry. The plugin does not run here (the executor is replaced);
// the real sandbox is covered by `tests/e2e/formatPlugins.spec.ts`.

const run = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/formatRunner', () => ({ runFormat: run }));

import { FormatImportDialog } from '../../src/app/FormatImportDialog';
import { formatProject } from '../model/formatFixtures';
import { createHarness, renderLive, type Harness } from './harness';

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

const openapi = format('openapi', 'OpenAPI', 'project', 'function parse() {}', 'yaml');
const csv = format('csv', 'Attributes', 'container', 'function parse() {}');
const generateOnly = format('gen', 'Writer', 'project', 'function generate() {}');

function catalogsOf(formats: ReturnType<typeof format>[]): ProjectCatalog[] {
  return [
    { specId: 'data-model', name: 'Data model', catalog: { formats } },
  ] as unknown as ProjectCatalog[];
}

function setup(
  formats: ReturnType<typeof format>[],
  options: { readOnly?: boolean; select?: boolean } = {},
) {
  const harness: Harness = createHarness(formatProject(), options.readOnly ?? false);
  const { catalogs: store } = harness.context.session;
  (store.entries as Signal<readonly ProjectCatalog[] | null>).value = catalogsOf(formats);
  Reflect.set(store, 'request', vi.fn());
  if (options.select) harness.ui.selection.value = { kind: 'marking', id: 'M3' };
  const onClose = vi.fn();
  const view = renderLive(harness, () => <FormatImportDialog onClose={onClose} />);
  return { harness, onClose, view };
}

const previewButton = () => screen.getByRole('button', { name: 'Preview' });
const importButton = () => screen.getByRole('button', { name: 'Import' });
const isDisabled = (button: HTMLElement) => (button as HTMLButtonElement).disabled;

function chooseFile(name: string, text = 'file text') {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('no file input');
  const file = new File([text], name);
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

const newContainer = {
  op: 'add_container',
  as: '$new',
  name: 'Imported',
  width: 200,
  height: 100,
  background: '#FFFFFF',
};
const newMarking = {
  op: 'create_marking',
  container: '$new',
  rect: { x: 0, y: 0, width: 50, height: 20 },
  annotation: { type: 'data-model/class', values: { name: 'A' } },
};

const parsed = (operations: unknown[], warnings: string[] = []) =>
  ({ ok: true, value: { operations, warnings } }) satisfies FormatOutcome;

async function previewWith(outcome: FormatOutcome, name = 'in.yaml') {
  run.mockResolvedValue(outcome);
  chooseFile(name);
  fireEvent.click(previewButton());
}

describe('FormatImportDialog', () => {
  it('lists the formats that define parse, as "specialization › format (.extension)"', () => {
    setup([openapi, csv, generateOnly]);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Data model › OpenAPI (.yaml)');
    expect(options).toContain('Data model › Attributes (.csv)');
    expect(options.join('|')).not.toContain('Writer');
  });

  it('says so when no applied format imports, with nothing to run', () => {
    setup([generateOnly]);
    expect(
      screen.getByText('No applied specialization has a format that imports.'),
    ).toBeTruthy();
    expect(isDisabled(previewButton())).toBe(true);
    expect(isDisabled(importButton())).toBe(true);
  });

  it('repeats the isolation line of decision 5', () => {
    setup([openapi]);
    expect(
      screen.getByText(
        'The plugin code runs isolated, without network, disk or access to your projects.',
      ),
    ).toBeTruthy();
  });

  it('asks for a Target only for scope container, with "None" and the selected container by default', () => {
    setup([openapi, csv], { select: true });
    expect(screen.queryByLabelText('Target')).toBeNull();
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: '1' } });
    const target = screen.getByLabelText('Target') as HTMLSelectElement;
    expect([...target.options].map((o) => o.text)[0]).toBe(
      'None (the plugin creates it)',
    );
    expect(target.value).toBe('C1');
    fireEvent.change(target, { target: { value: '' } });
    expect((screen.getByLabelText('Target') as HTMLSelectElement).value).toBe('');
  });

  it('the file picker takes the extension of the format', () => {
    setup([openapi, csv]);
    const input = document.querySelector<HTMLInputElement>('input[type=file]');
    expect(input?.accept).toBe('.yaml');
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: '1' } });
    expect(document.querySelector<HTMLInputElement>('input[type=file]')?.accept).toBe(
      '.csv',
    );
  });

  it('Preview waits for a file, and Import waits for a preview', () => {
    setup([openapi]);
    expect(isDisabled(previewButton())).toBe(true);
    expect(screen.getByText('No file chosen')).toBeTruthy();
    chooseFile('in.yaml');
    expect(screen.getByText('in.yaml')).toBeTruthy();
    expect(isDisabled(previewButton())).toBe(false);
    expect(isDisabled(importButton())).toBe(true);
  });

  it('Preview shows the counts by kind and the plugin’s warnings, and enables Import', async () => {
    setup([openapi]);
    await previewWith(
      parsed(
        [
          newContainer,
          newMarking,
          { op: 'update_annotation', annotation: 'a3', values: { name: 'Renamed' } },
        ],
        ['line 4 skipped'],
      ),
    );
    const table = await screen.findByRole('table');
    const rows = [...table.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ['Containers', '1', '0'],
      ['Markings', '1', '0'],
      ['Annotations', '1', '1'],
      ['Arrows', '0', '0'],
    ]);
    expect(screen.getByText('line 4 skipped')).toBeTruthy();
    expect(isDisabled(importButton())).toBe(false);
  });

  it('a result that cannot be applied shows the error with its path and leaves Import disabled', async () => {
    setup([openapi]);
    await previewWith(parsed([{ op: 'update_marking', marking: 'm3', locked: 'yes' }]));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('operations[0].locked');
    expect(screen.queryByRole('table')).toBeNull();
    expect(isDisabled(importButton())).toBe(true);
  });

  it('a result the contract refuses shows the path too', async () => {
    setup([openapi]);
    await previewWith(parsed([{ op: 'delete_marking', marking: 'm3' }]));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('operations[0].op');
    expect(isDisabled(importButton())).toBe(true);
  });

  it('a file with another extension is refused before the plugin runs', async () => {
    setup([openapi]);
    chooseFile('in.json');
    fireEvent.click(previewButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Choose a .yaml file: that is the format’s extension.',
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('the failure of the plugin is shown as the export shows it', async () => {
    setup([openapi]);
    await previewWith({
      ok: false,
      failure: { code: 'plugin-failed', message: 'boom', line: 3, column: 5 },
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The plugin failed: boom (line 3, column 5)');
  });

  it('Import applies the previewed result in one undo entry, without running the plugin again, and selects what it created', async () => {
    const { harness, onClose } = setup([openapi]);
    const before: Project = harness.project();
    await previewWith(parsed([newContainer, newMarking]));
    await waitFor(() => expect(isDisabled(importButton())).toBe(false));
    expect(run).toHaveBeenCalledTimes(1);
    fireEvent.click(importButton());
    expect(run).toHaveBeenCalledTimes(1);
    const after = harness.project();
    expect(after.containers.length).toBe(before.containers.length + 1);
    expect(after.markings.length).toBe(before.markings.length + 1);
    expect(harness.ui.selection.value).toMatchObject({ kind: 'marking' });
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().containers.length).toBe(before.containers.length);
    expect(harness.store.canUndo.value).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('another file after a preview is another preview: Import is disabled again', async () => {
    setup([openapi]);
    await previewWith(parsed([newContainer, newMarking]));
    await waitFor(() => expect(isDisabled(importButton())).toBe(false));
    chooseFile('other.yaml');
    await waitFor(() => expect(isDisabled(importButton())).toBe(true));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('is disabled while the project is read-only, and says so', () => {
    setup([openapi], { readOnly: true });
    chooseFile('in.yaml');
    expect(screen.getByText(/cannot be edited/)).toBeTruthy();
    expect(isDisabled(previewButton())).toBe(true);
    expect(isDisabled(importButton())).toBe(true);
  });

  it('a preview goes stale when the project changes: Import is disabled until a new Preview', async () => {
    const { harness } = setup([openapi]);
    await previewWith(parsed([newContainer, newMarking]));
    await waitFor(() => expect(isDisabled(importButton())).toBe(false));
    act(() => {
      harness.store.apply((p) => ({ ...p, project: { ...p.project, name: 'Renamed' } }));
    });
    await waitFor(() => expect(isDisabled(importButton())).toBe(true));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('in a review it says the project cannot be edited, not that it is read-only', () => {
    const { harness } = setup([openapi]);
    act(() => harness.store.setReviewing('p1'));
    expect(screen.getByText(/proposal is in review/)).toBeTruthy();
    expect(isDisabled(importButton())).toBe(true);
  });

  it('another format forgets the file, which may have the wrong extension', () => {
    setup([openapi, csv]);
    chooseFile('plan.yaml');
    expect(screen.getByText('plan.yaml')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: '1' } });
    expect(screen.getByText('No file chosen')).toBeTruthy();
    expect(isDisabled(previewButton())).toBe(true);
  });
});
