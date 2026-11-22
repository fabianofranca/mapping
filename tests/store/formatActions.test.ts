import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_CATALOG,
  approximateMeasurer,
  type FormatInput,
  type FormatOutcome,
  type FormatRunner,
} from '../../src/model';
import {
  exportFileName,
  exportInFormat,
  previewImport,
  type ExportInFormatDeps,
  type FormatChoice,
  type ImportFile,
  type ImportInFormatDeps,
} from '../../src/store/formatActions';
import { formatProject } from '../model/formatFixtures';

// Export in a format (stage #2035, AF3, decisions 7 and 11): the pending changes are saved before
// the plugin runs (and a save that fails stops it), the projection is the project's or the
// container's, and the result is a file named after the project or the container.

const openapi: FormatChoice = {
  ref: 'data-model/openapi',
  specId: 'data-model',
  specName: 'Data model',
  formatId: 'openapi',
  name: 'OpenAPI',
  extension: 'yaml',
  scope: 'project',
  plugin: 'function generate() { return "openapi"; }',
};
const csv: FormatChoice = {
  ...openapi,
  ref: 'data-model/csv',
  formatId: 'csv',
  name: 'Attributes CSV',
  extension: 'csv',
  scope: 'container',
  plugin: 'function generate() { return "csv"; }',
};

function setup(
  options: {
    flush?: ExportInFormatDeps['flush'];
    outcome?: FormatOutcome;
  } = {},
) {
  const order: string[] = [];
  const run = vi.fn<FormatRunner>(async () => {
    order.push('run');
    return options.outcome ?? { ok: true, value: 'the text' };
  });
  const flush = vi.fn(
    options.flush ??
      (async () => {
        order.push('flush');
        return { ok: true as const };
      }),
  );
  const project = vi.fn(() => {
    order.push('project');
    return formatProject();
  });
  return { deps: { flush, project, run }, run, flush, project, order };
}

const inputOf = (run: ReturnType<typeof setup>['run']): FormatInput =>
  run.mock.calls[0]?.[2][0] as FormatInput;

