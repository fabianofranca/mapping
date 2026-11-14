// @vitest-environment node
// Phase TR1 (stage #359): the cloud helpers in `scripts/testing/` (decision 2) exist, `cloud.mjs`
// imports without side effects and exports the right names, the guide points to them
// (decision 4) and the pure part of `cloud.mjs` (`mark`) has a unit test.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HANDLE_HIT_RADIUS } from '../../src/canvas/input/intents';
import { handleHitRadius } from '../../src/canvas/markingGeometry';

const read = (file: string): string => readFileSync(file, 'utf8');

/** Code lines, without the ones that are only a comment (`#`, `//` or a docstring's `"""`/`'''`). */
function codeLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(#|\/\/|"""|''')/.test(line))
    .join('\n');
}

const CLOUD_UP = 'scripts/testing/cloud-up.sh';
const CLOUD_MJS = 'scripts/testing/cloud.mjs';
const ATSPI_ALLOW = 'scripts/testing/atspi-allow.py';
const HELPERS = [CLOUD_UP, CLOUD_MJS, ATSPI_ALLOW];

const EXPECTED_EXPORTS = [
  'allowPermission',
  'cancelDialog',
  'clickNoWait',
  'connect',
  'connectGuide',
  'containerScreenPoint',
  'defaultApoioDir',
  'diffJson',
  'formatState',
  'loadEnv',
  'makeCadastroPng',
  'mark',
  'OPEN_DIALOG_TITLES',
  'openFile',
  'paletteDrag',
  'parseEnvFile',
  'pickAppPage',
  'pickAutocompletePopup',
  'ponto',
  'openButtonPoints',
  'saveFile',
  'screenshot',
  'selectFolder',
  'state',
  'temposFromDir',
  'temposFromLog',
  'formatTempos',
  'formatHelp',
  'HELP',
  'runStep',
  'runViaServer',
  'startRunServer',
  'waitForWindow',
  'windowShortcut',
  'settle',
  'openWindow',
  'closeWindow',
  'TOOL_WINDOW_IDS',
  'drag',
  'nearHandle',
  'onCanvas',
  'parseContainerBoxes',
  'parseArrowHandles',
  'viewCenter',
  'arrowHandlesOf',
  'setViewport',
  'find',
  'formatCandidates',
  'locatorTextFromError',
].sort();

describe('scripts/testing/: cloud helpers (TR1)', () => {
  it('the three helpers exist', () => {
    for (const file of HELPERS) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('cloud.mjs imports without side effects and exports the names of decision 2', async () => {
    const mod: Record<string, unknown> = await import('../../scripts/testing/cloud.mjs');
    expect(Object.keys(mod).sort()).toEqual(EXPECTED_EXPORTS);
  });

  it('no helper registers a filechooser listener nor uses setInputFiles (code, outside comments)', () => {
    for (const file of HELPERS) {
      const code = codeLines(read(file));
      expect(code, file).not.toMatch(/filechooser/i);
      expect(code, file).not.toContain('setInputFiles');
    }
  });

  it('cloud-up.sh never runs pkill -f chrome as a command (closes through CDP, recipe 3)', () => {
    expect(codeLines(read(CLOUD_UP))).not.toContain('pkill -f chrome');
    expect(read(CLOUD_UP)).toContain('Browser.close');
  });

  it('cloud-up.sh: no background subshell holds the pipe of its caller (TS1, decision 5)', () => {
    const lines = codeLines(read(CLOUD_UP)).split('\n');
    // `(cd dist && … &)`: the redirection inside only applies to the command, and the subshell
    // that waits for it keeps the script's stdout (the `| tail` never closes). The redirection
    // goes on the whole group.
    const server = lines.find((line) => line.includes('http.server'));
    expect(server).toBeDefined();
    expect(server).toMatch(/\)\s*<\/dev\/null\s*>"\$S\/http\.log"\s*2>&1\s*&/);
    for (const line of lines.filter(
      (l) =>
        /\b(Xvfb|openbox|at-spi-bus-launcher|CHROME_CMD)\b/.test(l) && /&\s*$/.test(l),
    )) {
      expect(line, line).toContain('setsid');
      expect(line, line).toContain('</dev/null');
    }
  });

  describe('containerScreenPoint (ponto helper, stage #841 RB2)', () => {
    const mapping = {
      containers: [
        { id: 'c1', name: 'Sign-up', placement: { x: 100, y: 50, scale: 2 } },
        { id: 'c2', name: 'Other', placement: { x: 0, y: 0, scale: 1 } },
      ],
      markings: [
        { id: 'm1', name: 'Button', containerId: 'c1', rect: { x: 10, y: 20 } },
        { id: 'm2', name: 'Loose', containerId: null, rect: { x: 5, y: 6 } },
      ],
      perspectives: [{ name: 'Dev mobile', items: [{ root: 'c1', x: 400, y: 300 }] }],
    };
    const host = { x: 10, y: 20 };

    it('converts the container point into a screen point and follows the zoom', async () => {
      const mod = await import('../../scripts/testing/cloud.mjs');
      // canvas = (100 + 5*2, 50 + 7*2) = (110, 64)
      expect(
        mod.containerScreenPoint({
          mapping,
          container: 'sign-up',
          x: 5,
          y: 7,
          viewport: '30 40 1',
          host,
        }),
      ).toEqual({ x: 10 + 110 + 30, y: 20 + 64 + 40 });
      expect(
        mod.containerScreenPoint({
          mapping,
          container: 'c1',
          x: 5,
          y: 7,
          viewport: '-20 8.5 2.5',
          host,
        }),
      ).toEqual({ x: 10 + 110 * 2.5 - 20, y: 20 + 64 * 2.5 + 8.5 });
    });

    it('a container with a null name (picker image) does not break the lookup by id or name', async () => {
      const mod = await import('../../scripts/testing/cloud.mjs');
      const withNull = {
        ...mapping,
        containers: [
          { id: 'c3', name: null, placement: { x: 0, y: 0, scale: 1 } },
          ...mapping.containers,
        ],
        markings: [{ id: 'm3', name: null, containerId: 'c1', rect: { x: 0, y: 0 } }],
      };
      const point = (container: string, marking?: boolean) =>
        mod.containerScreenPoint({
          mapping: withNull as never,
          container,
          x: 1,
          y: 1,
          viewport: '0 0 1',
          host,
          ...(marking ? { marking: true } : {}),
        });
      expect(point('c3')).toEqual({ x: 11, y: 21 });
      expect(point('sign-up')).toEqual({ x: 10 + 102, y: 20 + 52 });
      expect(point('m3', true)).toEqual({ x: 10 + 102, y: 20 + 52 });
    });

    it('with marcacao, adds the marking corner and the placement of its container', async () => {
      const mod = await import('../../scripts/testing/cloud.mjs');
      // canvas = (100 + (10+3)*2, 50 + (20+4)*2) = (126, 98)
      expect(
        mod.containerScreenPoint({
          mapping,
          container: 'Button',
          x: 3,
          y: 4,
          viewport: '0 0 2',
          host,
          marking: true,
        }),
      ).toEqual({ x: 10 + 252, y: 20 + 196 });
      expect(
        mod.containerScreenPoint({
          mapping,
          container: 'm2',
          x: 1,
          y: 1,
          viewport: '0 0 1',
          host: { x: 0, y: 0 },
          marking: true,
        }),
      ).toEqual({ x: 6, y: 7 });
    });

    it('uses the perspective position and refuses a missing container or an invalid view', async () => {
      const mod = await import('../../scripts/testing/cloud.mjs');
      expect(
        mod.containerScreenPoint({
          mapping,
          container: 'Sign-up',
          x: 0,
          y: 0,
          viewport: '0 0 1',
          host: { x: 0, y: 0 },
          perspective: 'dev mobile',
        }),
      ).toEqual({ x: 400, y: 300 });
      const bad = (over: object) => () =>
        mod.containerScreenPoint({
          mapping,
          container: 'Sign-up',
          x: 0,
          y: 0,
          viewport: '0 0 1',
          host,
          ...over,
        });
      expect(bad({ container: 'Nothing' })).toThrow('container not found');
      expect(bad({ viewport: 'a b c' })).toThrow('invalid data-viewport');
      expect(bad({ perspective: 'None' })).toThrow('perspective not found');
    });
  });

  describe('mark (pure part of cloud.mjs)', () => {
    let apoioDir: string;

    afterEach(() => {
      if (apoioDir) rmSync(apoioDir, { recursive: true, force: true });
    });

    it('appends "<script> <phase> <UTC ISO 8601 time>" to tempos.log', async () => {
      apoioDir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-mark-'));
      const { mark } = await import('../../scripts/testing/cloud.mjs');
      mark(apoioDir, 'ambiente', 'start');
      mark(apoioDir, 'ambiente', 'end');
      const lines = read(path.join(apoioDir, 'tempos.log')).trim().split('\n');
      expect(lines).toHaveLength(2);
      const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      const [script1, phase1, time1] = lines[0]!.split(' ');
      expect(script1).toBe('ambiente');
      expect(phase1).toBe('start');
      expect(time1).toMatch(iso);
      const [, phase2, time2] = lines[1]!.split(' ');
      expect(phase2).toBe('end');
      expect(time2).toMatch(iso);
      // Chronological order: start before end.
      expect(Date.parse(time1!)).toBeLessThanOrEqual(Date.parse(time2!));
    });

    it('tempos: duration from the first start to the last end, repeated-mark warning and "time not measured"', async () => {
      const { temposFromLog, formatTempos } =
        await import('../../scripts/testing/cloud.mjs');
      const log = [
        'ambiente start 2026-11-04T10:00:00.000Z',
        'ambiente end 2026-11-04T10:02:15.000Z',
        'R0 start 2026-11-04T10:03:00.000Z',
        'R0 end 2026-11-04T10:12:42.000Z',
        // R1 with repeated marks: the first start and the last end count.
        'R1 start 2026-11-04T10:13:00.000Z',
        'R1 start 2026-11-04T10:14:00.000Z',
        'R1 end 2026-11-04T10:20:00.000Z',
        'R1 end 2026-11-04T10:26:30.000Z',
        // secao6 without the end and visual without the start: time not measured.
        'secao6 start 2026-11-04T10:30:00.000Z',
        'visual end 2026-11-04T10:40:00.000Z',
      ].join('\n');
      const r = temposFromLog(log);
      const by = (nome: string): number | null | undefined =>
        r.itens.find((i) => i.nome === nome)?.segundos;
      expect(by('ambiente')).toBe(135);
      expect(by('R0')).toBe(9 * 60 + 42);
      expect(by('R1')).toBe(13 * 60 + 30);
      expect(by('secao6')).toBeNull();
      expect(by('visual')).toBeNull();
      expect(r.totalSegundos).toBe(135 + 582 + 810);
      expect(r.avisos.join('\n')).toMatch(/R1.*start.*2/);
      expect(r.avisos.join('\n')).toMatch(/R1.*end.*2/);
      const out = formatTempos(r);
      expect(out).toMatch(/R1\s+13min30s/);
      expect(out).toMatch(/secao6\s+time not measured/);
      expect(out).toMatch(/visual\s+time not measured/);
      expect(out).toMatch(/total\s+25min27s/);
      expect(out).toMatch(/warning.*R1/i);
    });

    it('tempos: alternating spans (start/end/start/end) add the spans up, without a warning, and count the runs inside (stage #1712, decision 6)', async () => {
      const { temposFromLog, formatTempos } =
        await import('../../scripts/testing/cloud.mjs');
      const log = [
        'ambiente start 2026-11-04T10:00:00.000Z',
        'ambiente end 2026-11-04T10:02:00.000Z',
        'ambiente start 2026-11-04T10:10:00.000Z',
        'ambiente end 2026-11-04T10:11:00.000Z',
        // two starts and two ends in a row: the earlier rule applies, with the warning.
        'R1 start 2026-11-04T10:13:00.000Z',
        'R1 start 2026-11-04T10:14:00.000Z',
        'R1 end 2026-11-04T10:20:00.000Z',
        'R1 end 2026-11-04T10:26:30.000Z',
      ].join('\n');
      const runs = [
        '2026-11-04T10:01:00.000Z run=1 codigo=0 checks=2 falhas=0',
        // between the spans: does not count.
        '2026-11-04T10:05:00.000Z run=2 codigo=0 checks=7 falhas=0',
        '2026-11-04T10:10:30.000Z run=3 codigo=0 checks=3 falhas=0',
      ].join('\n');
      const r = temposFromLog(log, runs);
      const amb = r.itens.find((i) => i.nome === 'ambiente');
      expect(amb?.segundos).toBe(120 + 60);
      expect(amb?.runs).toBe(2);
      expect(amb?.checks).toBe(5);
      const avisos = r.avisos.join('\n');
      expect(avisos).not.toMatch(/ambiente/);
      expect(avisos).toMatch(/R1.*start.*2/);
      expect(r.itens.find((i) => i.nome === 'R1')?.segundos).toBe(13 * 60 + 30);
      expect(formatTempos(r)).toMatch(/ambiente\s+3min00s/);
    });

    it('tempos: without the file, the CLI says "time not measured"', async () => {
      apoioDir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-tempos-'));
      const { temposFromDir, formatTempos } =
        await import('../../scripts/testing/cloud.mjs');
      expect(formatTempos(temposFromDir(apoioDir))).toMatch(/time not measured/);
    });

    it('rejects a phase that is not start/end', async () => {
      apoioDir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-mark-'));
      const { mark } = await import('../../scripts/testing/cloud.mjs');
      // A value outside "start" | "end" is only possible at runtime (e.g. a CLI argument); the
      // `as unknown` imitates that without using `any`.
      const phase = 'middle' as unknown as 'start' | 'end';
      expect(() => mark(apoioDir, 'ambiente', phase)).toThrow();
      expect(existsSync(path.join(apoioDir, 'tempos.log'))).toBe(false);
    });
  });
});

describe('waitForWindow (stage #405, decision 2)', () => {
  it('returns the id when the window shows up on the 3rd attempt', async () => {
    const { waitForWindow } = await import('../../scripts/testing/cloud.mjs');
    let calls = 0;
    const id = await waitForWindow(['Abrir arquivos'], {
      timeoutMs: 2000,
      stepMs: 1,
      find: () => {
        calls += 1;
        return calls >= 3 ? '4242' : null;
      },
    });
    expect(id).toBe('4242');
    expect(calls).toBe(3);
  });

  it('throws after the deadline, with the expected titles and the active window title', async () => {
    const { waitForWindow } = await import('../../scripts/testing/cloud.mjs');
    const error = await waitForWindow(['Abrir arquivos', 'Abrir arquivo'], {
      timeoutMs: 30,
      stepMs: 5,
      find: () => null,
      activeTitle: () => 'Mapping: Google Chrome for Testing',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('Abrir arquivos');
    expect(message).toContain('Abrir arquivo');
    expect(message).toContain('Mapping: Google Chrome for Testing');
    expect(message).not.toContain("the window's active tab is not the app's");
  });

  it('with another tab active, the message carries the two-tabs sentence', async () => {
    const { waitForWindow } = await import('../../scripts/testing/cloud.mjs');
    const error = await waitForWindow(['Abrir arquivos'], {
      timeoutMs: 30,
      stepMs: 5,
      find: () => null,
      activeTitle: () => 'Guide of Mapping: Google Chrome for Testing',
    }).catch((e: unknown) => e);
    expect((error as Error).message).toContain(
      "the window's active tab is not the app's; the native picker only opens with it focused in the system (close the other tab)",
    );
  });
});

interface FakeLocator {
  count: () => Promise<number>;
  click: (options?: unknown) => Promise<void>;
  getByRole?: (role: string, options?: unknown) => FakeLocator;
}

function fakePage(counts: { page: number; scope: number }) {
  const clicks: { where: string; options: unknown }[] = [];
  const roleCalls: { where: string; role: string; options: unknown }[] = [];
  const make = (where: 'page' | 'scope'): FakeLocator => ({
    count: async () => counts[where],
    click: async (options) => {
      clicks.push({ where, options });
    },
  });
  const scopeLocator: FakeLocator = {
    ...make('scope'),
    getByRole: (role, options) => {
      roleCalls.push({ where: 'scope', role, options });
      return make('scope');
    },
  };
  const page = {
    getByRole: (role: string, options: unknown) => {
      roleCalls.push({ where: 'page', role, options });
      return make('page');
    },
    locator: (selector: string) => {
      roleCalls.push({ where: `locator:${selector}`, role: '', options: undefined });
      return scopeLocator;
    },
  };
  return { page, clicks, roleCalls, scopeLocator };
}

describe('clickNoWait (stage #405, decision 3)', () => {
  it('with 2 candidates throws with the name, the count and the hint, without clicking', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const fake = fakePage({ page: 2, scope: 1 });
    const error = await clickNoWait(fake.page, 'Add images').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('Add images');
    expect(message).toContain('2');
    expect(message).toContain('pass `scope` (a container) or `exact: true`');
    expect(fake.clicks).toEqual([]);
  });

  it('with 0 candidates it also throws, without clicking', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const fake = fakePage({ page: 0, scope: 0 });
    await expect(clickNoWait(fake.page, 'Nothing')).rejects.toThrow(/0/);
    expect(fake.clicks).toEqual([]);
  });

  it('with 1 candidate clicks with noWaitAfter', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const fake = fakePage({ page: 1, scope: 1 });
    await clickNoWait(fake.page, 'Open folder');
    expect(fake.clicks).toEqual([{ where: 'page', options: { noWaitAfter: true } }]);
  });

  it('exact is passed on to getByRole', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const fake = fakePage({ page: 1, scope: 1 });
    await clickNoWait(fake.page, 'Local', { exact: true });
    expect(fake.roleCalls[0]).toEqual({
      where: 'page',
      role: 'button',
      options: { name: 'Local', exact: true },
    });
  });

  it('scope (CSS selector or Locator) restricts the search to the container', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const css = fakePage({ page: 2, scope: 1 });
    await clickNoWait(css.page, 'Add images', { scope: '.canvas-empty' });
    expect(css.clicks).toEqual([{ where: 'scope', options: { noWaitAfter: true } }]);
    expect(css.roleCalls.map((c) => c.where)).toEqual(['locator:.canvas-empty', 'scope']);

    const loc = fakePage({ page: 2, scope: 1 });
    await clickNoWait(loc.page, 'Add images', { scope: loc.scopeLocator });
    expect(loc.clicks).toEqual([{ where: 'scope', options: { noWaitAfter: true } }]);
    expect(loc.roleCalls.map((c) => c.where)).toEqual(['scope']);
  });
});

