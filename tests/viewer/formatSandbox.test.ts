// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SANDBOX_SRCDOC } from '../../src/app/formatSandbox';
import type { SandboxFrame } from '../../src/app/formatRunner';
import { createViewerSandbox } from '../../viewer/formatSandbox';
import { formatScreens } from '../../src/model/formatScreen';
import { loadLibrary, type TextFile } from '../../src/model/components/library';
import { approximateMeasurer } from '../../src/model';

// The viewer's frame (stage #2059, VF2, decision 7) over a fake `trustedTypes` and a fake iframe: the
// `mapping-viewer` policy, the two refusals that become `sandbox-unavailable`, one frame for the page and
// `dispose`. The real iframe, its CSP and the host's CSPs run in `tests/e2e/viewerFormats.spec.ts`.

interface FakeIframe {
  srcdoc: unknown;
}

function fixture(
  options: {
    trustedTypes?: unknown;
    refuseSrcdoc?: boolean;
    autoReady?: boolean;
  } = {},
) {
  const frames: { window: object; removed: boolean; posted: unknown[] }[] = [];
  const assigned: unknown[] = [];
  let handler: ((event: { source: unknown; data: unknown }) => void) | null = null;
  const sandbox = createViewerSandbox({
    trustedTypes: options.trustedTypes,
    frame: (setSrcdoc) => {
      const iframe = {} as FakeIframe;
      Object.defineProperty(iframe, 'srcdoc', {
        set(value: unknown) {
          if (options.refuseSrcdoc)
            throw new TypeError('This document requires TrustedHTML');
          assigned.push(value);
        },
      });
      setSrcdoc(iframe as unknown as HTMLIFrameElement);
      const record = { window: {}, removed: false, posted: [] as unknown[] };
      frames.push(record);
      if (options.autoReady !== false)
        queueMicrotask(() => handler?.({ source: record.window, data: { ready: true } }));
      const frame: SandboxFrame = {
        window: record.window,
        post: (message) => {
          record.posted.push(message);
          const { id } = message as { id: number };
          queueMicrotask(() =>
            handler?.({
              source: record.window,
              data: { id, status: 'ok', output: '"text"' },
            }),
          );
        },
        remove: () => {
          record.removed = true;
        },
      };
      return frame;
    },
    listen: (next) => {
      handler = next;
      return () => {
        handler = null;
      };
    },
  });
  return { sandbox, frames, assigned };
}

