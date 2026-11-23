import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_CATALOG,
  applySpecialization,
  approximateMeasurer,
  parseSpec,
  type FormatOutcome,
  type FormatResult,
  type Project,
} from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import {
  importSelection,
  previewImport,
  type FormatChoice,
  type ImportInFormatDeps,
} from '../../src/store/formatActions';
import { NOW, emptyProject } from '../model/fixtures';
import { viewOf } from './perspectiveHarness';
import { formatProject } from '../model/formatFixtures';

// The Import action (stage #2035, AF4, decisions 4 and 12): the checked result of a preview is applied to
// the current project through one store action, which is one undo entry, never runs the plugin again,
// refuses while the project is read-only (or in review) and leaves the created markings selected.

function setup(project: Project = formatProject(), options: { readOnly?: boolean } = {}) {
  let clock = 0;
  let next = 0;
  const store = createProjectStore({
    now: () => new Date(Date.parse(NOW) + ++clock * 1000).toISOString(),
  });
  const actions = createProjectActions(store, { newId: () => `id${++next}` });
  store.load(project, options);
  return { store, actions };
}

type Store = ReturnType<typeof createProjectStore>;

const project = (store: Store): Project => {
  if (!store.project.value) throw new Error('no project');
  return store.project.value;
};

const input = { project: { name: 'Demo' } };

/** The same project, apart from the time of the last change that the history stamps. */
const sameButTouched = (a: Project, b: Project): boolean =>
  JSON.stringify({ ...a, project: { ...a.project, updatedAt: '' } }) ===
  JSON.stringify({ ...b, project: { ...b.project, updatedAt: '' } });

const result: FormatResult = {
  operations: [
    {
      op: 'add_container',
      as: '$new',
      name: 'New',
      width: 200,
      height: 100,
      background: '#FFFFFF',
    },
    {
      op: 'create_marking',
      as: '$box',
      container: '$new',
      rect: { x: 0, y: 0, width: 50, height: 20 },
      annotation: { type: 'data-model/class', values: { name: 'A' } },
    },
    { op: 'create_arrow', from: 'm1', to: 'm4' },
    { op: 'update_annotation', annotation: 'a3', values: { name: 'Renamed' } },
  ],
  warnings: ['careful'],
};

