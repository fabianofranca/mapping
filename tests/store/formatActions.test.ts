import { describe, expect, it, vi } from 'vitest';
import type { FormatInput, FormatOutcome, FormatRunner } from '../../src/model';
import {
  exportFileName,
  exportInFormat,
  type ExportInFormatDeps,
  type FormatChoice,
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