/** A `trustedTypes` that allows only the names in `allowed` and records what its policy was asked. */
function trustedTypesOf(allowed: readonly string[]) {
  const created: string[] = [];
  const asked: string[] = [];
  const factory = {
    createPolicy: (
      name: string,
      rules: { createHTML: (input: string) => string },
    ): { createHTML: (input: string) => unknown } => {
      if (!allowed.includes(name)) throw new TypeError(`Policy "${name}" disallowed.`);
      created.push(name);
      return {
        createHTML: (input) => {
          asked.push(input);
          return { trusted: rules.createHTML(input) };
        },
      };
    },
  };
  return { factory, created, asked };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the viewer sandbox with Trusted Types', () => {
  it('sets the srcdoc through a mapping-viewer policy that accepts only the sandbox document', async () => {
    const tt = trustedTypesOf(['mapping-viewer']);
    const { sandbox, assigned } = fixture({ trustedTypes: tt.factory });
    expect(await sandbox('x', 'parse', ['text', {}])).toEqual({
      ok: true,
      value: 'text',
    });
    expect(tt.created).toEqual(['mapping-viewer']);
    expect(tt.asked).toEqual([SANDBOX_SRCDOC]);
    expect(assigned).toEqual([{ trusted: SANDBOX_SRCDOC }]);
  });

  it('refuses any other text in its policy', async () => {
    let rules: { createHTML: (input: string) => string } | null = null;
    await createViewerSandbox({
      trustedTypes: {
        createPolicy: (
          _name: string,
          given: { createHTML: (input: string) => string },
        ) => {
          rules = given;
          return { createHTML: (input: string) => given.createHTML(input) };
        },
      },
      frame: (setSrcdoc) => {
        setSrcdoc({} as HTMLIFrameElement);
        throw new Error('stop');
      },
      listen: () => () => {},
    })('x', 'parse', ['', {}]);
    expect(rules).not.toBeNull();
    const given = rules as unknown as { createHTML: (input: string) => string };
    expect(given.createHTML(SANDBOX_SRCDOC)).toBe(SANDBOX_SRCDOC);
    expect(() => given.createHTML('<b>x</b>')).toThrow(TypeError);
    expect(() => given.createHTML(`${SANDBOX_SRCDOC} `)).toThrow(TypeError);
  });

  it('a host that does not allow the policy name is sandbox-unavailable, with no console output', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tt = trustedTypesOf(['something-else']);
    const { sandbox, frames } = fixture({ trustedTypes: tt.factory });
    expect(await sandbox('x', 'parse', ['text', {}])).toMatchObject({
      ok: false,
      failure: { code: 'plugin-failed', phase: 'sandbox' },
    });
    expect(frames).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a refused srcdoc assignment is sandbox-unavailable too', async () => {
    const tt = trustedTypesOf(['mapping-viewer']);
    const { sandbox } = fixture({ trustedTypes: tt.factory, refuseSrcdoc: true });
    expect(await sandbox('x', 'parse', ['text', {}])).toMatchObject({
      ok: false,
      failure: { phase: 'sandbox' },
    });
  });

  it('creates the policy once: a second frame (after dispose) reuses it', async () => {
    const tt = trustedTypesOf(['mapping-viewer']);
    const { sandbox, frames } = fixture({ trustedTypes: tt.factory });
    await sandbox('x', 'parse', ['a', {}]);
    sandbox.dispose();
    await sandbox('x', 'parse', ['b', {}]);
    expect(frames).toHaveLength(2);
    expect(tt.created).toEqual(['mapping-viewer']);
  });
});

describe('the viewer sandbox without Trusted Types', () => {
  it('takes the srcdoc as the plain string', async () => {
    const { sandbox, assigned } = fixture();
    await sandbox('x', 'parse', ['text', {}]);
    expect(assigned).toEqual([SANDBOX_SRCDOC]);
  });
});

describe('one frame for the page', () => {
  it('serves two calls with the same frame and keeps it', async () => {
    const { sandbox, frames } = fixture();
    await sandbox('x', 'parse', ['a', {}]);
    await sandbox('x', 'parse', ['b', {}]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.posted).toHaveLength(2);
    expect(frames[0]!.removed).toBe(false);
  });

  it('disposeFormatSandbox removes the frame, and the next call makes another', async () => {
    const { sandbox, frames } = fixture();
    await sandbox('x', 'parse', ['a', {}]);
    sandbox.dispose();
    expect(frames[0]!.removed).toBe(true);
    await sandbox('x', 'parse', ['b', {}]);
    expect(frames).toHaveLength(2);
    expect(frames[1]!.removed).toBe(false);
  });

  it('dispose with no frame does nothing', () => {
    const { sandbox } = fixture();
    expect(() => sandbox.dispose()).not.toThrow();
  });
});

const ROOT = 'examples/libraries/sdui-backend';

function filesOf(dir: string): TextFile[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesOf(path);
    if (!/\.(json|js)$/.test(name)) return [];
    return [{ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }];
  });
}

describe('the failure reaches formatScreens as sandbox-unavailable', () => {
  it('maps the phase sandbox of the runner to the code', async () => {
    const tt = trustedTypesOf([]);
    const { sandbox } = fixture({ trustedTypes: tt.factory });
    const library = loadLibrary(filesOf(ROOT));
    const text = readFileSync(join(ROOT, 'examples/home.sdui.json'), 'utf8');
    const result = await formatScreens(library, text, {
      format: `${library.specId}/sdui`,
      measure: approximateMeasurer,
      run: sandbox,
    });
    expect(result.error?.code).toBe('sandbox-unavailable');
    expect(result.screens).toEqual([]);
  });
});