describe('store: importFormat', () => {
  it('applies the result to the current project and reports what was created and changed', () => {
    const { store, actions } = setup();
    const before = project(store);
    const done = actions.importFormat(input, result);
    if (!done.ok) throw new Error(`expected success: ${JSON.stringify(done)}`);
    const after = project(store);
    expect(after.containers.length).toBe(before.containers.length + 1);
    expect(after.markings.length).toBe(before.markings.length + 1);
    expect(after.arrows.length).toBe(before.arrows.length + 1);
    expect(done.value.created.map((c) => c.kind).sort()).toEqual(['a', 'i', 'm', 'm']);
    expect(done.value.updated.map((c) => c.kind)).toEqual(['a']);
  });

  it('is one undo entry for the whole import: one undo restores the project before it', () => {
    const { store, actions } = setup();
    const before = project(store);
    actions.importFormat(input, result);
    expect(store.canUndo.value).toBe(true);
    expect(store.undo()).toBe(true);
    expect(sameButTouched(project(store), before)).toBe(true);
    // Only one entry was made: nothing else to undo.
    expect(store.canUndo.value).toBe(false);
  });

  it('redo applies it again, as it was', () => {
    const { store, actions } = setup();
    actions.importFormat(input, result);
    const imported = project(store);
    store.undo();
    expect(store.canRedo.value).toBe(true);
    expect(store.redo()).toBe(true);
    expect(sameButTouched(project(store), imported)).toBe(true);
    expect(store.canRedo.value).toBe(false);
  });

  it('is refused while the project is read-only, and changes nothing', () => {
    const { store, actions } = setup(formatProject(), { readOnly: true });
    const before = project(store);
    expect(actions.importFormat(input, result)).toEqual({
      ok: false,
      error: 'read-only',
    });
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('is refused while a proposal is in review', () => {
    const { store, actions } = setup();
    store.setReviewing('p1');
    expect(actions.importFormat(input, result)).toEqual({
      ok: false,
      error: 'reviewing',
    });
    expect(store.canUndo.value).toBe(false);
  });

  it('is refused with an "Only me" perspective open: what it creates lands in Main', () => {
    let open: string | null = 'V';
    const store = createProjectStore();
    const actions = createProjectActions(store, { perspective: () => open });
    const base = formatProject();
    store.load({
      ...base,
      perspectives: [viewOf(base, { root: 'C1', at: { x: 0, y: 0 } })],
    });
    expect(actions.importFormat(input, result)).toEqual({
      ok: false,
      error: 'principal-only',
    });
    open = null;
    expect(actions.importFormat(input, result).ok).toBe(true);
  });

  it('without a project there is nothing to import into', () => {
    const store = createProjectStore();
    const actions = createProjectActions(store);
    expect(actions.importFormat(input, result)).toEqual({
      ok: false,
      error: 'no-project',
    });
  });

  it('a result the rules refuse is all or nothing: the error at its operation, no undo entry', () => {
    const { store, actions } = setup();
    const before = project(store);
    const refused = actions.importFormat(input, {
      operations: [
        ...result.operations,
        { op: 'update_marking', marking: 'm2', locked: 'yes' },
      ],
    });
    expect(refused).toMatchObject({
      ok: false,
      error: 'format-apply',
      failure: { index: 4, code: 'plugin-output-invalid' },
    });
    expect(project(store)).toBe(before);
    expect(store.canUndo.value).toBe(false);
  });

  it('the page of the new containers is the open page', () => {
    const store = createProjectStore();
    const base = formatProject();
    const pageId = base.pages[0]!.id;
    const actions = createProjectActions(store, { page: () => pageId });
    store.load(base);
    const done = actions.importFormat(input, {
      operations: [
        {
          op: 'add_container',
          name: 'New',
          width: 200,
          height: 100,
          background: '#FFFFFF',
        },
      ],
    });
    expect(done.ok).toBe(true);
  });
});

describe('importSelection', () => {
  it('selects the created markings and arrows, not containers or annotations', () => {
    const { store, actions } = setup();
    const done = actions.importFormat(input, result);
    if (!done.ok) throw new Error('expected success');
    const selection = importSelection(project(store), done.value.created);
    expect(selection.map((s) => s.kind).sort()).toEqual(['arrow', 'marking']);
    expect(selection.every((s) => done.value.created.some((c) => c.id === s.id))).toBe(
      true,
    );
  });

  it('with only containers created, selects them', () => {
    const { store, actions } = setup();
    const done = actions.importFormat(input, { operations: [result.operations[0]!] });
    if (!done.ok) throw new Error('expected success');
    const selection = importSelection(project(store), done.value.created);
    expect(selection).toEqual([{ kind: 'image', id: done.value.created[0]!.id }]);
  });

  it('with only changes, the selection stays: nothing to select', () => {
    const { store, actions } = setup();
    const done = actions.importFormat(input, { operations: [result.operations[3]!] });
    if (!done.ok) throw new Error('expected success');
    expect(importSelection(project(store), done.value.created)).toEqual([]);
  });
});

// The plugin of the `format-library` fixture, run as it is (the app runs it in its sandbox): a line
// format whose `parse` creates the items it does not find by title and updates the ones it does.
describe('import and re-import with a real plugin', () => {
  const LIBRARY = join(process.cwd(), 'tests', 'fixtures', 'format-library');
  const plugin = readFileSync(join(LIBRARY, 'plugins', 'notes.js'), 'utf8');
  const parsed = parseSpec(
    JSON.parse(readFileSync(join(LIBRARY, 'format-library.spec.json'), 'utf8')),
  );
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const choice: FormatChoice = {
    ref: 'format-lib/notes',
    specId: 'format-lib',
    specName: 'Format library',
    formatId: 'notes',
    name: 'Notes',
    extension: 'txt',
    scope: 'project',
    plugin,
  };
  // Runs the plugin text in the test (the app's executor is the sandbox).
  const evalRunner = vi.fn(
    async (
      source: string,
      fn: string,
      args: readonly unknown[],
    ): Promise<FormatOutcome> => {
      const call = new Function(`${source}\nreturn ${fn};`)() as (
        ...a: unknown[]
      ) => unknown;
      return { ok: true, value: JSON.parse(JSON.stringify(call(...args))) };
    },
  );

  it('re-importing the same file creates nothing new, only changes', async () => {
    const base = applySpecialization(emptyProject(), parsed.spec, {
      newId: (() => {
        let n = 0;
        return () => `S${++n}`;
      })(),
    });
    const { store, actions } = setup(base);
    const deps = (): ImportInFormatDeps => ({
      flush: async () => ({ ok: true }),
      project: () => store.committed.value,
      run: evalRunner,
      catalog: () => EMPTY_CATALOG,
      measure: () => approximateMeasurer,
    });
    const text = 'Alpha\n  color=red\nBeta\n';
    const file = { name: 'n.txt', size: text.length, text: async () => text };

    const first = await previewImport(deps(), choice, file);
    if (!first.ok) throw new Error(`expected a preview: ${JSON.stringify(first.error)}`);
    expect(first.preview.created).toMatchObject({
      containers: 1,
      markings: 2,
      annotations: 2,
    });
    expect(actions.importFormat(first.preview.input, first.preview.result).ok).toBe(true);
    // The preview did not run the plugin again for Import: once for each preview.
    expect(evalRunner).toHaveBeenCalledTimes(1);
    const imported = project(store);

    const second = await previewImport(deps(), choice, file);
    if (!second.ok)
      throw new Error(`expected a preview: ${JSON.stringify(second.error)}`);
    expect(second.preview.created).toEqual({
      containers: 0,
      markings: 0,
      annotations: 0,
      arrows: 0,
    });
    expect(second.preview.updated.annotations).toBe(2);
    expect(project(store)).toBe(imported);
  });
});