describe('exportInFormat', () => {
  it('saves first, then reads the project and runs generate with the plugin text', async () => {
    const { deps, run, order } = setup();
    const result = await exportInFormat(deps, openapi);
    expect(order).toEqual(['flush', 'project', 'run']);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe(openapi.plugin);
    expect(run.mock.calls[0]?.[1]).toBe('generate');
    expect(result.ok).toBe(true);
  });

  it('does not run when the save fails, and says so', async () => {
    const { deps, run, project } = setup({
      flush: async () => ({ ok: false, error: new Error('disk full') }),
    });
    const result = await exportInFormat(deps, openapi);
    expect(result).toEqual({ ok: false, error: { kind: 'save' } });
    expect(run).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
  });

  it('the file is <project name>.<extension> with the generated text', async () => {
    const { deps } = setup();
    const result = await exportInFormat(deps, openapi);
    if (!result.ok) throw new Error('expected a file');
    expect(result.file.name).toBe(`${formatProject().project.name}.yaml`);
    expect(await result.file.text()).toBe('the text');
    expect(result.file.type).toContain('text/plain');
  });

  it('the projection of a project-scope format has the whole project', async () => {
    const { deps, run } = setup();
    await exportInFormat(deps, openapi);
    const input = inputOf(run);
    expect(input.format.ref).toBe('data-model/openapi');
    expect(input.target).toBeNull();
    expect(input.containers.length).toBeGreaterThan(0);
  });

  it('scope container: the projection and the name are the container’s', async () => {
    const { deps, run } = setup();
    const result = await exportInFormat(deps, csv, 'C1');
    const input = inputOf(run);
    expect(input.target).not.toBeNull();
    expect(input.containers.map((c) => c.name)).toEqual(['Main']);
    if (!result.ok) throw new Error('expected a file');
    expect(result.file.name).toBe('Main.csv');
  });

  it('scope container, a container with no name: the file name falls back to its image file', async () => {
    const { deps } = setup();
    const base = formatProject();
    const project = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'C1' ? { ...c, name: null, file: 'images/plan1.png' } : c,
      ),
    };
    const result = await exportInFormat({ ...deps, project: () => project }, csv, 'C1');
    if (!result.ok) throw new Error('expected a file');
    expect(result.file.name).toBe('plan1.csv');
  });

  it('scope container without a container, or with one the project lacks: no run', async () => {
    const { deps, run } = setup();
    expect(await exportInFormat(deps, csv)).toEqual({
      ok: false,
      error: { kind: 'container' },
    });
    expect(await exportInFormat(deps, csv, 'nope')).toEqual({
      ok: false,
      error: { kind: 'container' },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('a failure of the plugin comes back as it is', async () => {
    const failure = {
      code: 'plugin-failed',
      message: 'Error: boom',
      line: 8,
      column: 9,
    } as const;
    const { deps } = setup({ outcome: { ok: false, failure } });
    expect(await exportInFormat(deps, openapi)).toEqual({
      ok: false,
      error: { kind: 'plugin', failure },
    });
  });

  it('a value that is not a string is plugin-output-invalid', async () => {
    const { deps } = setup({ outcome: { ok: true, value: { a: 1 } } });
    const result = await exportInFormat(deps, openapi);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'plugin', failure: { code: 'plugin-output-invalid' } },
    });
  });

  it('without a project open there is nothing to export', async () => {
    const { deps, run } = setup();
    const result = await exportInFormat({ ...deps, project: () => null }, openapi);
    expect(result).toEqual({ ok: false, error: { kind: 'project' } });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('exportFileName', () => {
  it('replaces what a path does not allow and falls back to "export"', () => {
    expect(exportFileName('a/b:c', 'csv')).toBe('a-b-c.csv');
    expect(exportFileName('  ', 'txt')).toBe('export.txt');
    expect(exportFileName('Main', 'yaml')).toBe('Main.yaml');
  });
});

// Import from a format, the preview (stage #2035, AF4, decisions 7 and 12): the file is checked before
// it is read (its extension and size), the pending changes are saved before the plugin runs, `parse`
// runs on the projection of the current project and the model's applier on a copy; what comes back is
// the counts by kind, the warnings or the error with its path. The project never changes here.

function file(text: string, name = 'in.yaml'): ImportFile {
  return { name, size: new TextEncoder().encode(text).length, text: async () => text };
}

function importSetup(
  value: unknown,
  options: { flush?: ImportInFormatDeps['flush']; outcome?: FormatOutcome } = {},
) {
  const order: string[] = [];
  const run = vi.fn<FormatRunner>(async () => {
    order.push('run');
    return options.outcome ?? { ok: true, value };
  });
  const flush = vi.fn(
    options.flush ??
      (async () => {
        order.push('flush');
        return { ok: true as const };
      }),
  );
  const project = formatProject();
  const deps: ImportInFormatDeps = {
    flush,
    project: () => project,
    run,
    catalog: () => EMPTY_CATALOG,
    measure: () => approximateMeasurer,
  };
  return { deps, run, flush, project, order };
}

const container = (extra: Record<string, unknown> = {}) => ({
  op: 'add_container',
  as: '$new',
  name: 'New',
  width: 200,
  height: 100,
  background: '#FFFFFF',
  ...extra,
});
const classMarking = {
  op: 'create_marking',
  container: '$new',
  rect: { x: 0, y: 0, width: 50, height: 20 },
  annotation: { type: 'data-model/class', values: { name: 'A' } },
};

describe('previewImport', () => {
  it('counts what is created and changed by kind, with the plugin’s warnings', async () => {
    const { deps } = importSetup({
      operations: [
        container(),
        classMarking,
        { op: 'create_arrow', from: 'm1', to: 'm4' },
        { op: 'update_annotation', annotation: 'a3', values: { name: 'Renamed' } },
        { op: 'update_marking', marking: 'm3', name: 'Again' },
      ],
      warnings: ['line 4 skipped'],
    });
    const preview = await previewImport(deps, openapi, file('x'));
    if (!preview.ok) throw new Error(`expected a preview: ${JSON.stringify(preview)}`);
    expect(preview.preview.created).toEqual({
      containers: 1,
      markings: 1,
      annotations: 1,
      arrows: 1,
    });
    expect(preview.preview.updated).toEqual({
      containers: 0,
      markings: 1,
      annotations: 1,
      arrows: 0,
    });
    expect(preview.preview.warnings).toEqual(['line 4 skipped']);
  });

  it('saves first, reads the file, runs parse with its text and the projection, and nothing changes', async () => {
    const { deps, run, order, project } = importSetup({ operations: [container()] });
    const before = JSON.stringify(project);
    const reading = vi.fn(async () => 'the file');
    const result = await previewImport({ ...deps, project: () => project }, openapi, {
      name: 'in.yaml',
      size: 8,
      text: reading,
    });
    expect(result.ok).toBe(true);
    expect(order).toEqual(['flush', 'run']);
    expect(run.mock.calls[0]?.[0]).toBe(openapi.plugin);
    expect(run.mock.calls[0]?.[1]).toBe('parse');
    expect(run.mock.calls[0]?.[2][0]).toBe('the file');
    expect((run.mock.calls[0]?.[2][1] as FormatInput).format.ref).toBe(
      'data-model/openapi',
    );
    expect(JSON.stringify(project)).toBe(before);
  });

  it('refuses another extension before reading anything, saving or running', async () => {
    const { deps, run, flush } = importSetup({ operations: [] });
    const reading = vi.fn(async () => 'x');
    const result = await previewImport(deps, openapi, {
      name: 'in.json',
      size: 1,
      text: reading,
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'extension', extension: 'yaml' },
    });
    expect(reading).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('accepts the extension in any case', async () => {
    const { deps } = importSetup({ operations: [container()] });
    const result = await previewImport(deps, openapi, file('x', 'IN.YAML'));
    expect(result.ok).toBe(true);
  });

  it('refuses a file above 4 MiB before reading it', async () => {
    const { deps, run } = importSetup({ operations: [] });
    const reading = vi.fn(async () => 'x');
    const result = await previewImport(deps, openapi, {
      name: 'in.yaml',
      size: 4 * 1024 * 1024 + 1,
      text: reading,
    });
    expect(result).toEqual({ ok: false, error: { kind: 'size' } });
    expect(reading).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('accepts a file of exactly 4 MiB', async () => {
    const { deps } = importSetup({ operations: [container()] });
    const result = await previewImport(deps, openapi, {
      name: 'in.yaml',
      size: 4 * 1024 * 1024,
      text: async () => 'x',
    });
    expect(result.ok).toBe(true);
  });

  it('does not run when the save fails, and says so', async () => {
    const { deps, run } = importSetup(
      { operations: [] },
      { flush: async () => ({ ok: false, error: new Error('disk full') }) },
    );
    expect(await previewImport(deps, openapi, file('x'))).toEqual({
      ok: false,
      error: { kind: 'save' },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('a file that cannot be read is a read error and nothing runs', async () => {
    const { deps, run } = importSetup({ operations: [] });
    const result = await previewImport(deps, openapi, {
      name: 'in.yaml',
      size: 1,
      text: async () => {
        throw new Error('gone');
      },
    });
    expect(result).toEqual({ ok: false, error: { kind: 'read' } });
    expect(run).not.toHaveBeenCalled();
  });

  it('a failure of the plugin comes back as it is', async () => {
    const failure = { code: 'plugin-timeout', message: 'too slow' } as const;
    const { deps } = importSetup(null, { outcome: { ok: false, failure } });
    expect(await previewImport(deps, openapi, file('x'))).toEqual({
      ok: false,
      error: { kind: 'plugin', failure },
    });
  });

  it('a result the contract refuses shows the error with its path, and there is no preview', async () => {
    const { deps } = importSetup({
      operations: [{ op: 'delete_marking', marking: 'm1' }],
    });
    const result = await previewImport(deps, openapi, file('x'));
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'result',
        code: 'plugin-output-invalid',
        path: 'operations[0].op',
      },
    });
  });

  it('a value that is not a result at all is refused as plugin-output-invalid', async () => {
    const { deps } = importSetup('text');
    expect(await previewImport(deps, openapi, file('x'))).toMatchObject({
      ok: false,
      error: { kind: 'result', code: 'plugin-output-invalid', path: 'result' },
    });
  });

  it('more operations than the limit is plugin-limit', async () => {
    const operations = Array.from({ length: 5001 }, () => container());
    const { deps } = importSetup({ operations });
    expect(await previewImport(deps, openapi, file('x'))).toMatchObject({
      ok: false,
      error: { kind: 'result', code: 'plugin-limit' },
    });
  });

  it('an operation the model’s rules refuse shows the error at its operation', async () => {
    const { deps } = importSetup({
      operations: [
        container(),
        { ...classMarking, rect: { x: 0, y: 0, width: 2, height: 2 } },
      ],
    });
    const result = await previewImport(deps, openapi, file('x'));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'apply', path: 'operations[1]', code: 'rect-too-small' },
    });
  });

  it('a value of the wrong type is refused at its path, and no preview is built', async () => {
    const { deps } = importSetup({
      operations: [{ op: 'update_marking', marking: 'm3', locked: 'yes' }],
    });
    const result = await previewImport(deps, openapi, file('x'));
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'apply',
        path: 'operations[0].locked',
        code: 'plugin-output-invalid',
      },
    });
  });

  it('keeps the checked result and the projection for the Import action', async () => {
    const operations = [container()];
    const { deps } = importSetup({ operations });
    const result = await previewImport(deps, openapi, file('x'));
    if (!result.ok) throw new Error('expected a preview');
    expect(result.preview.result.operations).toEqual(operations);
    expect(result.preview.input.project.name).toBe(formatProject().project.name);
  });

  it('scope container: the projection is the chosen container’s, or none for "None"', async () => {
    const some = importSetup({ operations: [container()] });
    await previewImport(some.deps, csv, file('x', 'in.csv'), 'C1');
    expect((some.run.mock.calls[0]?.[2][1] as FormatInput).target).not.toBeNull();
    const none = importSetup({ operations: [container()] });
    await previewImport(none.deps, csv, file('x', 'in.csv'), null);
    expect((none.run.mock.calls[0]?.[2][1] as FormatInput).target).toBeNull();
  });

  it('scope container with a container the project lacks: no run', async () => {
    const { deps, run } = importSetup({ operations: [] });
    const result = await previewImport(deps, csv, file('x', 'in.csv'), 'nope');
    expect(result).toEqual({ ok: false, error: { kind: 'container' } });
    expect(run).not.toHaveBeenCalled();
  });

  it('scope project ignores a container', async () => {
    const { deps, run } = importSetup({ operations: [container()] });
    await previewImport(deps, openapi, file('x'), 'C1');
    expect((run.mock.calls[0]?.[2][1] as FormatInput).target).toBeNull();
  });

  it('without a project open there is nothing to import into', async () => {
    const { deps, run } = importSetup({ operations: [] });
    const result = await previewImport(
      { ...deps, project: () => null },
      openapi,
      file('x'),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'project' } });
    expect(run).not.toHaveBeenCalled();
  });
});