describe('docs/TESTING.md and docs/TESTING-NUVEM.md point to the helpers (decision 4)', () => {
  const guide = read('docs/TESTING.md');
  const cloud = read('docs/TESTING-NUVEM.md');
  const appendixA = guide.slice(
    guide.indexOf('## Appendix A'),
    guide.indexOf('## Appendix B'),
  );

  it('appendix A cites cloud-up.sh and cloud.mjs and each recipe 1 to 8 says what the helper does', () => {
    expect(appendixA).toContain('cloud-up.sh');
    expect(appendixA).toContain('cloud.mjs');
    // Index of the first mention of each recipe (1 to 9, the last as the limit of the 8th's block);
    // a recipe's block runs to the next one, covering the "continuation" lines that some have.
    const starts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      appendixA.indexOf(`Recipe ${n} (cloud)`),
    );
    for (const [i, start] of starts.slice(0, 8).entries()) {
      const marker = `Recipe ${i + 1} (cloud)`;
      expect(start, marker).toBeGreaterThanOrEqual(0);
      const block = appendixA.slice(start, starts[i + 1]);
      expect(block, marker).toMatch(/the helper does this: `/i);
    }
  });

  it('the "First 10 minutes" call cloud-up.sh (items 4 to 7)', () => {
    const start = cloud.indexOf('## First 10 minutes');
    const end = cloud.indexOf('## ', start + 1);
    const section = cloud.slice(start, end);
    expect(section).toContain('cloud-up.sh');
  });

  it('"How to act" says to use the helpers and a script of your own only for what is missing', () => {
    const start = cloud.indexOf('## How to act');
    const end = cloud.indexOf('## ', start + 1);
    const section = cloud.slice(start, end);
    expect(section).toContain('scripts/testing/cloud');
    expect(section).toContain('What got in the way');
  });
});

describe('scripts/testing/ listed in the repository', () => {
  it('the helpers, the MCP stdio client and the round guide exist in the folder', () => {
    const files = readdirSync('scripts/testing').sort();
    expect(files).toEqual(
      [
        'assinatura.mjs',
        'atspi-allow.py',
        'cloud-up.sh',
        'cloud.d.mts',
        'cloud.mjs',
        'fiel.mjs',
        'fx.mjs',
        'herdada.mjs',
        'justificado.mjs',
        'large-project.mjs',
        'let.mjs',
        'mcp-stdio-client.mjs',
        'mock-github-release.mjs',
        'r85-prep.sh',
        'rot.mjs',
        'round-guide.d.mts',
        'round-guide.mjs',
        'sombras.mjs',
        'tokens.mjs',
      ].sort(),
    );
  });
});

describe('environment and tab of the helpers (stage #421, TS1, decisions 3 and 4)', () => {
  const ENV_LINE =
    'export DISPLAY=:99 DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/dbus-abc,guid=0123\n';

  it('parseEnvFile reads the line that cloud-up.sh writes', async () => {
    const { parseEnvFile } = await import('../../scripts/testing/cloud.mjs');
    expect(parseEnvFile(ENV_LINE)).toEqual({
      DISPLAY: ':99',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/dbus-abc,guid=0123',
    });
  });

  it('loadEnv fills in only what is missing and does not overwrite a variable already set', async () => {
    const { loadEnv } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-env-'));
    try {
      writeFileSync(path.join(dir, 'env.sh'), ENV_LINE);
      const env: Record<string, string | undefined> = { DISPLAY: ':7' };
      loadEnv(dir, env);
      expect(env.DISPLAY).toBe(':7');
      expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/tmp/dbus-abc,guid=0123');
      expect(env.APOIO).toBe(dir);
      const other: Record<string, string | undefined> = { APOIO: '/x' };
      loadEnv(dir, other);
      expect(other.APOIO).toBe('/x');
      expect(other.DISPLAY).toBe(':99');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadEnv without the file and without DISPLAY throws the cloud-up.sh hint', async () => {
    const { loadEnv } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-env-'));
    try {
      expect(() => loadEnv(dir, {})).toThrow(
        'apoio/env.sh does not exist: run cloud-up.sh',
      );
      expect(() => loadEnv(dir, { DISPLAY: ':1' })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const app = { url: 'http://localhost:8080/', title: 'Mapping' };
  const guide = { url: 'http://localhost:8080/guide/index.html', title: 'Guide' };

  it('pickAppPage with the app and the guide open returns the app', async () => {
    const { pickAppPage } = await import('../../scripts/testing/cloud.mjs');
    expect(pickAppPage([guide, app])).toBe(app);
    expect(pickAppPage([guide, { url: 'about:blank' }, app])).toBe(app);
  });

  it('pickAppPage with two app tabs throws with both URLs and the recipe 3 hint', async () => {
    const { pickAppPage } = await import('../../scripts/testing/cloud.mjs');
    const second = { url: 'http://localhost:8080/?x=1', title: 'Mapping 2' };
    expect(() => pickAppPage([app, second])).toThrow(
      /http:\/\/localhost:8080\/[\s\S]*\?x=1[\s\S]*close the extra tabs \(recipe 3\)/,
    );
  });

  it('pickAppPage with no app tab throws with what it found', async () => {
    const { pickAppPage } = await import('../../scripts/testing/cloud.mjs');
    expect(() => pickAppPage([guide])).toThrow(/No app tab[\s\S]*guide\/index\.html/);
    expect(() => pickAppPage([])).toThrow(/No tab found/);
  });

  it('pickAppPage respects the given origin', async () => {
    const { pickAppPage } = await import('../../scripts/testing/cloud.mjs');
    const other = { url: 'http://localhost:9000/', title: 'Another' };
    expect(pickAppPage([app, other], { origin: 'http://localhost:9000' })).toBe(other);
  });
});

describe('connect with a short timeout (stage #421, TS1, decision 2)', () => {
  function fakeBrowser(urls: string[]) {
    const calls: [string, number][] = [];
    const pages = urls.map((url) => ({
      url: () => url,
      title: async () => `t:${url}`,
      on: () => undefined,
      setDefaultTimeout: (ms: number) => calls.push(['timeout', ms]),
      setDefaultNavigationTimeout: (ms: number) => calls.push(['nav', ms]),
    }));
    const browser = {
      contexts: () => [{ pages: () => pages }],
      close: async () => {
        calls.push(['close', 0]);
      },
    };
    return { calls, pages, connectOverCDP: async () => browser };
  }

  it('calls setDefaultTimeout(5000) and setDefaultNavigationTimeout(15000) on the app tab', async () => {
    const { connect } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-connect-'));
    try {
      const fake = fakeBrowser([
        'http://localhost:8080/guide/',
        'http://localhost:8080/',
      ]);
      const { page } = await connect(dir, undefined, {
        connectOverCDP: fake.connectOverCDP,
      });
      expect(page).toBe(fake.pages[1]);
      expect(fake.calls).toEqual([
        ['timeout', 5000],
        ['nav', 15000],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects timeoutMs and navigationTimeoutMs', async () => {
    const { connect } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-connect-'));
    try {
      const fake = fakeBrowser(['http://localhost:8080/']);
      await connect(dir, undefined, {
        timeoutMs: 1200,
        navigationTimeoutMs: 3400,
        connectOverCDP: fake.connectOverCDP,
      });
      expect(fake.calls).toEqual([
        ['timeout', 1200],
        ['nav', 3400],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('with two app tabs, connect throws with the URLs', async () => {
    const { connect } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-connect-'));
    try {
      const fake = fakeBrowser(['http://localhost:8080/', 'http://localhost:8080/?b=1']);
      await expect(
        connect(dir, undefined, { connectOverCDP: fake.connectOverCDP }),
      ).rejects.toThrow(/\?b=1/);
      // Without closing the CDP connection, the script's `node` process would not exit.
      expect(fake.calls).toEqual([['close', 0]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('diffJson and formatState (stage #421, TS1, decision 6)', () => {
  it('a changed scalar shows old → new', async () => {
    const { diffJson } = await import('../../scripts/testing/cloud.mjs');
    const lines = diffJson(
      { revision: 3, a: { b: 'x' } },
      { revision: 4, a: { b: 'x' } },
    );
    expect(lines).toEqual(['~ revision: 3 → 4']);
  });

  it('an item added to an array with ids shows up by id', async () => {
    const { diffJson } = await import('../../scripts/testing/cloud.mjs');
    const lines = diffJson(
      { markings: [{ id: 'm1', x: 1 }] },
      {
        markings: [
          { id: 'm1', x: 1 },
          { id: 'm2', x: 5 },
        ],
      },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\+ markings\[m2\]/);
  });

  it('a change inside an array item by id and a removed key', async () => {
    const { diffJson } = await import('../../scripts/testing/cloud.mjs');
    const lines = diffJson(
      { markings: [{ id: 'm1', x: 1 }], name: 'n' },
      { markings: [{ id: 'm1', x: 2 }] },
    );
    expect(lines).toContain('~ markings[m1].x: 1 → 2');
    expect(lines.some((l) => /^- name/.test(l))).toBe(true);
  });

  it('beyond the limit becomes "+N"', async () => {
    const { diffJson } = await import('../../scripts/testing/cloud.mjs');
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (let i = 0; i < 25; i += 1) {
      before[`k${i}`] = 0;
      after[`k${i}`] = 1;
    }
    const lines = diffJson(before, after, { limit: 20 });
    expect(lines).toHaveLength(21);
    expect(lines[20]).toMatch(/^\+5\b/);
  });

  it('no difference returns an empty list', async () => {
    const { diffJson } = await import('../../scripts/testing/cloud.mjs');
    expect(diffJson({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
  });

  it('formatState prints few lines, without raw JSON', async () => {
    const { formatState } = await import('../../scripts/testing/cloud.mjs');
    const text = formatState({
      title: 'Mapping',
      url: 'http://localhost:8080/',
      dialogs: ['Delete marking'],
      notices: ['Project opened'],
      saveStatus: 'Saved',
      focus: { role: 'button', name: 'Cancel' },
      windows: [],
      project: { revision: 8, changes: ['~ revision: 7 → 8', '+ markings[m2]'] },
    });
    expect(text).not.toContain('{');
    expect(text.split('\n').length).toBeLessThanOrEqual(12);
    expect(text).toContain('Delete marking');
    expect(text).toContain('Saved');
    expect(text).toContain('button "Cancel"');
    expect(text).toContain('revision 8');
    expect(text).toContain('+ markings[m2]');
    const first = formatState({
      title: 'x',
      url: 'u',
      dialogs: [],
      notices: [],
      saveStatus: null,
      focus: null,
      windows: [],
      project: { revision: 1, changes: null },
    });
    expect(first).toContain('first read');
  });
});

describe('read picker and connectGuide (stage #482, GT1)', () => {
  it('OPEN_DIALOG_TITLES includes the read picker (Apply folder…, Open library)', async () => {
    const { OPEN_DIALOG_TITLES, waitForWindow } =
      await import('../../scripts/testing/cloud.mjs');
    const reading = 'Selecione uma pasta que este site pode ver';
    expect(OPEN_DIALOG_TITLES).toContain(reading);
    // With the window lookup injected: only one window with that title exists.
    const find = (names: string[]) => (names.includes(reading) ? '42' : null);
    await expect(
      waitForWindow(OPEN_DIALOG_TITLES, { timeoutMs: 50, stepMs: 10, find }),
    ).resolves.toBe('42');
  });

  it('connectGuide picks the /guide/ tab with the same 5 s and 15 s', async () => {
    const { connectGuide } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-guide-'));
    try {
      const calls: [string, number][] = [];
      const logged: string[] = [];
      const make = (url: string) => ({
        url: () => url,
        title: async () => `t:${url}`,
        on: (event: string) => logged.push(event),
        setDefaultTimeout: (ms: number) => calls.push(['timeout', ms]),
        setDefaultNavigationTimeout: (ms: number) => calls.push(['nav', ms]),
      });
      const pages = [
        make('http://localhost:8080/'),
        make('http://localhost:8080/guide/'),
      ];
      const browser = { contexts: () => [{ pages: () => pages }], close: async () => {} };
      const { page } = await connectGuide(dir, undefined, {
        connectOverCDP: async () => browser,
      });
      expect(page).toBe(pages[1]);
      expect(calls).toEqual([
        ['timeout', 5000],
        ['nav', 15000],
      ]);
      expect(logged).toEqual(['console', 'pageerror']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('connectGuide without the guide tab throws with the tabs found and closes the connection', async () => {
    const { connectGuide } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-guide-'));
    try {
      let closed = 0;
      const page = {
        url: () => 'http://localhost:8080/',
        title: async () => 'Mapping',
        on: () => undefined,
        setDefaultTimeout: () => undefined,
        setDefaultNavigationTimeout: () => undefined,
      };
      const browser = {
        contexts: () => [{ pages: () => [page] }],
        close: async () => {
          closed += 1;
        },
      };
      await expect(
        connectGuide(dir, undefined, { connectOverCDP: async () => browser }),
      ).rejects.toThrow(/guide/);
      expect(closed).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('GTK autocomplete list with sibling folders (stage #482, GT1)', () => {
  // Geometries measured in a real Chrome: the list for a single folder is only ~48 px tall and
  // the one for `migracao` with `migracao10..12` beside it, 94 px (it grows with the number of
  // suggestions).
  const dialog = { id: '6301026', name: 'Selecione uma pasta que este site pode ver' };
  const main = { id: '4194307', name: 'Mapping: Google Chrome for Testing' };
  const geometries: Record<string, { HEIGHT: number }> = {
    '6301026': { HEIGHT: 822 },
    '4194307': { HEIGHT: 999 },
    '6302837': { HEIGHT: 94 },
    '6302838': { HEIGHT: 48 },
  };
  const geometryOf = (id: string) => geometries[id] ?? { HEIGHT: 0 };

  it('finds the 94 px list (four suggestions), not only the 48 px one', async () => {
    const { pickAutocompletePopup } = await import('../../scripts/testing/cloud.mjs');
    const popup = { id: '6302837', name: 'chromium' };
    expect(pickAutocompletePopup([main, dialog, popup], geometryOf, dialog.id)).toEqual({
      window: popup,
      geometry: { HEIGHT: 94 },
    });
    const small = { id: '6302838', name: 'chromium' };
    expect(
      pickAutocompletePopup([main, dialog, small], geometryOf, dialog.id)?.window,
    ).toBe(small);
  });

  it('does not mistake it for the picker nor for the main Chrome window', async () => {
    const { pickAutocompletePopup } = await import('../../scripts/testing/cloud.mjs');
    expect(pickAutocompletePopup([main, dialog], geometryOf, dialog.id)).toBeNull();
    expect(pickAutocompletePopup([], geometryOf, dialog.id)).toBeNull();
  });

  it('openButtonPoints: the measured center of Open (~45 px from the base) comes first, with variations', async () => {
    const { openButtonPoints } = await import('../../scripts/testing/cloud.mjs');
    // Measured picker: X=238 Y=116 of 1124 × 822; the Open button is at (1312, 893) on screen.
    const points = openButtonPoints({ X: 238, Y: 116, WIDTH: 1124, HEIGHT: 822 });
    expect(points[0]).toEqual({ x: 1312, y: 893 });
    expect(points.length).toBeGreaterThanOrEqual(3);
    for (const point of points) {
      expect(point.x).toBeLessThan(238 + 1124);
      expect(point.y).toBeLessThan(116 + 822);
    }
  });
});

describe('the cloud window exceeds the app minimum (stage #604, GN1, decision 1)', () => {
  const guide = read('docs/TESTING.md');
  const appendixA = guide.slice(
    guide.indexOf('## Appendix A'),
    guide.indexOf('## Appendix B'),
  );
  const recipe2 = appendixA.slice(
    appendixA.indexOf('Recipe 2 (cloud), `source` only in the shell'),
    appendixA.indexOf('Recipe 3 (cloud), restart'),
  );

  /** Sizes of Xvfb (`-screen 0 WxHx24`) and of Chrome (`--window-size=W,H`) in the text. */
  function sizes(text: string): { xvfb: string[]; chrome: string[] } {
    const xvfb = [...text.matchAll(/-screen 0 (\d+x\d+)x24/g)].map((m) => m[1] ?? '');
    const chrome = [...text.matchAll(/--window-size=(\d+),(\d+)/g)].map(
      (m) => `${m[1]}x${m[2]}`,
    );
    return { xvfb, chrome };
  }

  it.each([
    ['scripts/testing/cloud-up.sh', read(CLOUD_UP)],
    ['recipe 2 of appendix A', recipe2],
  ])(
    '%s: Xvfb and Chrome have the same size, with a height of at least 1100',
    (name, text) => {
      const { xvfb, chrome } = sizes(text);
      expect(xvfb, name).toHaveLength(1);
      expect(chrome, name).toHaveLength(1);
      expect(chrome[0], name).toBe(xvfb[0]);
      const height = Number((xvfb[0] ?? '').split('x')[1]);
      expect(height, name).toBeGreaterThanOrEqual(1100);
    },
  );

  it('cloud-up.sh and recipe 2 use the same size', () => {
    expect(sizes(read(CLOUD_UP)).xvfb).toEqual(sizes(recipe2).xvfb);
  });
});

// Stage #841 (RB1, decision 3): `mark` and `tempos` without an exported `APOIO` find the default folder.
describe('cloud.mjs without an exported APOIO (RB1, decision 3)', () => {
  let home: string;

  afterEach(() => {
    if (home) rmSync(home, { recursive: true, force: true });
  });

  function run(args: string[]): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    const env: Record<string, string | undefined> = { ...process.env, HOME: home };
    delete env.APOIO;
    const r = spawnSync('node', ['scripts/testing/cloud.mjs', ...args], {
      env,
      encoding: 'utf8',
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  it('mark writes to the apoio/ folder of the most recent round and warns', () => {
    home = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-home-'));
    const old = path.join(home, 'mapping-testes', '2026-01-01-old', 'apoio');
    const recent = path.join(home, 'mapping-testes', '2026-02-02-new', 'apoio');
    mkdirSync(old, { recursive: true });
    mkdirSync(recent, { recursive: true });
    utimesSync(old, new Date('2026-01-01'), new Date('2026-01-01'));
    const r = run(['mark', 'R1', 'start']);
    expect(r.status ?? 0).toBe(0);
    expect(r.stderr).toMatch(/APOIO/);
    expect(r.stderr).toContain(recent);
    expect(read(path.join(recent, 'tempos.log'))).toMatch(/^R1 start \d{4}-/);
  });

  it('tempos without APOIO reads the same folder; with no folder, fails with the explanation', () => {
    home = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-home-'));
    const apoio = path.join(home, 'mapping-testes', '2026-02-02-new', 'apoio');
    mkdirSync(apoio, { recursive: true });
    writeFileSync(
      path.join(apoio, 'tempos.log'),
      'R1 start 2026-02-02T10:00:00.000Z\nR1 end 2026-02-02T10:01:00.000Z\n',
    );
    const ok = run(['tempos']);
    expect(ok.status ?? 0).toBe(0);
    expect(ok.stdout).toContain('R1');
    expect(ok.stderr).toMatch(/APOIO/);
    rmSync(path.join(home, 'mapping-testes'), { recursive: true, force: true });
    const none = run(['mark', 'R1', 'start']);
    expect(none.status).toBe(2);
    expect(none.stderr).toMatch(/APOIO/);
  });
});

// Stage #1148 (TR1, decisions 1 to 3): `cloud.mjs run`, `--prazo` and `help`.
describe('cloud.mjs run, --prazo and help (stage #1148, TR1)', () => {
  let apoio: string;

  afterEach(() => {
    if (apoio) rmSync(apoio, { recursive: true, force: true });
  });

  const fakePage = {
    evaluate: async () => ({
      title: 'Mapping',
      url: 'http://localhost:8080/',
      dialogs: [],
      notices: [],
      saveStatus: null,
      focus: null,
    }),
  };
  const fakeConnect = async () => ({
    browser: { close: async () => {} },
    page: fakePage,
  });

  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    return {
      out,
      err,
      io: { log: (m: string) => out.push(m), error: (m: string) => err.push(m) },
    };
  }

  it('run: the body sees page, browser, apoioDir, projectDir and the exports; prints the state() and exits 0', async () => {
    apoio = mkdtempSync(path.join(tmpdir(), 'mapping-run-'));
    process.env.DISPLAY ??= ':99';
    const mod = await import('../../scripts/testing/cloud.mjs');
    const c = capture();
    const code = await mod.runStep(
      `globalThis.__runSeen = ([typeof page.evaluate, typeof browser.close, apoioDir === ${JSON.stringify(apoio)}, projectDir, typeof formatState, typeof ponto, typeof settleLike].join('|'))`,
      { apoioDir: apoio, connectFn: fakeConnect, io: c.io },
    );
    expect(code).toBe(0);
    // `typeof settleLike` is undefined: only the real exports are in scope.
    const logged = String((globalThis as { __runSeen?: string }).__runSeen);
    expect(logged).toMatch(/function\|function\|true\|\|function\|function\|/);
    expect(c.out.join('\n')).toContain('Mapping');
  });

  it('run: an error in the body prints the message and the state and exits 1', async () => {
    apoio = mkdtempSync(path.join(tmpdir(), 'mapping-run-'));
    process.env.DISPLAY ??= ':99';
    const mod = await import('../../scripts/testing/cloud.mjs');
    const c = capture();
    const code = await mod.runStep(`throw new Error('failed in the step')`, {
      apoioDir: apoio,
      connectFn: fakeConnect,
      io: c.io,
    });
    expect(code).toBe(1);
    expect(c.err.join('\n')).toContain('failed in the step');
    expect(c.out.join('\n')).toContain('Mapping');
  });

  it('run --prazo: a stuck script exits 124 with "deadline of <n> s exceeded in the step"', async () => {
    apoio = mkdtempSync(path.join(tmpdir(), 'mapping-run-'));
    process.env.DISPLAY ??= ':99';
    const mod = await import('../../scripts/testing/cloud.mjs');
    const c = capture();
    const code = await mod.runStep(`await new Promise(() => {})`, {
      apoioDir: apoio,
      connectFn: fakeConnect,
      prazoSeconds: 0.05,
      io: c.io,
    });
    expect(code).toBe(124);
    expect(c.err.join('\n')).toContain('deadline of 0.05 s exceeded in the step');
    expect(c.out.join('\n')).toContain('Mapping');
  });

  it('run through the CLI with no body on stdin fails with the usage', () => {
    const r = spawnSync('node', ['scripts/testing/cloud.mjs', 'run'], {
      input: '',
      encoding: 'utf8',
      env: { ...process.env, APOIO: tmpdir() },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Usage: .*cloud\.mjs run/);
  });

  it('help lists every export (single table) and cloud.d.mts declares the same names', async () => {
    const mod: Record<string, unknown> = await import('../../scripts/testing/cloud.mjs');
    const help = mod.HELP as Record<string, { sig: string; desc: string }>;
    const names = Object.keys(mod).sort();
    expect(Object.keys(help).sort()).toEqual(names);
    for (const name of names) {
      expect(help[name]?.desc, name).toMatch(/\S/);
    }
    const r = spawnSync('node', ['scripts/testing/cloud.mjs', 'help'], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    for (const name of names) expect(r.stdout, name).toContain(name);
    for (const cmd of [
      'mark',
      'state',
      'tempos',
      'ponto',
      'run',
      'find',
      'passo',
      'secao',
      'help',
    ]) {
      expect(r.stdout, cmd).toMatch(new RegExp(`cloud\\.mjs ${cmd}\\b`));
    }
    const dts = read('scripts/testing/cloud.d.mts');
    const declared = [
      ...dts.matchAll(/^export (?:async )?(?:function|const|interface) (\w+)/gm),
    ]
      .map((m) => m[1] ?? '')
      .filter(
        (n) =>
          ![
            'ConnectOptions',
            'X11Window',
            'PageInfo',
            'TesterState',
            'TempoItem',
            'HelpEntry',
            'ContainerBox',
            'Candidate',
            'Tempos',
          ].includes(n),
      );
    expect(declared.sort()).toEqual(names);
  });
});

// Stage #1148 (TR1, decisions 4 and 5): `env.sh` and the build log.
describe('cloud-up.sh: env.sh and build.log (stage #1148, TR1)', () => {
  it('writes and reads apoio/env.sh (without the old name)', () => {
    const up = read(CLOUD_UP);
    expect(up).toContain('"$S/env.sh"');
    expect(up).not.toMatch(/\$S\/env["\s]/);
    expect(read(CLOUD_MJS)).toContain("'env.sh'");
    expect(read(CLOUD_MJS)).not.toMatch(/apoio\/env\b(?!\.sh)/);
  });

  it('sends npm ci, build and build:mcp to apoio/build.log and shows the last 40 lines on failure', () => {
    const up = read(CLOUD_UP);
    expect(up).toContain('build.log');
    expect(up).toMatch(/tail -n 40/);
    for (const cmd of ['npm ci', 'npm run build', 'npm run build:mcp']) {
      expect(up, cmd).toMatch(new RegExp(`run_logged ${cmd}`));
    }
  });
});

// Stage #1148 (TR2, decisions 7 to 11): waits and gestures that do not fail.
describe('settle, openWindow, drag, setViewport and find (stage #1148, TR2)', () => {
  type Fn = (...args: unknown[]) => unknown;
  type Mod = {
    TOOL_WINDOW_IDS: string[];
    settle: Fn;
    state: Fn;
    openWindow: Fn;
    closeWindow: Fn;
    drag: Fn;
    nearHandle: Fn;
    setViewport: Fn;
    find: Fn;
    formatCandidates: Fn;
    locatorTextFromError: Fn;
    runStep: Fn;
  };
  const load = async (): Promise<Mod> => {
    process.env.DISPLAY ??= ':99';
    return (await import('../../scripts/testing/cloud.mjs')) as unknown as Mod;
  };

  describe('settle', () => {
    const g = globalThis as Record<string, unknown>;
    const saved: Record<string, unknown> = {};
    const stub = (status: string, mutating: boolean) => {
      for (const k of ['document', 'MutationObserver', 'requestAnimationFrame']) {
        saved[k] = g[k];
      }
      g.document = {
        querySelectorAll: () => [{ textContent: status }],
      };
      g.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 1);
      g.MutationObserver = class {
        constructor(cb: () => void) {
          if (mutating) setInterval(cb, 20).unref();
        }
        observe() {}
        disconnect() {}
      };
    };
    afterEach(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete g[k];
        else g[k] = v;
      }
    });
    const pageRunning = {
      evaluate: (fn: Fn, arg: unknown) => fn(arg),
    };

    it('without "Saving…" and without mutation returns null after ~200 ms', async () => {
      const mod = await load();
      stub('Saved', false);
      const t0 = Date.now();
      const warning = await mod.settle(pageRunning, { timeoutMs: 2000 });
      expect(warning).toBeNull();
      expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
    });

    it('"Saving…" that does not go away times out with a warning that cites the condition', async () => {
      const mod = await load();
      stub('Saving…', false);
      const warnings: string[] = [];
      const warning = await mod.settle(pageRunning, {
        timeoutMs: 300,
        warn: (m: string) => warnings.push(m),
      });
      expect(String(warning)).toMatch(/Saving/);
      expect(warnings).toHaveLength(1);
    });

    it('a DOM that keeps changing times out with a mutation warning', async () => {
      const mod = await load();
      stub('Saved', true);
      const warning = await mod.settle(pageRunning, { timeoutMs: 400, warn: () => {} });
      expect(String(warning)).toMatch(/kept changing/);
    });

    it('state() waits for the settle before reading the DOM', async () => {
      const mod = await load();
      const calls: unknown[] = [];
      const page = {
        evaluate: async (_fn: Fn, arg: unknown) => {
          calls.push(arg);
          return arg && typeof arg === 'object' && 'timeoutMs' in arg
            ? null
            : { title: 'Mapping', url: 'x', dialogs: [], notices: [], focus: null };
        },
      };
      const apoio = mkdtempSync(path.join(tmpdir(), 'mapping-st-'));
      try {
        await mod.state(page, apoio);
      } finally {
        rmSync(apoio, { recursive: true, force: true });
      }
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[0]).toHaveProperty('timeoutMs');
    });
  });

  describe('openWindow and closeWindow', () => {
    function fakeWindowPage(initial: Record<string, string>) {
      const pressed = { ...initial };
      const clicks: string[] = [];
      const waits: string[] = [];
      const page = {
        locator: (sel: string) => {
          const id = /"(\w+)"/.exec(sel)?.[1] ?? '';
          return {
            getAttribute: async () => pressed[id] ?? 'false',
            click: async () => {
              clicks.push(id);
              pressed[id] = pressed[id] === 'true' ? 'false' : 'true';
            },
            waitFor: async ({ state }: { state: string }) => {
              waits.push(`${sel}:${state}`);
            },
          };
        },
        evaluate: async () => null,
      };
      return { page, clicks, waits };
    }

    it('openWindow only clicks when the window is closed (idempotent)', async () => {
      const mod = await load();
      const a = fakeWindowPage({ tree: 'false' });
      await mod.openWindow(a.page, 'tree');
      await mod.openWindow(a.page, 'tree');
      expect(a.clicks).toEqual(['tree']);
      expect(a.waits[0]).toContain('visible');
    });

    it('closeWindow only clicks when the window is open and waits for it to disappear', async () => {
      const mod = await load();
      const a = fakeWindowPage({ layers: 'true' });
      await mod.closeWindow(a.page, 'layers');
      await mod.closeWindow(a.page, 'layers');
      expect(a.clicks).toEqual(['layers']);
      expect(a.waits[0]).toContain('hidden');
    });

    it('an unknown id gives an error with the list of ids', async () => {
      const mod = await load();
      const a = fakeWindowPage({});
      await expect(mod.openWindow(a.page, 'unknown')).rejects.toThrow(
        /unknown.*tree.*layers.*details.*list.*incomplete.*diagnostics.*proposals.*notices.*comments.*catalog/s,
      );
      expect(a.clicks).toEqual([]);
    });

    it('the ids are the ones in src/store/toolWindows.ts', async () => {
      const mod = await load();
      const src = read('src/store/toolWindows.ts');
      const block = /TOOL_WINDOWS = \[([^\]]+)\]/.exec(src)?.[1] ?? '';
      const ids = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
      expect([...mod.TOOL_WINDOW_IDS].sort()).toEqual(ids);
    });
  });

  describe('drag and nearHandle', () => {
    function fakeDragPage(
      selectionBox: string | null,
      {
        selection = 'marking m1',
        onCanvas = { ok: true, element: 'canvas' },
      }: { selection?: string | null; onCanvas?: { ok: boolean; element: string } } = {},
    ) {
      const events: string[] = [];
      const page = {
        mouse: {
          click: async (x: number, y: number) => events.push(`click ${x},${y}`),
          down: async () => events.push('down'),
          move: async (x: number, y: number) => events.push(`move ${x},${y}`),
          up: async () => events.push('up'),
        },
        locator: () => ({
          getAttribute: async (name: string) =>
            name === 'data-selection' ? selection : selectionBox,
          boundingBox: async () => ({ x: 100, y: 50, width: 800, height: 600 }),
        }),
        evaluate: async (_fn: unknown, arg?: Record<string, unknown>) => {
          if (arg && 'x' in arg && 'y' in arg) {
            events.push(`check ${String(arg.x)},${String(arg.y)}`);
            return onCanvas;
          }
          return null;
        },
      };
      return { page, events };
    }

    it('clicks, holds, moves in `steps` steps to the target and releases', async () => {
      const mod = await load();
      const d = fakeDragPage(null);
      await mod.drag(d.page, { x: 300, y: 300 }, { x: 340, y: 380 }, { steps: 4 });
      expect(d.events[0]).toBe('check 300,300');
      expect(d.events[1]).toBe('click 300,300');
      expect(d.events[2]).toBe('move 300,300');
      expect(d.events[3]).toBe('down');
      expect(d.events.slice(4, 8)).toEqual([
        'move 310,320',
        'move 320,340',
        'move 330,360',
        'move 340,380',
      ]);
      expect(d.events[8]).toBe('up');
    });

    it('select: false does not click first', async () => {
      const mod = await load();
      const d = fakeDragPage(null);
      await mod.drag(d.page, { x: 1, y: 2 }, { x: 3, y: 4 }, { select: false, steps: 1 });
      expect(d.events.slice(1, 3)).toEqual(['move 1,2', 'down']);
    });

    it('a start point outside the canvas throws before any mouse action; allowOffCanvas proceeds', async () => {
      const mod = await load();
      const off = { ok: false, element: 'div.dock "Windows"' };
      const d = fakeDragPage(null, { onCanvas: off });
      await expect(
        mod.drag(d.page, { x: 300, y: 300 }, { x: 340, y: 380 }, { steps: 1 }),
      ).rejects.toThrow(
        'drag: the starting point (300, 300) does not fall on the canvas (div.dock "Windows")',
      );
      expect(d.events.some((e) => /^(click|move|down|up)/.test(e))).toBe(false);
      const e = fakeDragPage(null, { onCanvas: off });
      await mod.drag(
        e.page,
        { x: 300, y: 300 },
        { x: 340, y: 380 },
        { steps: 1, allowOffCanvas: true },
      );
      expect(e.events).toContain('up');
    });

    it('the selection click without data-selection warns "selected nothing" and proceeds', async () => {
      const mod = await load();
      const warnings: string[] = [];
      const d = fakeDragPage(null, { selection: null });
      await mod.drag(
        d.page,
        { x: 300, y: 300 },
        { x: 340, y: 380 },
        { steps: 1, warn: (m: string) => warnings.push(m) },
      );
      expect(warnings.join('')).toContain('the click at (300, 300) selected nothing');
      expect(d.events).toContain('up');
      const ok = fakeDragPage(null);
      const quiet: string[] = [];
      await mod.drag(
        ok.page,
        { x: 300, y: 300 },
        { x: 340, y: 380 },
        { steps: 1, warn: (m: string) => quiet.push(m) },
      );
      expect(quiet).toEqual([]);
      // without `select`, there is no click and nothing to check
      const free = fakeDragPage(null, { selection: null });
      const none: string[] = [];
      await mod.drag(
        free.page,
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { select: false, steps: 1, warn: (m: string) => none.push(m) },
      );
      expect(none).toEqual([]);
    });

    it('warns when the start point falls within 8 px of a handle of the selection box', async () => {
      const mod = await load();
      // selection box (relative to the host): 100 100 200 100 → nw corner on screen: (200, 150)
      const d = fakeDragPage('100 100 200 100');
      const warnings: string[] = [];
      await mod.drag(
        d.page,
        { x: 205, y: 154 },
        { x: 260, y: 154 },
        {
          steps: 1,
          warn: (m: string) => warnings.push(m),
        },
      );
      expect(warnings.join('')).toMatch(/near handle nw: the drag may resize/);
      expect(d.events).toContain('up');
    });

    it('does not warn far from the handles; nearHandle returns the corner name or null', async () => {
      const mod = await load();
      const box = { x: 200, y: 150, width: 200, height: 100 };
      expect(mod.nearHandle(box, { x: 300, y: 200 })).toBeNull();
      expect(mod.nearHandle(box, { x: 400, y: 250 })).toBe('se');
      // The app has no handle in the middle of the edges (CORNERS): the middle of the top side does not warn.
      expect(mod.nearHandle(box, { x: 300, y: 146 })).toBeNull();
      expect(mod.nearHandle(box, { x: 209, y: 200 })).toBeNull();
    });

    it("nearHandle uses the app's radius and chessboard distance (handleHitRadius, HANDLE_HIT_RADIUS)", async () => {
      const mod = await load();
      // Big box (>= 66 px on the shorter side): the radius is the container's fixed one.
      const big = { x: 200, y: 150, width: 200, height: 100 };
      expect(handleHitRadius(100)).toBe(HANDLE_HIT_RADIUS);
      const r = HANDLE_HIT_RADIUS;
      expect(mod.nearHandle(big, { x: 200 + r, y: 150 })).toBe('nw');
      expect(mod.nearHandle(big, { x: 200 + r + 1, y: 150 })).toBeNull();
      // Chessboard: the corner of the r × r square counts, even if the Euclidean distance exceeds r.
      expect(mod.nearHandle(big, { x: 200 + r, y: 150 + r })).toBe('nw');
      expect(mod.nearHandle(big, { x: 400 - r, y: 150 + r })).toBe('ne');
      expect(mod.nearHandle(big, { x: 200 + r, y: 250 - r })).toBe('sw');
      // Outside the box also counts (the container label sits above the edge).
      expect(mod.nearHandle(big, { x: 200, y: 150 - r })).toBe('nw');
      expect(mod.nearHandle(big, { x: 200, y: 150 - r - 1 })).toBeNull();
      // Small box: radius clamp(min / 3, 12, 22).
      const small = { x: 0, y: 0, width: 30, height: 90 };
      const rs = handleHitRadius(30);
      expect(rs).toBe(12);
      expect(mod.nearHandle(small, { x: rs, y: 0 })).toBe('nw');
      expect(mod.nearHandle(small, { x: rs + 1, y: 0 })).toBeNull();
      const mid = { x: 0, y: 0, width: 45, height: 90 };
      const rm = handleHitRadius(45);
      expect(rm).toBe(15);
      expect(mod.nearHandle(mid, { x: 45 + rm, y: 90 })).toBe('se');
      expect(mod.nearHandle(mid, { x: 45 + rm + 1, y: 90 })).toBeNull();
    });

    it('the container has a fixed 22 px radius even with a small box (HANDLE_HIT_RADIUS)', async () => {
      const mod = await load();
      const small = { x: 0, y: 0, width: 30, height: 90 };
      const r = HANDLE_HIT_RADIUS;
      // Marking: clamp(30 / 3, 12, 22) = 12; container: always 22.
      expect(mod.nearHandle(small, { x: 0, y: r })).toBeNull();
      expect(mod.nearHandle(small, { x: 0, y: r }, { container: true })).toBe('nw');
      expect(mod.nearHandle(small, { x: 0, y: r + 1 }, { container: true })).toBeNull();
      // The drag does not know whether the selection is a container or a marking: it warns by the larger radius.
      const d = fakeDragPage('100 100 30 90');
      const warnings: string[] = [];
      await mod.drag(
        d.page,
        { x: 200, y: 168 },
        { x: 260, y: 168 },
        { steps: 1, warn: (m: string) => warnings.push(m) },
      );
      expect(warnings.join('')).toMatch(/near handle nw/);
    });

    it('drag warns near the corner outside the box, like the container label', async () => {
      const mod = await load();
      const d = fakeDragPage('100 100 200 100');
      const warnings: string[] = [];
      // nw corner on screen: (200, 150); the point is 20 px above it.
      await mod.drag(
        d.page,
        { x: 205, y: 130 },
        { x: 260, y: 130 },
        { steps: 1, select: false, warn: (m: string) => warnings.push(m) },
      );
      expect(warnings.join('')).toMatch(/near handle nw/);
      expect(warnings.join('')).toMatch(/22 px/);
    });
  });

  describe('setViewport', () => {
    function fakeCdpPage(sequence: Array<Record<string, number>>) {
      const sent: Array<[string, unknown]> = [];
      let i = 0;
      const page = {
        context: () => ({
          newCDPSession: async () => ({
            send: async (method: string, params: unknown) => {
              sent.push([method, params]);
              return method === 'Browser.getWindowForTarget'
                ? { windowId: 7, bounds: {} }
                : {};
            },
            detach: async () => {},
          }),
        }),
        evaluate: async () => sequence[Math.min(i++, sequence.length - 1)],
      };
      return { page, sent };
    }

    it('adds the measured frame and checks innerWidth/innerHeight', async () => {
      const mod = await load();
      const p = fakeCdpPage([
        { outerWidth: 1300, innerWidth: 1284, outerHeight: 840, innerHeight: 700 },
        { innerWidth: 1280, innerHeight: 720 },
      ]);
      await mod.setViewport(p.page, 1280, 720);
      const bounds = p.sent.find(([m]) => m === 'Browser.setWindowBounds')?.[1] as {
        windowId: number;
        bounds: { width: number; height: number };
      };
      expect(bounds.windowId).toBe(7);
      expect(bounds.bounds.width).toBe(1280 + 16);
      expect(bounds.bounds.height).toBe(720 + 140);
    });

    it('errors with the values obtained when the window did not give what was asked', async () => {
      const mod = await load();
      const p = fakeCdpPage([
        { outerWidth: 1300, innerWidth: 1284, outerHeight: 840, innerHeight: 700 },
        { innerWidth: 1200, innerHeight: 700 },
      ]);
      await expect(mod.setViewport(p.page, 1280, 720)).rejects.toThrow(
        /1280.*720.*1200.*700/s,
      );
    });
  });

  describe('find and a locator that says what exists', () => {
    const candidates = [
      { role: 'button', name: 'Review', region: 'Proposals' },
      { role: 'button', name: 'Review proposal', region: 'Tool windows' },
    ];

    it('find returns the candidates of the page; formatCandidates lists them', async () => {
      const mod = await load();
      const page = {
        evaluate: async (_fn: Fn, arg: { needle: string }) => {
          expect(arg.needle).toBe('review');
          return candidates;
        },
      };
      const found = await mod.find(page, 'Review');
      expect(found).toEqual(candidates);
      const text = String(mod.formatCandidates(found, 'Review'));
      expect(text).toContain('button "Review" in Proposals');
      expect(mod.formatCandidates([], 'Nothing')).toMatch(/no candidate.*Nothing/);
    });

    it("locatorTextFromError extracts the locator name from Playwright's message", async () => {
      const mod = await load();
      expect(
        mod.locatorTextFromError(
          "locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Review' })",
        ),
      ).toBe('Review');
      expect(
        mod.locatorTextFromError(
          "strict mode violation: getByText('Threads') resolved to 2 elements",
        ),
      ).toBe('Threads');
      expect(mod.locatorTextFromError('some other error')).toBeNull();
    });

    it('run: a locator timeout is followed by the list of candidates', async () => {
      const mod = await load();
      const page = {
        evaluate: async (_fn: Fn, arg: { needle?: string; timeoutMs?: number }) => {
          if (arg && 'needle' in arg) return candidates;
          if (arg && 'timeoutMs' in arg) return null;
          return { title: 'Mapping', url: 'x', dialogs: [], notices: [], focus: null };
        },
      };
      const apoio = mkdtempSync(path.join(tmpdir(), 'mapping-find-'));
      const out: string[] = [];
      const err: string[] = [];
      try {
        const code = await mod.runStep(
          `throw new Error("locator.click: Timeout 5000ms exceeded.\\n  - waiting for getByRole('button', { name: 'Review' })")`,
          {
            apoioDir: apoio,
            connectFn: async () => ({ browser: { close: async () => {} }, page }),
            io: { log: (m: string) => out.push(m), error: (m: string) => err.push(m) },
          },
        );
        expect(code).toBe(1);
      } finally {
        rmSync(apoio, { recursive: true, force: true });
      }
      const all = err.join('\n');
      expect(all).toContain('Timeout 5000ms');
      expect(all).toContain('button "Review" in Proposals');
    });
  });
});

describe('paletteDrag, absolute path and remembered folder (stage #1256, RT2)', () => {
  type Fn = (...args: unknown[]) => unknown;
  type Mod = {
    paletteDrag: Fn;
    selectFolder: Fn;
    openFile: Fn;
    saveFile: Fn;
    state: Fn;
    formatState: Fn;
    HELP: Record<string, unknown>;
  };
  const load = async (): Promise<Mod> => {
    process.env.DISPLAY ??= ':99';
    return (await import('../../scripts/testing/cloud.mjs')) as unknown as Mod;
  };

  /**
   * Fake page: the instance is born in the `mapping.json` of the project folder, at `mouse.up`
   * (native) or at the synthetic `evaluate`; `groups` are the Palette groups that have the type.
   */
  function fakePalettePage(
    rises: 'nativo' | 'sintetico' | 'nenhum',
    {
      groups = ['Library'],
      syntheticReason,
    }: { groups?: string[]; syntheticReason?: string } = {},
  ) {
    const project = mkdtempSync(path.join(tmpdir(), 'mapping-palette-'));
    const file = path.join(project, 'mapping.json');
    writeFileSync(file, JSON.stringify({ markings: [{ id: 'm1' }] }));
    const addMarking = () => {
      const json = JSON.parse(readFileSync(file, 'utf8')) as { markings: unknown[] };
      json.markings.push({ id: `m${json.markings.length + 1}` });
      writeFileSync(file, JSON.stringify(json));
    };
    const events: string[] = [];
    const selectors: string[] = [];
    const item = {
      scrollIntoViewIfNeeded: async () => events.push('scroll'),
      boundingBox: async () => ({ x: 10, y: 100, width: 200, height: 40 }),
    };
    const generic = (selector: string): Record<string, unknown> => ({
      filter: () => item,
      getByText: () => ({ text: selector }),
      getAttribute: async () => '0',
      screenshot: async ({ path: out }: { path: string }) =>
        events.push(`capture ${out}`),
    });
    const page = {
      mouse: {
        move: async (x: number, y: number) => events.push(`move ${x},${y}`),
        down: async () => events.push('down'),
        up: async () => {
          events.push('up');
          if (rises === 'nativo') addMarking();
        },
      },
      locator: (selector: string) => {
        selectors.push(selector);
        return generic(selector);
      },
      evaluate: async (_fn: Fn, arg: Record<string, unknown>) => {
        if (arg && 'timeoutMs' in arg) return null;
        if (arg && 'x' in arg && !('to' in arg)) return { ok: true, element: 'canvas' };
        if (arg && 'to' in arg) {
          events.push('sintetico');
          if (syntheticReason) return { motivo: syntheticReason };
          if (rises === 'sintetico') addMarking();
          return { ok: true };
        }
        return groups;
      },
    };
    return { page, events, selectors, project, file };
  }

  describe('paletteDrag (decisions 9 and 10)', () => {
    const cleanup: string[] = [];
    afterEach(() => {
      for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
    });
    const setup = (...args: Parameters<typeof fakePalettePage>) => {
      const d = fakePalettePage(...args);
      cleanup.push(d.project);
      return d;
    };

    it('the native drag creates the instance (markings on disk): via nativo, without the synthetic event', async () => {
      const mod = await load();
      const d = setup('nativo');
      const result = await mod.paletteDrag(
        d.page,
        'Button',
        { x: 500, y: 300 },
        { steps: 2, projectDir: d.project },
      );
      expect(result).toEqual({ via: 'nativo' });
      expect(d.events).toEqual([
        'scroll',
        'move 110,120',
        'down',
        'move 305,210',
        'move 500,300',
        'up',
      ]);
    });

    it('without a new marking from the native drag, redoes it through the synthetic event: via sintetico', async () => {
      const mod = await load();
      const d = setup('sintetico');
      const result = await mod.paletteDrag(
        d.page,
        'Box',
        { x: 500, y: 300 },
        { steps: 1, projectDir: d.project, waitMs: 20 },
      );
      expect(result).toEqual({ via: 'sintetico' });
      expect(d.events.at(-1)).toBe('sintetico');
    });

    it('a marking that reaches the disk after the settle (autosave) still counts as native', async () => {
      const mod = await load();
      const d = setup('nenhum');
      const up = d.page.mouse.up;
      d.page.mouse.up = async () => {
        await up();
        setTimeout(() => {
          const json = JSON.parse(readFileSync(d.file, 'utf8')) as {
            markings: unknown[];
          };
          json.markings.push({ id: 'late' });
          writeFileSync(d.file, JSON.stringify(json));
        }, 120);
      };
      const result = await mod.paletteDrag(
        d.page,
        'Button',
        { x: 500, y: 300 },
        { steps: 1, projectDir: d.project, waitMs: 1000 },
      );
      expect(result).toEqual({ via: 'nativo' });
      expect(d.events).not.toContain('sintetico');
    });

    it('the native drag created it: the synthetic one does not run (no duplicate instance)', async () => {
      const mod = await load();
      const d = setup('nativo');
      await mod.paletteDrag(
        d.page,
        'Box',
        { x: 500, y: 300 },
        { steps: 1, projectDir: d.project },
      );
      expect(d.events).not.toContain('sintetico');
      expect(
        (JSON.parse(readFileSync(d.file, 'utf8')) as { markings: unknown[] }).markings,
      ).toHaveLength(2);
    });

    it('with neither, throws that the drag did not create the instance', async () => {
      const mod = await load();
      const d = setup('nenhum');
      await expect(
        mod.paletteDrag(
          d.page,
          'Button',
          { x: 500, y: 300 },
          { steps: 1, projectDir: d.project, waitMs: 20 },
        ),
      ).rejects.toThrow('the Palette drag did not create the instance');
    });

    it('without the project folder, throws "paletteDrag needs the project folder"', async () => {
      const mod = await load();
      const d = setup('nativo');
      await expect(
        mod.paletteDrag(d.page, 'Button', { x: 500, y: 300 }, { steps: 1 }),
      ).rejects.toThrow('paletteDrag needs the project folder');
      expect(d.events).toEqual([]);
    });

    it('the synthetic reason becomes the message: item disappeared and point outside the canvas', async () => {
      const mod = await load();
      for (const reason of [
        "the item 'Button' disappeared from the Palette",
        'the point (500, 300) does not fall on the canvas (div.dock)',
      ]) {
        const d = setup('nenhum', { syntheticReason: reason });
        await expect(
          mod.paletteDrag(
            d.page,
            'Button',
            { x: 500, y: 300 },
            { steps: 1, projectDir: d.project },
          ),
        ).rejects.toThrow(reason);
      }
    });

    it('a type repeated in two groups throws with the groups; { grupo } chooses', async () => {
      const mod = await load();
      const d = setup('nativo', { groups: ['Material', 'Icons'] });
      await expect(
        mod.paletteDrag(
          d.page,
          'Button',
          { x: 500, y: 300 },
          { steps: 1, projectDir: d.project },
        ),
      ).rejects.toThrow(/more than one group.*Material.*Icons/);
      const result = await mod.paletteDrag(
        d.page,
        'Button',
        { x: 500, y: 300 },
        { steps: 1, projectDir: d.project, grupo: 'Icons' },
      );
      expect(result).toEqual({ via: 'nativo' });
      expect(d.selectors.some((s) => s.includes('aria-label="Icons"'))).toBe(true);
      await expect(
        mod.paletteDrag(
          d.page,
          'Button',
          { x: 500, y: 300 },
          { steps: 1, projectDir: d.project, grupo: 'Other' },
        ),
      ).rejects.toThrow(/Other.*Material.*Icons/);
    });

    it('a type that no group has: throws that it is not in the open Palette', async () => {
      const mod = await load();
      const d = setup('nativo', { groups: [] });
      await expect(
        mod.paletteDrag(
          d.page,
          'Nothing',
          { x: 500, y: 300 },
          { steps: 1, projectDir: d.project },
        ),
      ).rejects.toThrow("paletteDrag: the type 'Nothing' is not in the open Palette");
    });

    it('capture saves the canvas crop before releasing', async () => {
      const mod = await load();
      const d = setup('nativo');
      await mod.paletteDrag(
        d.page,
        'Box',
        { x: 500, y: 300 },
        { steps: 1, capture: '/tmp/target.png', projectDir: d.project },
      );
      const shot = d.events.indexOf('capture /tmp/target.png');
      expect(shot).toBeGreaterThan(d.events.indexOf('down'));
      expect(shot).toBeLessThan(d.events.indexOf('up'));
    });
  });

  describe('absolute path (decision 8)', () => {
    for (const name of ['selectFolder', 'openFile', 'saveFile'] as const) {
      it(`${name} with a relative path cancels the picker (alt+c) and says what to do`, async () => {
        const mod = await load();
        const apoio = mkdtempSync(path.join(tmpdir(), 'mapping-rel-'));
        let cancelled = 0;
        try {
          await expect(
            mod[name](apoio, 'folder/rel', {
              cancel: async () => {
                cancelled += 1;
              },
            }),
          ).rejects.toThrow(
            "relative path 'folder/rel': pass the absolute path (path.resolve)",
          );
        } finally {
          rmSync(apoio, { recursive: true, force: true });
        }
        expect(cancelled).toBe(1);
      });
    }
  });

  describe('folder remembered by state() (decision 9)', () => {
    const dom = { title: 'Mapping', url: 'x', dialogs: [], notices: [], focus: null };
    const page = {
      evaluate: async (_fn: Fn, arg: unknown) =>
        arg && typeof arg === 'object' && 'timeoutMs' in arg ? null : dom,
    };
    const setup = () => {
      const apoio = mkdtempSync(path.join(tmpdir(), 'mapping-lem-'));
      const project = mkdtempSync(path.join(tmpdir(), 'mapping-proj-'));
      writeFileSync(path.join(project, 'mapping.json'), JSON.stringify({ revision: 7 }));
      return { apoio, project };
    };

    it('with projectDir writes the absolute path to state/ultima-pasta.txt', async () => {
      const mod = await load();
      const { apoio, project } = setup();
      try {
        await mod.state(page, apoio, { projectDir: project });
        expect(
          readFileSync(path.join(apoio, 'state', 'ultima-pasta.txt'), 'utf8').trim(),
        ).toBe(path.resolve(project));
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(project, { recursive: true, force: true });
      }
    });

    it('without projectDir uses the saved folder and returns the path read', async () => {
      const mod = await load();
      const { apoio, project } = setup();
      try {
        await mod.state(page, apoio, { projectDir: project });
        const result = (await mod.state(page, apoio)) as {
          project: { revision: number; dir: string };
        };
        expect(result.project.revision).toBe(7);
        expect(result.project.dir).toBe(path.resolve(project));
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(project, { recursive: true, force: true });
      }
    });

    it('an explicit folder without mapping.json is also saved as the last one (the read fails, #1430 e)', async () => {
      const mod = await load();
      const { apoio, project } = setup();
      try {
        const empty = path.join(apoio, 'does-not-exist');
        const result = (await mod.state(page, apoio, { projectDir: empty })) as {
          project: { error: string };
        };
        expect(result.project.error).toContain('does not exist');
        expect(
          readFileSync(path.join(apoio, 'state', 'ultima-pasta.txt'), 'utf8').trim(),
        ).toBe(path.resolve(empty));
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(project, { recursive: true, force: true });
      }
    });

    it('ultima-pasta.txt is only rewritten when the content changes; the remembered folder does not rewrite it', async () => {
      const mod = await load();
      const { apoio, project } = setup();
      try {
        const file = path.join(apoio, 'state', 'ultima-pasta.txt');
        await mod.state(page, apoio, { projectDir: project });
        const old = new Date('2020-01-01T00:00:00Z');
        utimesSync(file, old, old);
        await mod.state(page, apoio, { projectDir: project });
        await mod.state(page, apoio);
        expect(statSync(file).mtimeMs).toBe(old.getTime());
        const another = mkdtempSync(path.join(tmpdir(), 'mapping-proj2-'));
        try {
          await mod.state(page, apoio, { projectDir: another });
          expect(statSync(file).mtimeMs).not.toBe(old.getTime());
          expect(readFileSync(file, 'utf8').trim()).toBe(path.resolve(another));
        } finally {
          rmSync(another, { recursive: true, force: true });
        }
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(project, { recursive: true, force: true });
      }
    });

    it('without a saved folder, nothing is read; with projectDir null, the disk is not read', async () => {
      const mod = await load();
      const { apoio, project } = setup();
      try {
        expect(((await mod.state(page, apoio)) as { project?: unknown }).project).toBe(
          undefined,
        );
        await mod.state(page, apoio, { projectDir: project });
        expect(
          ((await mod.state(page, apoio, { projectDir: null })) as { project?: unknown })
            .project,
        ).toBe(undefined);
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(project, { recursive: true, force: true });
      }
    });

    it('formatState prints the folder read', async () => {
      const mod = await load();
      const text = mod.formatState({
        ...dom,
        saveStatus: null,
        windows: [],
        project: { revision: 3, changes: null, dir: '/tmp/workspace' },
      }) as string;
      expect(text).toContain('Folder: /tmp/workspace');
    });
  });
});

// Stage #1232 (GL1): `cloud.mjs passo` prints the excerpt of the round guide, without opening Chrome.
describe('cloud.mjs passo (#1232, GL1)', () => {
  let apoio: string;

  beforeAll(() => {
    apoio = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-passo-'));
    const guide = spawnSync('node', ['scripts/testing/round-guide.mjs', 'R0', 'R22'], {
      encoding: 'utf8',
    });
    writeFileSync(path.join(apoio, 'guia.md'), guide.stdout);
  });

  afterAll(() => rmSync(apoio, { recursive: true, force: true }));

  function runPasso(
    args: string[],
    env: Record<string, string | undefined> = { APOIO: apoio },
  ) {
    const r = spawnSync('node', ['scripts/testing/cloud.mjs', 'passo', ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  it('R22.4 prints the table header and the step row', () => {
    const r = runPasso(['R22.4']);
    expect(r.status).toBe(0);
    const lines = r.stdout.trimEnd().split('\n');
    expect(lines.slice(0, 2)).toEqual([
      '| Step | Action | Expected |',
      '| --- | --- | --- |',
    ]);
    expect(lines[2]).toMatch(/^\| R22\.4 \|/);
    expect(lines).toHaveLength(3);
  });

  it('several items, in order, separated by ---; --guia points to another file', () => {
    const r = runPasso(['R22.4', 'R0.1', `--guia=${path.join(apoio, 'guia.md')}`], {
      APOIO: undefined,
    });
    expect(r.status).toBe(0);
    expect(r.stdout.indexOf('| R22.4 |')).toBeLessThan(r.stdout.indexOf('| R0.1 |'));
    expect(r.stdout).toContain('\n---\n');
  });

  it('R22.99 exits 2 and says what the guide has; with no item it exits 2 and shows the usage', () => {
    const bad = runPasso(['R22.99']);
    expect(bad.status).toBe(2);
    expect(bad.stdout).toBe('');
    expect(bad.stderr).toContain(
      'R22.99 is not in the round guide; R22 has R22.1 to R22.22',
    );
    const none = runPasso([]);
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('Usage: node cloud.mjs passo <item…> [--guia=<file>]');
  });

  it('passo R22 --preparo prints only the part before the first step (#1639, TC1)', () => {
    const r = runPasso(['R22', '--preparo']);
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[0]).toMatch(/^### R22\b/);
    expect(r.stdout).not.toMatch(/^\| R22\./m);
    expect(r.stdout).not.toMatch(/^\| Step\b/m);
  });

  it('passo --preparo with an item that is not a whole script exits 2 and shows the usage', () => {
    const r = runPasso(['R22.4', '--preparo']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('--preparo');
    const none = runPasso(['--preparo']);
    expect(none.status).toBe(2);
  });

  it('a guide that does not exist exits 2 and says how to generate it', () => {
    const r = runPasso(['R0'], { APOIO: path.join(apoio, 'nothing') });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('round-guide.mjs');
  });
});

// Stage #1533 (TE1, decision 2): `cloud.mjs secao` prints a section of the round guide, without opening Chrome.
describe('cloud.mjs secao (#1533, TE1)', () => {
  let apoio: string;

  beforeAll(() => {
    apoio = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-secao-'));
    const guide = spawnSync('node', ['scripts/testing/round-guide.mjs', 'R0'], {
      encoding: 'utf8',
    });
    writeFileSync(path.join(apoio, 'guia.md'), guide.stdout);
  });

  afterAll(() => rmSync(apoio, { recursive: true, force: true }));

  function secao(
    args: string[],
    env: Record<string, string | undefined> = { APOIO: apoio },
  ) {
    const r = spawnSync('node', ['scripts/testing/cloud.mjs', 'secao', ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  it('secao 7 prints section 7 and only it', () => {
    const r = secao(['7']);
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith('## 7. How to report a problem')).toBe(true);
    expect(r.stdout).not.toContain('## 8. Test scripts');
  });

  it('secao xyz exits 2 and lists the keys', () => {
    const r = secao(['xyz']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('xyz');
    for (const key of [
      '1',
      '5',
      'A.seletores',
      'B',
      'consulta.grupos',
      'consulta.subagente',
    ]) {
      expect(r.stderr, key).toContain(key);
    }
  });

  it('without a key lists the keys with the size and the "when to read"', () => {
    const r = secao([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^5\b.*\d+.*\S/m);
    expect(r.stdout).toContain('consulta.historico');
  });

  it("the consulta.* keys read the clone's docs/TESTING-NUVEM-CONSULTA.md", () => {
    const r = secao(['consulta.passada']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Visual pass');
  });

  it('--guia points to another file; a guide that does not exist exits 2', () => {
    const r = secao(['1', `--guia=${path.join(apoio, 'guia.md')}`], { APOIO: undefined });
    expect(r.status).toBe(0);
    const bad = secao(['1'], { APOIO: path.join(apoio, 'nothing') });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('round-guide.mjs');
  });
});

// Stage #1533 (TE2, decisions 6 to 8): persistent `run` server, `check`, `runs.log` and `apoio/runs/`.
describe('persistent run server, check and runs.log (stage #1533, TE2)', () => {
  type Mod = {
    startRunServer: (o: {
      apoioDir: string;
      connectFn: () => Promise<unknown>;
      onExit?: () => void;
    }) => Promise<{ close: () => Promise<void> }>;
    runViaServer: (body: string, o: Record<string, unknown>) => Promise<number>;
    temposFromLog: (log: string, runs?: string) => unknown;
    formatTempos: (t: unknown) => string;
  };
  const load = async (): Promise<Mod> => {
    process.env.DISPLAY ??= ':99';
    return (await import('../../scripts/testing/cloud.mjs')) as unknown as Mod;
  };
  const dom = {
    title: 'Mapping',
    url: 'http://localhost:8080/',
    dialogs: [],
    notices: [],
    saveStatus: null,
    focus: null,
  };

  let apoio: string;
  let servers: { close: () => Promise<void> }[];
  let exits: number;
  let connections: { connected: boolean }[];
  let spawned: number;

  beforeEach(() => {
    apoio = mkdtempSync(path.join(tmpdir(), 'mapping-srv-'));
    servers = [];
    exits = 0;
    connections = [];
    spawned = 0;
  });
  afterEach(async () => {
    for (const s of servers) await s.close().catch(() => {});
    rmSync(apoio, { recursive: true, force: true });
  });

  const connectFn = async () => {
    const conn = { connected: true };
    connections.push(conn);
    return {
      browser: { close: async () => {}, isConnected: () => conn.connected },
      page: { evaluate: async () => dom, isClosed: () => false },
    };
  };

  async function run(body: string, extra: Record<string, unknown> = {}) {
    const mod = await load();
    const out: string[] = [];
    const err: string[] = [];
    const code = await mod.runViaServer(body, {
      apoioDir: apoio,
      io: { log: (m: string) => out.push(m), error: (m: string) => err.push(m) },
      spawnServer: async () => {
        spawned += 1;
        servers.push(
          await mod.startRunServer({
            apoioDir: apoio,
            connectFn,
            onExit: () => {
              exits += 1;
            },
          }),
        );
      },
      ...extra,
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  it('two runs in a row use the same connection and see the same ctx', async () => {
    const a = await run('ctx.n = 41; console.log("one")');
    const b = await run('console.log("n=" + (ctx.n + 1))');
    expect([a.code, b.code]).toEqual([0, 0]);
    expect(a.out).toContain('one');
    expect(b.out).toContain('n=42');
    expect(connections).toHaveLength(1);
    expect(spawned).toBe(1);
  });

  it('a deadline exceeded exits 124, the server exits and the next run starts another (empty ctx)', async () => {
    await run('ctx.n = 1');
    const slow = await run('await new Promise(() => {})', { prazoSeconds: 0.05 });
    expect(slow.code).toBe(124);
    expect(slow.err).toContain('deadline of 0.05 s exceeded in the step');
    expect(exits).toBe(1);
    const next = await run('console.log("ctx=" + JSON.stringify(ctx))');
    expect(next.code).toBe(0);
    expect(next.out).toContain('ctx={}');
    expect(spawned).toBe(2);
    expect(connections).toHaveLength(2);
  });

  it('a dropped connection reconnects on the next run, with the warning and an empty ctx', async () => {
    await run('ctx.n = 1');
    connections[0]!.connected = false;
    const b = await run('console.log("ctx=" + JSON.stringify(ctx))');
    expect(b.code).toBe(0);
    expect(b.out).toContain('ctx={}');
    expect(b.err).toMatch(/warning: .*reconnected/);
    expect(connections).toHaveLength(2);
    expect(spawned).toBe(1);
  });

  it('run --novo restarts the server', async () => {
    await run('ctx.n = 1');
    const b = await run('console.log("ctx=" + JSON.stringify(ctx))', { novo: true });
    expect(b.out).toContain('ctx={}');
    expect(spawned).toBe(2);
  });

  it('one run at a time: the second waits for the first', async () => {
    const order: string[] = [];
    const first = run(
      'await new Promise((r) => setTimeout(r, 120)); ctx.log = (ctx.log ?? []).concat("a")',
    ).then((r) => (order.push('a'), r));
    await new Promise((r) => setTimeout(r, 30));
    const second = run('console.log("log=" + ctx.log)').then((r) => (order.push('b'), r));
    const [, b] = await Promise.all([first, second]);
    expect(order).toEqual(['a', 'b']);
    expect(b.out).toContain('log=a');
  });

  it('with no server that starts, falls back to the direct path and warns', async () => {
    const r = await run('console.log("direto")', {
      spawnServer: async () => {},
      socketWaitMs: 100,
      connectFn,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('direto');
    expect(r.err).toMatch(/warning: .*run server/);
  });

  it('a lost response (the server dropped mid-run) does not repeat the body on another server', async () => {
    const net = await import('node:net');
    let requests = 0;
    const raw = net.createServer((socket) => {
      socket.on('data', () => {
        requests += 1;
        socket.destroy();
      });
    });
    await new Promise<void>((resolve) =>
      raw.listen(path.join(apoio, 'cloud.sock'), resolve),
    );
    try {
      const r = await run('1');
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/run server dropped/);
      expect(requests).toBe(1);
      expect(spawned).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('the body and the output with accents go through whole even above a socket chunk', async () => {
    const filler = 'ãé✅'.repeat(60000);
    const r = await run(`/* ${filler} */ console.log("end ${'ç'.repeat(70000)}")`);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`end ${'ç'.repeat(70000)}`);
    expect(readFileSync(path.join(apoio, 'runs', '1.js'), 'utf8')).toContain(filler);
  });

  it('a run queued behind an exceeded deadline gets the error and its body does not run', async () => {
    const slow = run('await new Promise(() => {})', { prazoSeconds: 0.3 });
    await new Promise((r) => setTimeout(r, 50));
    const queued = await run('globalThis.__mustNotRun = true');
    expect((await slow).code).toBe(124);
    expect(queued.code).toBe(1);
    expect(queued.err).toMatch(/deadline|exited/);
    expect((globalThis as { __mustNotRun?: boolean }).__mustNotRun).toBeUndefined();
  });

  it('a second server in the same folder does not start (the first stays up)', async () => {
    const mod = await load();
    await run('ctx.n = 1');
    await expect(
      mod.startRunServer({ apoioDir: apoio, connectFn, onExit: () => {} }),
    ).rejects.toThrow(/a run server already exists/);
    const b = await run('console.log("n=" + ctx.n)');
    expect(b.out).toContain('n=1');
  });

  it('paletteDrag in the run body uses the run folder and, without it, the last remembered folder', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'mapping-srv-proj-'));
    try {
      mkdirSync(path.join(apoio, 'state'), { recursive: true });
      writeFileSync(path.join(apoio, 'state', 'ultima-pasta.txt'), project);
      const body = `try { await paletteDrag(page, 'X', { x: 1, y: 1 }); } catch (e) { console.log('ERROR ' + e.message); }`;
      const remembered = await run(body);
      expect(remembered.out).toContain('ERROR');
      expect(remembered.out).not.toContain('needs the project folder');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
    rmSync(path.join(apoio, 'state'), { recursive: true, force: true });
    const without = await run(
      `try { await paletteDrag(page, 'X', { x: 1, y: 1 }); } catch (e) { console.log('ERROR ' + e.message); }`,
    );
    expect(without.out).toContain('ERROR paletteDrag needs the project folder');
  });

  describe('check', () => {
    it('a failing check does not interrupt the body, one line per check comes out before the state and the run exits 1', async () => {
      const r = await run(`
        check('R4.2', true);
        check('R4.3', false, 'missing the notice');
        check('R4.4', async () => { throw new Error('could not find the button'); });
        check('R4.5', () => true);
        check('R4.6', Promise.resolve(true));
        check('R4.7', () => false);
        console.log('body went on');
      `);
      expect(r.code).toBe(1);
      const lines = r.out.split('\n');
      expect(lines).toContain('body went on');
      expect(lines).toContain('✅ R4.2');
      expect(lines).toContain('❌ R4.3 — missing the notice');
      expect(lines).toContain('❌ R4.4 — could not find the button');
      expect(lines).toContain('✅ R4.5');
      expect(lines).toContain('✅ R4.6');
      expect(lines.find((l) => l.startsWith('❌ R4.7'))).toMatch(/condition false/);
      const stateAt = lines.findIndex((l) => l.includes('Mapping'));
      expect(stateAt).toBeGreaterThan(lines.indexOf('❌ R4.7 — condition false'));
      expect(lines.indexOf('body went on')).toBeLessThan(lines.indexOf('✅ R4.2'));
    });

    it('a body that throws or exceeds the deadline still prints the pending checks', async () => {
      const r = await run(`
        check('R9.1', async () => { await new Promise((r) => setTimeout(r, 30)); return false; }, 'late');
        throw new Error('broke later');
      `);
      expect(r.code).toBe(1);
      expect(r.out).toContain('❌ R9.1 — late');
      expect(readFileSync(path.join(apoio, 'runs.log'), 'utf8')).toMatch(
        /checks=1 falhas=1/,
      );
    });

    it('all passing: the run exits 0; a check without await is also awaited', async () => {
      const r = await run(
        `check('ok', async () => { await new Promise((r) => setTimeout(r, 30)); return true; })`,
      );
      expect(r.code).toBe(0);
      expect(r.out).toContain('✅ ok');
    });
  });

  describe('runs.log and apoio/runs/', () => {
    it('each run writes a line to runs.log and the body and output to runs/<n>.js and .out', async () => {
      await run(`check('a', true); console.log('first')`);
      await run(`check('b', false, 'x'); check('c', true)`);
      const log = readFileSync(path.join(apoio, 'runs.log'), 'utf8').trim().split('\n');
      expect(log).toHaveLength(2);
      expect(log[0]).toMatch(
        /^\d{4}-\d\d-\d\dT[\d:.]+Z run=1 codigo=0 checks=1 falhas=0$/,
      );
      expect(log[1]).toMatch(/ run=2 codigo=1 checks=2 falhas=1$/);
      expect(readFileSync(path.join(apoio, 'runs', '1.js'), 'utf8')).toContain(
        "console.log('first')",
      );
      expect(readFileSync(path.join(apoio, 'runs', '1.out'), 'utf8')).toContain('first');
      expect(readFileSync(path.join(apoio, 'runs', '2.out'), 'utf8')).toContain(
        '❌ b — x',
      );
    });

    it('the counter continues after a new server', async () => {
      await run('1');
      await run('await new Promise(() => {})', { prazoSeconds: 0.05 });
      await run('1');
      expect(readdirSync(path.join(apoio, 'runs')).sort()).toEqual([
        '1.js',
        '1.out',
        '2.js',
        '2.out',
        '3.js',
        '3.out',
      ]);
    });

    it('the fallback path also records', async () => {
      await run('1', { spawnServer: async () => {}, socketWaitMs: 50, connectFn });
      expect(readFileSync(path.join(apoio, 'runs.log'), 'utf8')).toMatch(
        /run=1 codigo=0/,
      );
    });
  });

  describe('tempos with runs and checks', () => {
    it('counts the runs and checks of each script by the marks in tempos.log', async () => {
      const mod = await load();
      const tempos = [
        'R4 start 2026-11-11T10:00:00.000Z',
        'R4 end 2026-11-11T10:10:00.000Z',
        'R5 start 2026-11-11T10:10:30.000Z',
        'R5 end 2026-11-11T10:20:00.000Z',
      ].join('\n');
      const runs = [
        '2026-11-11T10:01:00.000Z run=1 codigo=0 checks=3 falhas=0',
        '2026-11-11T10:02:00.000Z run=2 codigo=1 checks=2 falhas=1',
        '2026-11-11T10:15:00.000Z run=3 codigo=0 checks=4 falhas=0',
        '2026-11-11T10:30:00.000Z run=4 codigo=0 checks=9 falhas=0',
      ].join('\n');
      const out = mod.formatTempos(mod.temposFromLog(tempos, runs));
      expect(out).toMatch(/R4 +10min00s +2 run, 5 checks/);
      expect(out).toMatch(/R5 +9min30s +1 run, 4 checks/);
      expect(out).toMatch(/total +19min30s +3 run, 9 checks/);
      // Without runs.log the earlier text does not change.
      expect(mod.formatTempos(mod.temposFromLog(tempos))).not.toMatch(/run/);
    });
  });

  it('cloud-up.sh --restart-chrome stops the run server before closing Chrome', () => {
    const up = read(CLOUD_UP);
    const stop = up.indexOf('"$S/cloud.pid"');
    expect(stop).toBeGreaterThan(-1);
    expect(up.indexOf('Browser.close')).toBeGreaterThan(stop);
    expect(up).toContain('"$S/cloud.sock"');
  });
});

// Stage #1533 (TE3, decision 12): package pre-check with retry and exit code 14.
describe('cloud-up.sh --check-packages (stage #1533, TE3)', () => {
  const BASIC = [
    'bash',
    'sh',
    'cat',
    'dirname',
    'mkdir',
    'sleep',
    'seq',
    'grep',
    'tr',
    'id',
    'printf',
    'echo',
    'rm',
    'touch',
    'head',
    'tail',
    'wc',
    'sed',
    'env',
    'date',
    'node',
  ];
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cloud-up-'));
    mkdirSync(path.join(dir, 'bin'));
    for (const name of BASIC) {
      const found = spawnSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf8' });
      const target = found.stdout.trim();
      if (target) symlinkSync(target, path.join(dir, 'bin', name));
    }
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A fake command: `body` is the script body. */
  function fake(name: string, body = 'exit 0'): void {
    const file = path.join(dir, 'bin', name);
    writeFileSync(file, `#!/bin/bash\n${body}\n`);
    chmodSync(file, 0o755);
  }

  /** Everything installed, except what `missing` lists. */
  function setup(missing: string[], { chrome = true } = {}): void {
    for (const name of ['xdotool', 'openbox', 'import', 'python3']) {
      if (!missing.includes(name)) fake(name);
    }
    fake('sudo', 'if [ "$1" = -n ]; then shift; fi; exec "$@"');
    writeFileSync(path.join(dir, 'launcher'), '');
    if (chrome) writeFileSync(path.join(dir, 'chromium'), '');
  }

  /** Fake `apt-get`: fails `fails` times and installs on the next one (creates `xdotool`). */
  function fakeApt(fails: number): void {
    const counter = path.join(dir, 'apt-count');
    fake(
      'apt-get',
      `n=$(cat "${counter}" 2>/dev/null || echo 0); n=$((n+1)); echo $n >"${counter}"
echo "apt-get $*" >>"${dir}/apt-log"
if [ "$n" -le ${fails} ]; then exit 100; fi
[ "$1" = install ] && printf '#!/bin/bash\\nexit 0\\n' >"${dir}/bin/xdotool" && chmod +x "${dir}/bin/xdotool"
exit 0`,
    );
  }

  function checkPackages(extraEnv: Record<string, string> = {}): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    const r = spawnSync('bash', [CLOUD_UP, path.join(dir, 'round'), '--check-packages'], {
      env: {
        PATH: path.join(dir, 'bin'),
        HOME: dir,
        CLOUD_UP_RETRY_SLEEP: '0',
        CLOUD_UP_ATSPI_LAUNCHER: path.join(dir, 'launcher'),
        CLOUD_UP_CHROME: path.join(dir, 'chromium'),
        ...extraEnv,
      },
      encoding: 'utf8',
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  it('everything installed: exits 0 without calling apt-get', () => {
    setup([]);
    fakeApt(0);
    const r = checkPackages();
    expect(r.status).toBe(0);
    expect(existsSync(path.join(dir, 'apt-log'))).toBe(false);
  });

  it('xdotool missing: apt-get fails twice, installs on the third and exits 0', () => {
    setup(['xdotool']);
    fakeApt(2);
    const r = checkPackages();
    expect(r.stderr).toBe(r.stderr);
    expect(r.status).toBe(0);
    const log = readFileSync(path.join(dir, 'apt-log'), 'utf8');
    expect(log.match(/apt-get update/g)).toHaveLength(3);
    expect(log).toContain(
      'install -y -q xdotool at-spi2-core python3-pyatspi openbox imagemagick',
    );
  });

  it('apt-get always fails: exits 14 with the list of what is missing', () => {
    setup(['xdotool', 'openbox']);
    fakeApt(99);
    const r = checkPackages();
    expect(r.status).toBe(14);
    expect(r.stderr).toMatch(/xdotool/);
    expect(r.stderr).toMatch(/openbox/);
    expect(r.stderr).not.toMatch(/imagemagick|chromium/);
    const log = readFileSync(path.join(dir, 'apt-log'), 'utf8');
    expect(log.match(/apt-get update/g)).toHaveLength(5);
  });

  it('pyatspi only exists in /usr/bin/python3.12 (the PATH python3 does not load it): exits 0 without apt-get (finding 4.1)', () => {
    setup([]);
    fake('python3', 'exit 1');
    fake('python312', 'exit 0');
    fakeApt(0);
    const r = checkPackages({ CLOUD_UP_PYTHON: path.join(dir, 'bin', 'python312') });
    expect(r.status).toBe(0);
    expect(existsSync(path.join(dir, 'apt-log'))).toBe(false);
  });

  it('without pyatspi in any python: exits 14 and lists python3 pyatspi', () => {
    setup([]);
    fake('python3', 'exit 1');
    fake('python312', 'exit 1');
    fakeApt(99);
    const r = checkPackages({ CLOUD_UP_PYTHON: path.join(dir, 'bin', 'python312') });
    expect(r.status).toBe(14);
    expect(r.stderr).toMatch(/python3 pyatspi/);
  });

  it('without Chrome: exits 14 right away, without calling apt-get', () => {
    setup([], { chrome: false });
    fakeApt(0);
    const r = checkPackages();
    expect(r.status).toBe(14);
    expect(r.stderr).toContain('chromium');
    expect(existsSync(path.join(dir, 'apt-log'))).toBe(false);
  });
});

describe('cloud.mjs passo: item outside the round guide (stage #1533, TE3, decision 14 (4))', () => {
  let dir = '';
  let guide = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'step-outside-'));
    guide = path.join(dir, 'guia.md');
    spawnSync('node', ['scripts/testing/round-guide.mjs', 'R0', 'R22', '--out', guide]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const runPasso = (...items: string[]) =>
    spawnSync(
      'node',
      ['scripts/testing/cloud.mjs', 'passo', ...items, `--guia=${guide}`],
      {
        encoding: 'utf8',
      },
    );

  it('R12.4 without R12 in the guide prints the step from docs/TESTING.md, with the first line saying so', () => {
    const r = runPasso('R12.4');
    expect(r.status).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines[0]).toBe('outside the round guide (read from docs/TESTING.md)');
    expect(r.stdout).toMatch(/^\| R12\.4 \|/m);
  });

  it('an item from the guide and another from outside come out together, each with its own mark', () => {
    const r = runPasso('R22.4', 'R12.4');
    expect(r.status).toBe(0);
    expect(r.stdout.match(/outside the round guide/g)).toHaveLength(1);
    expect(r.stdout.indexOf('R22.4')).toBeLessThan(r.stdout.indexOf('outside the'));
  });

  it('an item that the whole guide does not have either exits with code 2', () => {
    const r = runPasso('R99.1');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/R99\.1 is not in the round guide/);
    expect(runPasso('R12.999').status).toBe(2);
  });
});

// Stage #1076 (VC2): ponto by the drawn position, onCanvas, viewCenter, arrow handles and `Selection:`.
describe('canvas view for the tester (stage #1076, VC2)', () => {
  type Fn = (...args: unknown[]) => unknown;
  type Mod = Record<
    | 'parseContainerBoxes'
    | 'containerScreenPoint'
    | 'ponto'
    | 'viewCenter'
    | 'parseArrowHandles'
    | 'arrowHandlesOf'
    | 'onCanvas'
    | 'paletteDrag'
    | 'formatState'
    | 'state',
    Fn
  >;
  const load = async (): Promise<Mod> => {
    process.env.DISPLAY ??= ':99';
    return (await import('../../scripts/testing/cloud.mjs')) as unknown as Mod;
  };

  describe('parseContainerBoxes', () => {
    it('returns a Map from id to { x, y, width, height, scale }', async () => {
      const mod = await load();
      const map = mod.parseContainerBoxes('c1 10 20.5 300 200 2;c2 -5 0 100 50 1') as Map<
        string,
        unknown
      >;
      expect([...map.keys()]).toEqual(['c1', 'c2']);
      expect(map.get('c1')).toEqual({
        x: 10,
        y: 20.5,
        width: 300,
        height: 200,
        scale: 2,
      });
      expect(map.get('c2')).toEqual({ x: -5, y: 0, width: 100, height: 50, scale: 1 });
      expect((mod.parseContainerBoxes(null) as Map<string, unknown>).size).toBe(0);
    });

    it('invalid input throws with the text', async () => {
      const mod = await load();
      expect(() => mod.parseContainerBoxes('c1 10 20 300')).toThrow(
        'invalid data-container-boxes: "c1 10 20 300"',
      );
      expect(() => mod.parseContainerBoxes('c1 10 20 300 200 x')).toThrow(
        'invalid data-container-boxes: "c1 10 20 300 200 x"',
      );
    });
  });

  describe('containerScreenPoint with boxes', () => {
    const mapping = {
      containers: [
        { id: 'c1', name: 'Sign-up', placement: { x: 100, y: 50, scale: 2 } },
        { id: 'c2', name: 'Other', placement: { x: 0, y: 0, scale: 1 } },
      ],
      markings: [{ id: 'm1', name: 'Button', containerId: 'c1', rect: { x: 10, y: 20 } }],
      perspectives: [{ name: 'Dev mobile', items: [{ root: 'c1', x: 400, y: 300 }] }],
    };
    const base = { mapping, viewport: '0 0 1', host: { x: 0, y: 0 } };

    it('the boxes position wins over the disk one and over the perspective one', async () => {
      const mod = await load();
      // boxes: x=1000, y=900, scale 4 → canvas = (1000 + 5*4, 900 + 7*4)
      const boxes = 'c1 1000 900 300 200 4';
      expect(
        mod.containerScreenPoint({ ...base, container: 'Sign-up', x: 5, y: 7, boxes }),
      ).toEqual({ x: 1020, y: 928 });
      expect(
        mod.containerScreenPoint({
          ...base,
          container: 'Sign-up',
          x: 5,
          y: 7,
          boxes,
          perspective: 'Dev mobile',
        }),
      ).toEqual({ x: 1020, y: 928 });
    });

    it("the marking uses its container's box", async () => {
      const mod = await load();
      // canvas = (1000 + (10+3)*4, 900 + (20+4)*4) = (1052, 996)
      expect(
        mod.containerScreenPoint({
          ...base,
          container: 'Button',
          x: 3,
          y: 4,
          marking: true,
          boxes: 'c1 1000 900 300 200 4',
        }),
      ).toEqual({ x: 1052, y: 996 });
    });

    it('without the container in boxes, the usual computation applies', async () => {
      const mod = await load();
      expect(
        mod.containerScreenPoint({
          ...base,
          container: 'Sign-up',
          x: 5,
          y: 7,
          boxes: 'c2 1000 900 300 200 4',
        }),
      ).toEqual({ x: 110, y: 64 });
      expect(
        mod.containerScreenPoint({
          ...base,
          container: 'Sign-up',
          x: 5,
          y: 7,
          boxes: '',
          perspective: 'Dev mobile',
        }),
      ).toEqual({ x: 410, y: 314 });
    });

    it('warns when the requested perspective differs from the drawn one', async () => {
      const mod = await load();
      const warnings: string[] = [];
      mod.containerScreenPoint({
        ...base,
        container: 'Sign-up',
        x: 0,
        y: 0,
        boxes: 'c1 1000 900 300 200 4',
        perspective: 'Dev mobile',
        warn: (m: string) => warnings.push(m),
      });
      expect(warnings).toEqual([
        'perspective Dev mobile is not the drawn one; the drawn position wins',
      ]);
      const same: string[] = [];
      mod.containerScreenPoint({
        ...base,
        container: 'Sign-up',
        x: 0,
        y: 0,
        boxes: 'c1 400 300 300 200 4',
        perspective: 'Dev mobile',
        warn: (m: string) => same.push(m),
      });
      expect(same).toEqual([]);
    });
  });

  describe('ponto (fake page)', () => {
    const cleanup: string[] = [];
    afterEach(() => {
      for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
    });
    function fakePage(onCanvas: { ok: boolean; element: string }) {
      const attrs: Record<string, string | null> = {
        'data-viewport': '0 0 1',
        'data-container-boxes': 'c1 1000 900 300 200 4',
      };
      return {
        locator: () => ({
          getAttribute: async (name: string) => attrs[name] ?? null,
          boundingBox: async () => ({ x: 10, y: 20, width: 800, height: 600 }),
        }),
        evaluate: async (_fn: unknown, arg?: Record<string, unknown>) =>
          arg && 'x' in arg && 'y' in arg ? onCanvas : null,
      };
    }
    function project() {
      const dir = mkdtempSync(path.join(tmpdir(), 'mapping-ponto-'));
      cleanup.push(dir);
      writeFileSync(
        path.join(dir, 'mapping.json'),
        JSON.stringify({
          containers: [
            { id: 'c1', name: 'Sign-up', placement: { x: 100, y: 50, scale: 2 } },
          ],
          markings: [],
          perspectives: [{ name: 'Dev', items: [{ root: 'c1', x: 400, y: 300 }] }],
        }),
      );
      return dir;
    }

    it('uses the drawn position and warns when the perspective is another', async () => {
      const mod = await load();
      const warnings: string[] = [];
      const at = await mod.ponto(
        fakePage({ ok: true, element: 'canvas' }),
        project(),
        'Sign-up',
        5,
        7,
        { perspective: 'Dev', warn: (m: string) => warnings.push(m) },
      );
      expect(at).toEqual({ x: 10 + 1020, y: 20 + 928 });
      expect(warnings).toEqual([
        'perspective Dev is not the drawn one; the drawn position wins',
      ]);
    });

    it('a point outside the canvas warns, with the host box, and returns the point', async () => {
      const mod = await load();
      const warnings: string[] = [];
      const at = await mod.ponto(
        fakePage({ ok: false, element: 'div.dock "Windows"' }),
        project(),
        'Sign-up',
        5,
        7,
        { warn: (m: string) => warnings.push(m) },
      );
      expect(at).toEqual({ x: 1030, y: 948 });
      expect(warnings.join('\n')).toContain(
        'the point (1030, 948) does not fall on the canvas (div.dock "Windows")',
      );
      expect(warnings.join('\n')).toContain('10, 20, 800 × 600');
    });
  });

  describe('viewCenter', () => {
    it('gives the screen point of the host center and the same point on the canvas', async () => {
      const mod = await load();
      const page = {
        locator: () => ({
          getAttribute: async () => '100 50 2',
          boundingBox: async () => ({ x: 10, y: 20, width: 800, height: 600 }),
        }),
        evaluate: async () => null,
      };
      expect(await mod.viewCenter(page)).toEqual({
        x: 410,
        y: 320,
        canvas: { x: 150, y: 125 },
      });
    });
  });

  describe('parseArrowHandles and arrowHandlesOf', () => {
    it('adds the host corner to each handle', async () => {
      const mod = await load();
      expect(
        mod.parseArrowHandles('center 50 60;from 10.5 20;to 90 100', { x: 100, y: 200 }),
      ).toEqual({
        center: { x: 150, y: 260 },
        from: { x: 110.5, y: 220 },
        to: { x: 190, y: 300 },
      });
      expect(() => mod.parseArrowHandles('center 50', { x: 0, y: 0 })).toThrow(
        'invalid data-arrow-handles: "center 50"',
      );
    });

    it('arrowHandlesOf without the attribute returns null; with it, the screen points', async () => {
      const mod = await load();
      const make = (text: string | null) => ({
        locator: () => ({
          getAttribute: async () => text,
          boundingBox: async () => ({ x: 10, y: 20, width: 800, height: 600 }),
        }),
        evaluate: async () => null,
      });
      expect(await mod.arrowHandlesOf(make(null))).toBeNull();
      expect(await mod.arrowHandlesOf(make('center 1 2;to 3 4'))).toEqual({
        center: { x: 11, y: 22 },
        to: { x: 13, y: 24 },
      });
    });
  });

  describe('onCanvas', () => {
    it('returns { ok, element } from the check made on the page', async () => {
      const mod = await load();
      const seen: unknown[] = [];
      const page = {
        evaluate: async (_fn: unknown, arg: unknown) => {
          seen.push(arg);
          return { ok: false, element: 'div.dock' };
        },
      };
      expect(await mod.onCanvas(page, { x: 5, y: 6 })).toEqual({
        ok: false,
        element: 'div.dock',
      });
      expect(seen).toEqual([{ x: 5, y: 6 }]);
    });
  });

  describe('paletteDrag uses the same point-on-canvas check', () => {
    it('a point outside the canvas throws before the synthetic drag', async () => {
      const mod = await load();
      const project = mkdtempSync(path.join(tmpdir(), 'mapping-palette-onc-'));
      try {
        writeFileSync(
          path.join(project, 'mapping.json'),
          JSON.stringify({ markings: [{ id: 'm1' }] }),
        );
        const fired: string[] = [];
        const item = {
          scrollIntoViewIfNeeded: async () => undefined,
          boundingBox: async () => ({ x: 10, y: 100, width: 200, height: 40 }),
        };
        const page = {
          mouse: {
            move: async () => undefined,
            down: async () => undefined,
            up: async () => undefined,
          },
          locator: () => ({
            filter: () => item,
            getByText: () => ({}),
            getAttribute: async () => '0',
            screenshot: async () => undefined,
          }),
          evaluate: async (_fn: unknown, arg: Record<string, unknown>) => {
            if (arg && 'timeoutMs' in arg) return null;
            if (arg && 'to' in arg) {
              fired.push('sintetico');
              return { ok: true };
            }
            if (arg && 'x' in arg) return { ok: false, element: 'div.dock' };
            return ['Library'];
          },
        };
        await expect(
          mod.paletteDrag(
            page,
            'Button',
            { x: 500, y: 300 },
            {
              steps: 1,
              projectDir: project,
              waitMs: 20,
            },
          ),
        ).rejects.toThrow(
          'paletteDrag: the point (500, 300) does not fall on the canvas (div.dock)',
        );
        expect(fired).toEqual([]);
      } finally {
        rmSync(project, { recursive: true, force: true });
      }
    });
  });

  describe('formatState: Selection line', () => {
    const base = {
      title: 'Mapping',
      url: 'x',
      dialogs: [],
      notices: [],
      saveStatus: null,
      focus: null,
      windows: [],
    };
    it('with the name coming from the disk', async () => {
      const mod = await load();
      const text = (selection: unknown) =>
        mod.formatState({ ...base, selection }) as string;
      expect(text({ type: 'marking', id: 'm1', name: 'Side' })).toContain(
        'Selection: marking "Side" (m1)',
      );
      expect(text({ type: 'arrow', id: 'a1', name: 'A → B' })).toContain(
        'Selection: arrow "A → B" (a1)',
      );
      expect(text({ type: 'image', id: 'c1', name: 'Screen' })).toContain(
        'Selection: container "Screen" (c1)',
      );
      expect(text(null)).toContain('Selection: none');
    });
    it('comes after Focus; without the disk, shows the type and the id; without the field, does not print', async () => {
      const mod = await load();
      const lines = (
        mod.formatState({
          ...base,
          selection: { type: 'marking', id: 'm1' },
        }) as string
      ).split('\n');
      const focus = lines.findIndex((l) => l.startsWith('Focus:'));
      expect(lines[focus + 1]).toBe('Selection: marking m1');
      expect(mod.formatState(base) as string).not.toContain('Selection:');
    });
  });

  describe('state() reads the selection', () => {
    const run = async (selection: string | null, mapping: object | null) => {
      const mod = await load();
      const apoio = mkdtempSync(path.join(tmpdir(), 'mapping-sel-apoio-'));
      const project = mkdtempSync(path.join(tmpdir(), 'mapping-sel-proj-'));
      try {
        if (mapping) {
          writeFileSync(path.join(project, 'mapping.json'), JSON.stringify(mapping));
        }
        const page = {
          evaluate: async (_fn: unknown, arg: unknown) =>
            arg && typeof arg === 'object' && 'timeoutMs' in arg
              ? null
              : {
                  title: 't',
                  url: 'u',
                  dialogs: [],
                  notices: [],
                  saveStatus: null,
                  focus: null,
                  selection,
                },
        };
        const result = (await mod.state(
          page,
          apoio,
          mapping ? { projectDir: project } : { projectDir: null },
        )) as { selection: unknown };
        return result.selection;
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(project, { recursive: true, force: true });
      }
    };
    const mapping = {
      revision: 1,
      containers: [{ id: 'c1', name: 'Screen' }],
      markings: [
        { id: 'm1', name: 'Side' },
        { id: 'm2', name: null },
      ],
      arrows: [{ id: 'a1', from: 'm1', to: 'm2' }],
    };

    it('resolves the name from the mapping.json read', async () => {
      expect(await run('marking m1', mapping)).toEqual({
        type: 'marking',
        id: 'm1',
        name: 'Side',
      });
      expect(await run('marking m2', mapping)).toEqual({
        type: 'marking',
        id: 'm2',
        name: 'No name',
      });
      expect(await run('image c1', mapping)).toEqual({
        type: 'image',
        id: 'c1',
        name: 'Screen',
      });
      expect(await run('arrow a1', mapping)).toEqual({
        type: 'arrow',
        id: 'a1',
        name: 'Side → No name',
      });
    });

    it('without a folder or with an id missing from the disk, only the type and the id remain; without a selection, null', async () => {
      expect(await run('marking m1', null)).toEqual({ type: 'marking', id: 'm1' });
      expect(await run('marking zz', mapping)).toEqual({ type: 'marking', id: 'zz' });
      expect(await run(null, mapping)).toBeNull();
    });
  });
});
