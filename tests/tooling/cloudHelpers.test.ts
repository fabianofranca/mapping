// @vitest-environment node
// Fase TR1 (etapa #359): os auxiliares da nuvem em `scripts/testing/` (decisão 2) existem, o
// `cloud.mjs` importa sem efeito colateral e exporta os nomes certos, o guia aponta para eles
// (decisão 4) e a parte pura de `cloud.mjs` (`mark`) tem teste unitário.
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

/** Linhas de código, sem as que são só comentário (`#`, `//` ou `"""`/`'''` de docstring). */
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
  'setViewport',
  'find',
  'formatCandidates',
  'locatorTextFromError',
].sort();

describe('scripts/testing/: auxiliares da nuvem (TR1)', () => {
  it('os três auxiliares existem', () => {
    for (const file of HELPERS) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('cloud.mjs importa sem efeito colateral e exporta os nomes da decisão 2', async () => {
    const mod: Record<string, unknown> = await import('../../scripts/testing/cloud.mjs');
    expect(Object.keys(mod).sort()).toEqual(EXPECTED_EXPORTS);
  });

  it('nenhum auxiliar registra listener de filechooser nem usa setInputFiles (código, fora de comentário)', () => {
    for (const file of HELPERS) {
      const code = codeLines(read(file));
      expect(code, file).not.toMatch(/filechooser/i);
      expect(code, file).not.toContain('setInputFiles');
    }
  });

  it('cloud-up.sh nunca roda pkill -f chrome como comando (fecha pelo CDP, receita 3)', () => {
    expect(codeLines(read(CLOUD_UP))).not.toContain('pkill -f chrome');
    expect(read(CLOUD_UP)).toContain('Browser.close');
  });

  it('cloud-up.sh: nenhum subshell em segundo plano segura o pipe de quem o chamou (TS1, decisão 5)', () => {
    const lines = codeLines(read(CLOUD_UP)).split('\n');
    // `(cd dist && … &)`: a redireção de dentro só vale para o comando, e o subshell que o espera
    // fica com o stdout do script (o `| tail` nunca fecha). A redireção vai no grupo todo.
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

  describe('containerScreenPoint (auxiliar ponto, etapa #841 RB2)', () => {
    const mapping = {
      containers: [
        { id: 'c1', name: 'Cadastro', placement: { x: 100, y: 50, scale: 2 } },
        { id: 'c2', name: 'Outro', placement: { x: 0, y: 0, scale: 1 } },
      ],
      markings: [
        { id: 'm1', name: 'Botão', containerId: 'c1', rect: { x: 10, y: 20 } },
        { id: 'm2', name: 'Solta', containerId: null, rect: { x: 5, y: 6 } },
      ],
      perspectives: [{ name: 'Dev mobile', items: [{ root: 'c1', x: 400, y: 300 }] }],
    };
    const host = { x: 10, y: 20 };

    it('converte o ponto do container em ponto de tela e acompanha o zoom', async () => {
      const mod = await import('../../scripts/testing/cloud.mjs');
      // canvas = (100 + 5*2, 50 + 7*2) = (110, 64)
      expect(
        mod.containerScreenPoint({
          mapping,
          container: 'cadastro',
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

    it('container com name nulo (imagem do seletor) não derruba a busca por id ou nome', async () => {
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
      expect(point('cadastro')).toEqual({ x: 10 + 102, y: 20 + 52 });
      expect(point('m3', true)).toEqual({ x: 10 + 102, y: 20 + 52 });
    });

    it('com marcacao, soma o canto da marcação e a colocação do container dela', async () => {
      const mod = await import('../../scripts/testing/cloud.mjs');
      // canvas = (100 + (10+3)*2, 50 + (20+4)*2) = (126, 98)
      expect(
        mod.containerScreenPoint({
          mapping,
          container: 'Botão',
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

    it('usa a posição da perspectiva e recusa container inexistente ou vista inválida', async () => {
      const mod = await import('../../scripts/testing/cloud.mjs');
      expect(
        mod.containerScreenPoint({
          mapping,
          container: 'Cadastro',
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
          container: 'Cadastro',
          x: 0,
          y: 0,
          viewport: '0 0 1',
          host,
          ...over,
        });
      expect(bad({ container: 'Nada' })).toThrow('container não encontrado');
      expect(bad({ viewport: 'a b c' })).toThrow('data-viewport inválido');
      expect(bad({ perspective: 'Nenhuma' })).toThrow('perspectiva não encontrada');
    });
  });

  describe('mark (parte pura de cloud.mjs)', () => {
    let apoioDir: string;

    afterEach(() => {
      if (apoioDir) rmSync(apoioDir, { recursive: true, force: true });
    });

    it('acrescenta "<roteiro> <fase> <hora UTC ISO 8601>" a tempos.log', async () => {
      apoioDir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-mark-'));
      const { mark } = await import('../../scripts/testing/cloud.mjs');
      mark(apoioDir, 'ambiente', 'start');
      mark(apoioDir, 'ambiente', 'end');
      const lines = read(path.join(apoioDir, 'tempos.log')).trim().split('\n');
      expect(lines).toHaveLength(2);
      const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      const [roteiro1, fase1, hora1] = lines[0]!.split(' ');
      expect(roteiro1).toBe('ambiente');
      expect(fase1).toBe('start');
      expect(hora1).toMatch(iso);
      const [, fase2, hora2] = lines[1]!.split(' ');
      expect(fase2).toBe('end');
      expect(hora2).toMatch(iso);
      // Ordem cronológica: start antes de end.
      expect(Date.parse(hora1!)).toBeLessThanOrEqual(Date.parse(hora2!));
    });

    it('tempos: duração do primeiro start ao último end, aviso de marca repetida e "tempo não medido"', async () => {
      const { temposFromLog, formatTempos } =
        await import('../../scripts/testing/cloud.mjs');
      const log = [
        'ambiente start 2026-11-04T10:00:00.000Z',
        'ambiente end 2026-11-04T10:02:15.000Z',
        'R0 start 2026-11-04T10:03:00.000Z',
        'R0 end 2026-11-04T10:12:42.000Z',
        // R1 com marcas repetidas: vale o primeiro start e o último end.
        'R1 start 2026-11-04T10:13:00.000Z',
        'R1 start 2026-11-04T10:14:00.000Z',
        'R1 end 2026-11-04T10:20:00.000Z',
        'R1 end 2026-11-04T10:26:30.000Z',
        // secao6 sem o end e visual sem o start: tempo não medido.
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
      expect(out).toMatch(/secao6\s+tempo não medido/);
      expect(out).toMatch(/visual\s+tempo não medido/);
      expect(out).toMatch(/total\s+25min27s/);
      expect(out).toMatch(/aviso.*R1/i);
    });

    it('tempos: sem o arquivo, a CLI avisa "tempo não medido"', async () => {
      apoioDir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-tempos-'));
      const { temposFromDir, formatTempos } =
        await import('../../scripts/testing/cloud.mjs');
      expect(formatTempos(temposFromDir(apoioDir))).toMatch(/tempo não medido/);
    });

    it('rejeita uma fase que não seja start/end', async () => {
      apoioDir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-mark-'));
      const { mark } = await import('../../scripts/testing/cloud.mjs');
      // Valor fora de "start" | "end" só é possível em runtime (ex.: argumento da CLI); o
      // `as unknown` imita isso sem usar `any`.
      const fase = 'meio' as unknown as 'start' | 'end';
      expect(() => mark(apoioDir, 'ambiente', fase)).toThrow();
      expect(existsSync(path.join(apoioDir, 'tempos.log'))).toBe(false);
    });
  });
});

describe('waitForWindow (etapa #405, decisão 2)', () => {
  it('devolve o id quando a janela aparece na 3ª tentativa', async () => {
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

  it('lança depois do prazo, com os títulos esperados e o título da janela ativa', async () => {
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
    expect(message).not.toContain('aba ativa da janela não é a da app');
  });

  it('com outra aba ativa, a mensagem traz a frase das duas abas', async () => {
    const { waitForWindow } = await import('../../scripts/testing/cloud.mjs');
    const error = await waitForWindow(['Abrir arquivos'], {
      timeoutMs: 30,
      stepMs: 5,
      find: () => null,
      activeTitle: () => 'Guia do Mapping: Google Chrome for Testing',
    }).catch((e: unknown) => e);
    expect((error as Error).message).toContain(
      'a aba ativa da janela não é a da app; o seletor nativo só abre com ela em foco no sistema (feche a outra aba)',
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

describe('clickNoWait (etapa #405, decisão 3)', () => {
  it('com 2 candidatos lança com o nome, a contagem e a dica, sem clicar', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const fake = fakePage({ page: 2, scope: 1 });
    const error = await clickNoWait(fake.page, 'Adicionar imagens').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('Adicionar imagens');
    expect(message).toContain('2');
    expect(message).toContain('passe `scope` (um container) ou `exact: true`');
    expect(fake.clicks).toEqual([]);
  });

  it('com 0 candidatos também lança, sem clicar', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const fake = fakePage({ page: 0, scope: 0 });
    await expect(clickNoWait(fake.page, 'Nada')).rejects.toThrow(/0/);
    expect(fake.clicks).toEqual([]);
  });

  it('com 1 candidato clica com noWaitAfter', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const fake = fakePage({ page: 1, scope: 1 });
    await clickNoWait(fake.page, 'Abrir pasta');
    expect(fake.clicks).toEqual([{ where: 'page', options: { noWaitAfter: true } }]);
  });

  it('exact é repassado ao getByRole', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const fake = fakePage({ page: 1, scope: 1 });
    await clickNoWait(fake.page, 'Local', { exact: true });
    expect(fake.roleCalls[0]).toEqual({
      where: 'page',
      role: 'button',
      options: { name: 'Local', exact: true },
    });
  });

  it('scope (seletor CSS ou Locator) restringe a busca ao container', async () => {
    const { clickNoWait } = await import('../../scripts/testing/cloud.mjs');
    const css = fakePage({ page: 2, scope: 1 });
    await clickNoWait(css.page, 'Adicionar imagens', { scope: '.canvas-empty' });
    expect(css.clicks).toEqual([{ where: 'scope', options: { noWaitAfter: true } }]);
    expect(css.roleCalls.map((c) => c.where)).toEqual(['locator:.canvas-empty', 'scope']);

    const loc = fakePage({ page: 2, scope: 1 });
    await clickNoWait(loc.page, 'Adicionar imagens', { scope: loc.scopeLocator });
    expect(loc.clicks).toEqual([{ where: 'scope', options: { noWaitAfter: true } }]);
    expect(loc.roleCalls.map((c) => c.where)).toEqual(['scope']);
  });
});

describe('docs/TESTING.md e docs/TESTING-NUVEM.md apontam para os auxiliares (decisão 4)', () => {
  const guide = read('docs/TESTING.md');
  const cloud = read('docs/TESTING-NUVEM.md');
  const appendixA = guide.slice(
    guide.indexOf('## Apêndice A'),
    guide.indexOf('## Apêndice B'),
  );

  it('o apêndice A cita cloud-up.sh e cloud.mjs e cada receita 1 a 8 diz o que o auxiliar faz', () => {
    expect(appendixA).toContain('cloud-up.sh');
    expect(appendixA).toContain('cloud.mjs');
    // Índice da primeira menção de cada receita (1 a 9, a última como limite do bloco da 8ª);
    // o bloco de uma receita vai até a próxima, cobrindo as linhas "continuação" que algumas têm.
    const starts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      appendixA.indexOf(`Receita ${n} (nuvem)`),
    );
    for (const [i, start] of starts.slice(0, 8).entries()) {
      const marker = `Receita ${i + 1} (nuvem)`;
      expect(start, marker).toBeGreaterThanOrEqual(0);
      const block = appendixA.slice(start, starts[i + 1]);
      expect(block, marker).toMatch(/o auxiliar faz isto: `/i);
    }
  });

  it('os "Primeiros 10 minutos" chamam o cloud-up.sh (itens 4 a 7)', () => {
    const start = cloud.indexOf('## Primeiros 10 minutos');
    const end = cloud.indexOf('## ', start + 1);
    const section = cloud.slice(start, end);
    expect(section).toContain('cloud-up.sh');
  });

  it('"Como agir" diz que se usam os auxiliares e script próprio só para o que falta', () => {
    const start = cloud.indexOf('## Como agir');
    const end = cloud.indexOf('## ', start + 1);
    const section = cloud.slice(start, end);
    expect(section).toContain('scripts/testing/cloud');
    expect(section).toContain('O que atrapalhou');
  });
});

describe('scripts/testing/ listado no repositório', () => {
  it('os auxiliares, o cliente MCP por stdio e o guia da rodada existem na pasta', () => {
    const files = readdirSync('scripts/testing').sort();
    expect(files).toEqual(
      [
        'atspi-allow.py',
        'cloud-up.sh',
        'cloud.d.mts',
        'cloud.mjs',
        'fiel.mjs',
        'fx.mjs',
        'herdada.mjs',
        'justificado.mjs',
        'large-project.mjs',
        'mcp-stdio-client.mjs',
        'mock-github-release.mjs',
        'r85-prep.sh',
        'rot.mjs',
        'round-guide.d.mts',
        'round-guide.mjs',
        'sombras.mjs',
      ].sort(),
    );
  });
});

describe('ambiente e aba dos auxiliares (etapa #421, TS1, decisões 3 e 4)', () => {
  const ENV_LINE =
    'export DISPLAY=:99 DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/dbus-abc,guid=0123\n';

  it('parseEnvFile lê a linha que o cloud-up.sh grava', async () => {
    const { parseEnvFile } = await import('../../scripts/testing/cloud.mjs');
    expect(parseEnvFile(ENV_LINE)).toEqual({
      DISPLAY: ':99',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/dbus-abc,guid=0123',
    });
  });

  it('loadEnv preenche só o que falta e não sobrescreve variável já definida', async () => {
    const { loadEnv } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-env-'));
    try {
      writeFileSync(path.join(dir, 'env.sh'), ENV_LINE);
      const env: Record<string, string | undefined> = { DISPLAY: ':7' };
      loadEnv(dir, env);
      expect(env.DISPLAY).toBe(':7');
      expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/tmp/dbus-abc,guid=0123');
      expect(env.APOIO).toBe(dir);
      const outro: Record<string, string | undefined> = { APOIO: '/x' };
      loadEnv(dir, outro);
      expect(outro.APOIO).toBe('/x');
      expect(outro.DISPLAY).toBe(':99');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadEnv sem o arquivo e sem DISPLAY lança a dica do cloud-up.sh', async () => {
    const { loadEnv } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-env-'));
    try {
      expect(() => loadEnv(dir, {})).toThrow(
        'apoio/env.sh não existe: rode o cloud-up.sh',
      );
      expect(() => loadEnv(dir, { DISPLAY: ':1' })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const app = { url: 'http://localhost:8080/', title: 'Mapping' };
  const guia = { url: 'http://localhost:8080/guia/index.html', title: 'Guia' };

  it('pickAppPage com a app e o guia abertos devolve a app', async () => {
    const { pickAppPage } = await import('../../scripts/testing/cloud.mjs');
    expect(pickAppPage([guia, app])).toBe(app);
    expect(pickAppPage([guia, { url: 'about:blank' }, app])).toBe(app);
  });

  it('pickAppPage com duas abas da app lança com as duas URLs e a dica da receita 3', async () => {
    const { pickAppPage } = await import('../../scripts/testing/cloud.mjs');
    const outra = { url: 'http://localhost:8080/?x=1', title: 'Mapping 2' };
    expect(() => pickAppPage([app, outra])).toThrow(
      /http:\/\/localhost:8080\/[\s\S]*\?x=1[\s\S]*feche as abas a mais \(receita 3\)/,
    );
  });

  it('pickAppPage sem nenhuma aba da app lança com o que achou', async () => {
    const { pickAppPage } = await import('../../scripts/testing/cloud.mjs');
    expect(() => pickAppPage([guia])).toThrow(/guia\/index\.html/);
    expect(() => pickAppPage([])).toThrow(/Nenhuma aba/);
  });

  it('pickAppPage respeita a origem informada', async () => {
    const { pickAppPage } = await import('../../scripts/testing/cloud.mjs');
    const other = { url: 'http://localhost:9000/', title: 'Outra' };
    expect(pickAppPage([app, other], { origin: 'http://localhost:9000' })).toBe(other);
  });
});

describe('connect com timeout curto (etapa #421, TS1, decisão 2)', () => {
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

  it('chama setDefaultTimeout(5000) e setDefaultNavigationTimeout(15000) na aba da app', async () => {
    const { connect } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-connect-'));
    try {
      const fake = fakeBrowser(['http://localhost:8080/guia/', 'http://localhost:8080/']);
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

  it('respeita timeoutMs e navigationTimeoutMs', async () => {
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

  it('com duas abas da app, connect lança com as URLs', async () => {
    const { connect } = await import('../../scripts/testing/cloud.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-connect-'));
    try {
      const fake = fakeBrowser(['http://localhost:8080/', 'http://localhost:8080/?b=1']);
      await expect(
        connect(dir, undefined, { connectOverCDP: fake.connectOverCDP }),
      ).rejects.toThrow(/\?b=1/);
      // Sem fechar a conexão CDP, o processo `node` do script não sairia.
      expect(fake.calls).toEqual([['close', 0]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('diffJson e formatState (etapa #421, TS1, decisão 6)', () => {
  it('escalar alterado mostra antigo → novo', async () => {
    const { diffJson } = await import('../../scripts/testing/cloud.mjs');
    const lines = diffJson(
      { revision: 3, a: { b: 'x' } },
      { revision: 4, a: { b: 'x' } },
    );
    expect(lines).toEqual(['~ revision: 3 → 4']);
  });

  it('item acrescentado num array com id aparece pelo id', async () => {
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

  it('alteração dentro de item de array pelo id e chave removida', async () => {
    const { diffJson } = await import('../../scripts/testing/cloud.mjs');
    const lines = diffJson(
      { markings: [{ id: 'm1', x: 1 }], name: 'n' },
      { markings: [{ id: 'm1', x: 2 }] },
    );
    expect(lines).toContain('~ markings[m1].x: 1 → 2');
    expect(lines.some((l) => /^- name/.test(l))).toBe(true);
  });

  it('além do limite vira "+N"', async () => {
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

  it('sem diferença devolve lista vazia', async () => {
    const { diffJson } = await import('../../scripts/testing/cloud.mjs');
    expect(diffJson({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
  });

  it('formatState imprime poucas linhas, sem JSON cru', async () => {
    const { formatState } = await import('../../scripts/testing/cloud.mjs');
    const text = formatState({
      title: 'Mapping',
      url: 'http://localhost:8080/',
      dialogs: ['Excluir marcação'],
      notices: ['Projeto aberto'],
      saveStatus: 'Salvo',
      focus: { role: 'button', name: 'Cancelar' },
      windows: [],
      project: { revision: 8, changes: ['~ revision: 7 → 8', '+ markings[m2]'] },
    });
    expect(text).not.toContain('{');
    expect(text.split('\n').length).toBeLessThanOrEqual(12);
    expect(text).toContain('Excluir marcação');
    expect(text).toContain('Salvo');
    expect(text).toContain('button "Cancelar"');
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
    expect(first).toContain('primeira leitura');
  });
});

describe('seletor de leitura e connectGuide (etapa #482, GT1)', () => {
  it('OPEN_DIALOG_TITLES inclui o seletor de leitura (Aplicar pasta…, Abrir biblioteca)', async () => {
    const { OPEN_DIALOG_TITLES, waitForWindow } =
      await import('../../scripts/testing/cloud.mjs');
    const reading = 'Selecione uma pasta que este site pode ver';
    expect(OPEN_DIALOG_TITLES).toContain(reading);
    // Com a busca de janelas injetada: só uma janela com esse título existe.
    const find = (names: string[]) => (names.includes(reading) ? '42' : null);
    await expect(
      waitForWindow(OPEN_DIALOG_TITLES, { timeoutMs: 50, stepMs: 10, find }),
    ).resolves.toBe('42');
  });

  it('connectGuide escolhe a aba /guia/ com os mesmos 5 s e 15 s', async () => {
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
      const pages = [make('http://localhost:8080/'), make('http://localhost:8080/guia/')];
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

  it('connectGuide sem a aba do guia lança com as abas achadas e fecha a conexão', async () => {
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
      ).rejects.toThrow(/guia/);
      expect(closed).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('lista de autocompletar do GTK com pastas irmãs (etapa #482, GT1)', () => {
  // Geometrias medidas no Chrome de verdade: a lista de uma pasta só tem ~48 px de altura e a de
  // `migracao` com `migracao10..12` ao lado, 94 px (cresce com o número de sugestões).
  const dialog = { id: '6301026', name: 'Selecione uma pasta que este site pode ver' };
  const main = { id: '4194307', name: 'Mapping: Google Chrome for Testing' };
  const geometries: Record<string, { HEIGHT: number }> = {
    '6301026': { HEIGHT: 822 },
    '4194307': { HEIGHT: 999 },
    '6302837': { HEIGHT: 94 },
    '6302838': { HEIGHT: 48 },
  };
  const geometryOf = (id: string) => geometries[id] ?? { HEIGHT: 0 };

  it('acha a lista de 94 px (quatro sugestões), não só a de 48 px', async () => {
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

  it('não confunde com o seletor nem com a janela principal do Chrome', async () => {
    const { pickAutocompletePopup } = await import('../../scripts/testing/cloud.mjs');
    expect(pickAutocompletePopup([main, dialog], geometryOf, dialog.id)).toBeNull();
    expect(pickAutocompletePopup([], geometryOf, dialog.id)).toBeNull();
  });

  it('openButtonPoints: o centro do Open medido (a ~45 px da base) vem primeiro, com variações', async () => {
    const { openButtonPoints } = await import('../../scripts/testing/cloud.mjs');
    // Seletor medido: X=238 Y=116 de 1124 × 822; o botão Open fica em (1312, 893) na tela.
    const points = openButtonPoints({ X: 238, Y: 116, WIDTH: 1124, HEIGHT: 822 });
    expect(points[0]).toEqual({ x: 1312, y: 893 });
    expect(points.length).toBeGreaterThanOrEqual(3);
    for (const point of points) {
      expect(point.x).toBeLessThan(238 + 1124);
      expect(point.y).toBeLessThan(116 + 822);
    }
  });
});

describe('janela da nuvem passa do mínimo da app (etapa #604, GN1, decisão 1)', () => {
  const guide = read('docs/TESTING.md');
  const appendixA = guide.slice(
    guide.indexOf('## Apêndice A'),
    guide.indexOf('## Apêndice B'),
  );
  const recipe2 = appendixA.slice(
    appendixA.indexOf('Receita 2 (nuvem), `source` só na shell'),
    appendixA.indexOf('Receita 3 (nuvem), reiniciar'),
  );

  /** Tamanhos do Xvfb (`-screen 0 LxAx24`) e do Chrome (`--window-size=L,A`) no texto. */
  function sizes(text: string): { xvfb: string[]; chrome: string[] } {
    const xvfb = [...text.matchAll(/-screen 0 (\d+x\d+)x24/g)].map((m) => m[1] ?? '');
    const chrome = [...text.matchAll(/--window-size=(\d+),(\d+)/g)].map(
      (m) => `${m[1]}x${m[2]}`,
    );
    return { xvfb, chrome };
  }

  it.each([
    ['scripts/testing/cloud-up.sh', read(CLOUD_UP)],
    ['receita 2 do apêndice A', recipe2],
  ])(
    '%s: Xvfb e Chrome têm o mesmo tamanho, com altura de pelo menos 1100',
    (name, text) => {
      const { xvfb, chrome } = sizes(text);
      expect(xvfb, name).toHaveLength(1);
      expect(chrome, name).toHaveLength(1);
      expect(chrome[0], name).toBe(xvfb[0]);
      const height = Number((xvfb[0] ?? '').split('x')[1]);
      expect(height, name).toBeGreaterThanOrEqual(1100);
    },
  );

  it('o cloud-up.sh e a receita 2 usam o mesmo tamanho', () => {
    expect(sizes(read(CLOUD_UP)).xvfb).toEqual(sizes(recipe2).xvfb);
  });
});

// Etapa #841 (RB1, decisão 3): `mark` e `tempos` sem `APOIO` exportado acham a pasta padrão.
describe('cloud.mjs sem APOIO exportado (RB1, decisão 3)', () => {
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

  it('mark grava na pasta apoio/ da rodada mais recente e avisa', () => {
    home = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-home-'));
    const old = path.join(home, 'mapping-testes', '2026-01-01-velha', 'apoio');
    const recent = path.join(home, 'mapping-testes', '2026-02-02-nova', 'apoio');
    mkdirSync(old, { recursive: true });
    mkdirSync(recent, { recursive: true });
    utimesSync(old, new Date('2026-01-01'), new Date('2026-01-01'));
    const r = run(['mark', 'R1', 'start']);
    expect(r.status ?? 0).toBe(0);
    expect(r.stderr).toMatch(/APOIO/);
    expect(r.stderr).toContain(recent);
    expect(read(path.join(recent, 'tempos.log'))).toMatch(/^R1 start \d{4}-/);
  });

  it('tempos sem APOIO lê a mesma pasta; sem nenhuma pasta, falha com a explicação', () => {
    home = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-home-'));
    const apoio = path.join(home, 'mapping-testes', '2026-02-02-nova', 'apoio');
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

// Etapa #1148 (TR1, decisões 1 a 3): `cloud.mjs run`, `--prazo` e `help`.
describe('cloud.mjs run, --prazo e help (etapa #1148, TR1)', () => {
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

  it('run: o corpo vê page, browser, apoioDir, projectDir e os exports; imprime o state() e sai 0', async () => {
    apoio = mkdtempSync(path.join(tmpdir(), 'mapping-run-'));
    process.env.DISPLAY ??= ':99';
    const mod = await import('../../scripts/testing/cloud.mjs');
    const c = capture();
    const code = await mod.runStep(
      `globalThis.__runSeen = ([typeof page.evaluate, typeof browser.close, apoioDir === ${JSON.stringify(apoio)}, projectDir, typeof formatState, typeof ponto, typeof settleLike].join('|'))`,
      { apoioDir: apoio, connectFn: fakeConnect, io: c.io },
    );
    expect(code).toBe(0);
    // `typeof settleLike` é undefined: só os exports reais estão em escopo.
    const logged = String((globalThis as { __runSeen?: string }).__runSeen);
    expect(logged).toMatch(/function\|function\|true\|\|function\|function\|/);
    expect(c.out.join('\n')).toContain('Mapping');
  });

  it('run: erro no corpo imprime a mensagem e o estado e sai 1', async () => {
    apoio = mkdtempSync(path.join(tmpdir(), 'mapping-run-'));
    process.env.DISPLAY ??= ':99';
    const mod = await import('../../scripts/testing/cloud.mjs');
    const c = capture();
    const code = await mod.runStep(`throw new Error('deu ruim no passo')`, {
      apoioDir: apoio,
      connectFn: fakeConnect,
      io: c.io,
    });
    expect(code).toBe(1);
    expect(c.err.join('\n')).toContain('deu ruim no passo');
    expect(c.out.join('\n')).toContain('Mapping');
  });

  it('run --prazo: script preso sai 124 com "prazo de <n> s esgotado no passo"', async () => {
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
    expect(c.err.join('\n')).toContain('prazo de 0.05 s esgotado no passo');
    expect(c.out.join('\n')).toContain('Mapping');
  });

  it('run pela CLI sem corpo na entrada falha com o uso', () => {
    const r = spawnSync('node', ['scripts/testing/cloud.mjs', 'run'], {
      input: '',
      encoding: 'utf8',
      env: { ...process.env, APOIO: tmpdir() },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Uso: .*cloud\.mjs run/);
  });

  it('help lista todo export (tabela única) e o cloud.d.mts declara os mesmos nomes', async () => {
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
            'Candidate',
            'Tempos',
          ].includes(n),
      );
    expect(declared.sort()).toEqual(names);
  });
});

// Etapa #1148 (TR1, decisões 4 e 5): `env.sh` e o log do build.
describe('cloud-up.sh: env.sh e build.log (etapa #1148, TR1)', () => {
  it('grava e lê apoio/env.sh (sem o nome antigo)', () => {
    const up = read(CLOUD_UP);
    expect(up).toContain('"$S/env.sh"');
    expect(up).not.toMatch(/\$S\/env["\s]/);
    expect(read(CLOUD_MJS)).toContain("'env.sh'");
    expect(read(CLOUD_MJS)).not.toMatch(/apoio\/env\b(?!\.sh)/);
  });

  it('manda npm ci, build e build:mcp para apoio/build.log e mostra as últimas 40 linhas ao falhar', () => {
    const up = read(CLOUD_UP);
    expect(up).toContain('build.log');
    expect(up).toMatch(/tail -n 40/);
    for (const cmd of ['npm ci', 'npm run build', 'npm run build:mcp']) {
      expect(up, cmd).toMatch(new RegExp(`run_logged ${cmd}`));
    }
  });
});

// Etapa #1148 (TR2, decisões 7 a 11): esperas e gestos que não falham.
describe('settle, openWindow, drag, setViewport e find (etapa #1148, TR2)', () => {
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

    it('sem "Salvando…" e sem mutação devolve null depois de ~200 ms', async () => {
      const mod = await load();
      stub('Salvo', false);
      const t0 = Date.now();
      const warning = await mod.settle(pageRunning, { timeoutMs: 2000 });
      expect(warning).toBeNull();
      expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
    });

    it('"Salvando…" que não sai estoura o prazo com aviso que cita a condição', async () => {
      const mod = await load();
      stub('Salvando…', false);
      const warnings: string[] = [];
      const warning = await mod.settle(pageRunning, {
        timeoutMs: 300,
        warn: (m: string) => warnings.push(m),
      });
      expect(String(warning)).toMatch(/Salvando/);
      expect(warnings).toHaveLength(1);
    });

    it('DOM que não para de mudar estoura o prazo com aviso de mutação', async () => {
      const mod = await load();
      stub('Salvo', true);
      const warning = await mod.settle(pageRunning, { timeoutMs: 400, warn: () => {} });
      expect(String(warning)).toMatch(/mud/);
    });

    it('state() espera o settle antes de ler o DOM', async () => {
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

  describe('openWindow e closeWindow', () => {
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

    it('openWindow só clica quando a janela está fechada (idempotente)', async () => {
      const mod = await load();
      const a = fakeWindowPage({ tree: 'false' });
      await mod.openWindow(a.page, 'tree');
      await mod.openWindow(a.page, 'tree');
      expect(a.clicks).toEqual(['tree']);
      expect(a.waits[0]).toContain('visible');
    });

    it('closeWindow só clica quando a janela está aberta e espera sumir', async () => {
      const mod = await load();
      const a = fakeWindowPage({ layers: 'true' });
      await mod.closeWindow(a.page, 'layers');
      await mod.closeWindow(a.page, 'layers');
      expect(a.clicks).toEqual(['layers']);
      expect(a.waits[0]).toContain('hidden');
    });

    it('id desconhecido dá erro com a lista dos ids', async () => {
      const mod = await load();
      const a = fakeWindowPage({});
      await expect(mod.openWindow(a.page, 'arvore')).rejects.toThrow(
        /arvore.*tree.*layers.*details.*list.*incomplete.*diagnostics.*proposals.*notices.*comments.*catalog/s,
      );
      expect(a.clicks).toEqual([]);
    });

    it('os ids são os de src/store/toolWindows.ts', async () => {
      const mod = await load();
      const src = read('src/store/toolWindows.ts');
      const block = /TOOL_WINDOWS = \[([^\]]+)\]/.exec(src)?.[1] ?? '';
      const ids = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
      expect([...mod.TOOL_WINDOW_IDS].sort()).toEqual(ids);
    });
  });

  describe('drag e nearHandle', () => {
    function fakeDragPage(selectionBox: string | null) {
      const events: string[] = [];
      const page = {
        mouse: {
          click: async (x: number, y: number) => events.push(`click ${x},${y}`),
          down: async () => events.push('down'),
          move: async (x: number, y: number) => events.push(`move ${x},${y}`),
          up: async () => events.push('up'),
        },
        locator: () => ({
          getAttribute: async () => selectionBox,
          boundingBox: async () => ({ x: 100, y: 50, width: 800, height: 600 }),
        }),
        evaluate: async () => null,
      };
      return { page, events };
    }

    it('clica, segura, move em `steps` passos até `para` e solta', async () => {
      const mod = await load();
      const d = fakeDragPage(null);
      await mod.drag(d.page, { x: 300, y: 300 }, { x: 340, y: 380 }, { steps: 4 });
      expect(d.events[0]).toBe('click 300,300');
      expect(d.events[1]).toBe('move 300,300');
      expect(d.events[2]).toBe('down');
      expect(d.events.slice(3, 7)).toEqual([
        'move 310,320',
        'move 320,340',
        'move 330,360',
        'move 340,380',
      ]);
      expect(d.events[7]).toBe('up');
    });

    it('select: false não clica antes', async () => {
      const mod = await load();
      const d = fakeDragPage(null);
      await mod.drag(d.page, { x: 1, y: 2 }, { x: 3, y: 4 }, { select: false, steps: 1 });
      expect(d.events.slice(0, 2)).toEqual(['move 1,2', 'down']);
    });

    it('avisa quando `de` cai a até 8 px de uma alça da caixa da seleção', async () => {
      const mod = await load();
      // caixa da seleção (relativa ao host): 100 100 200 100 → canto nw na tela: (200, 150)
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
      expect(warnings.join('')).toMatch(/perto da alça nw: o arrasto pode redimensionar/);
      expect(d.events).toContain('up');
    });

    it('não avisa longe das alças; nearHandle devolve o nome do canto ou null', async () => {
      const mod = await load();
      const box = { x: 200, y: 150, width: 200, height: 100 };
      expect(mod.nearHandle(box, { x: 300, y: 200 })).toBeNull();
      expect(mod.nearHandle(box, { x: 400, y: 250 })).toBe('se');
      // A app não tem alça no meio das bordas (CORNERS): o meio do lado de cima não avisa.
      expect(mod.nearHandle(box, { x: 300, y: 146 })).toBeNull();
      expect(mod.nearHandle(box, { x: 209, y: 200 })).toBeNull();
    });

    it('nearHandle usa o raio e a distância em xadrez da app (handleHitRadius, HANDLE_HIT_RADIUS)', async () => {
      const mod = await load();
      // Caixa grande (>= 66 px de lado menor): o raio é o fixo do container.
      const big = { x: 200, y: 150, width: 200, height: 100 };
      expect(handleHitRadius(100)).toBe(HANDLE_HIT_RADIUS);
      const r = HANDLE_HIT_RADIUS;
      expect(mod.nearHandle(big, { x: 200 + r, y: 150 })).toBe('nw');
      expect(mod.nearHandle(big, { x: 200 + r + 1, y: 150 })).toBeNull();
      // Xadrez: o canto do quadrado r × r conta, ainda que a distância euclidiana passe de r.
      expect(mod.nearHandle(big, { x: 200 + r, y: 150 + r })).toBe('nw');
      expect(mod.nearHandle(big, { x: 400 - r, y: 150 + r })).toBe('ne');
      expect(mod.nearHandle(big, { x: 200 + r, y: 250 - r })).toBe('sw');
      // Fora da caixa também conta (o rótulo do container fica acima da borda).
      expect(mod.nearHandle(big, { x: 200, y: 150 - r })).toBe('nw');
      expect(mod.nearHandle(big, { x: 200, y: 150 - r - 1 })).toBeNull();
      // Caixa pequena: raio clamp(min / 3, 12, 22).
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

    it('o container tem raio fixo de 22 px mesmo com a caixa pequena (HANDLE_HIT_RADIUS)', async () => {
      const mod = await load();
      const small = { x: 0, y: 0, width: 30, height: 90 };
      const r = HANDLE_HIT_RADIUS;
      // Marcação: clamp(30 / 3, 12, 22) = 12; container: sempre 22.
      expect(mod.nearHandle(small, { x: 0, y: r })).toBeNull();
      expect(mod.nearHandle(small, { x: 0, y: r }, { container: true })).toBe('nw');
      expect(mod.nearHandle(small, { x: 0, y: r + 1 }, { container: true })).toBeNull();
      // O drag não sabe se o selecionado é container ou marcação: avisa pelo raio maior.
      const d = fakeDragPage('100 100 30 90');
      const warnings: string[] = [];
      await mod.drag(
        d.page,
        { x: 200, y: 168 },
        { x: 260, y: 168 },
        { steps: 1, warn: (m: string) => warnings.push(m) },
      );
      expect(warnings.join('')).toMatch(/perto da alça nw/);
    });

    it('drag avisa perto do canto fora da caixa, como o rótulo do container', async () => {
      const mod = await load();
      const d = fakeDragPage('100 100 200 100');
      const warnings: string[] = [];
      // canto nw na tela: (200, 150); o ponto está 20 px acima dele.
      await mod.drag(
        d.page,
        { x: 205, y: 130 },
        { x: 260, y: 130 },
        { steps: 1, select: false, warn: (m: string) => warnings.push(m) },
      );
      expect(warnings.join('')).toMatch(/perto da alça nw/);
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

    it('soma a moldura medida e confere innerWidth/innerHeight', async () => {
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

    it('erro com os valores obtidos quando a janela não deu o pedido', async () => {
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

  describe('find e localizador que diz o que existe', () => {
    const candidates = [
      { role: 'button', name: 'Revisar', region: 'Propostas' },
      { role: 'button', name: 'Revisar proposta', region: 'Janelas de ferramenta' },
    ];

    it('find devolve os candidatos da página; formatCandidates os lista', async () => {
      const mod = await load();
      const page = {
        evaluate: async (_fn: Fn, arg: { needle: string }) => {
          expect(arg.needle).toBe('revisar');
          return candidates;
        },
      };
      const found = await mod.find(page, 'Revisar');
      expect(found).toEqual(candidates);
      const text = String(mod.formatCandidates(found, 'Revisar'));
      expect(text).toContain('button "Revisar" em Propostas');
      expect(mod.formatCandidates([], 'Nada')).toMatch(/nenhum candidato.*Nada/);
    });

    it('locatorTextFromError tira o nome do localizador da mensagem do Playwright', async () => {
      const mod = await load();
      expect(
        mod.locatorTextFromError(
          "locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Revisar' })",
        ),
      ).toBe('Revisar');
      expect(
        mod.locatorTextFromError(
          "strict mode violation: getByText('Conversas') resolved to 2 elements",
        ),
      ).toBe('Conversas');
      expect(mod.locatorTextFromError('algum outro erro')).toBeNull();
    });

    it('run: timeout de localizador é seguido da lista de candidatos', async () => {
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
          `throw new Error("locator.click: Timeout 5000ms exceeded.\\n  - waiting for getByRole('button', { name: 'Revisar' })")`,
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
      expect(all).toContain('button "Revisar" em Propostas');
    });
  });
});

describe('paletteDrag, caminho absoluto e pasta lembrada (etapa #1256, RT2)', () => {
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
   * Página falsa: a instância nasce no `mapping.json` da pasta do projeto, no `mouse.up`
   * (nativo) ou no `evaluate` do sintético; `groups` são os grupos da Paleta que têm o tipo.
   */
  function fakePalettePage(
    rises: 'nativo' | 'sintetico' | 'nenhum',
    {
      groups = ['Biblioteca'],
      syntheticReason,
    }: { groups?: string[]; syntheticReason?: string } = {},
  ) {
    const projeto = mkdtempSync(path.join(tmpdir(), 'mapping-palette-'));
    const file = path.join(projeto, 'mapping.json');
    writeFileSync(file, JSON.stringify({ markings: [{ id: 'm1' }] }));
    const addMarking = () => {
      const json = JSON.parse(readFileSync(file, 'utf8')) as { markings: unknown[] };
      json.markings.push({ id: `m${json.markings.length + 1}` });
      writeFileSync(file, JSON.stringify(json));
    };
    const events: string[] = [];
    const selectors: string[] = [];
    const item = {
      scrollIntoViewIfNeeded: async () => events.push('rola'),
      boundingBox: async () => ({ x: 10, y: 100, width: 200, height: 40 }),
    };
    const generic = (selector: string): Record<string, unknown> => ({
      filter: () => item,
      getByText: () => ({ text: selector }),
      getAttribute: async () => '0',
      screenshot: async ({ path: out }: { path: string }) =>
        events.push(`captura ${out}`),
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
        if (arg && 'para' in arg) {
          events.push('sintetico');
          if (syntheticReason) return { motivo: syntheticReason };
          if (rises === 'sintetico') addMarking();
          return { ok: true };
        }
        return groups;
      },
    };
    return { page, events, selectors, projeto, file };
  }

  describe('paletteDrag (decisões 9 e 10)', () => {
    const cleanup: string[] = [];
    afterEach(() => {
      for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
    });
    const setup = (...args: Parameters<typeof fakePalettePage>) => {
      const d = fakePalettePage(...args);
      cleanup.push(d.projeto);
      return d;
    };

    it('o arrasto nativo cria a instância (marcações do disco): via nativo, sem o evento sintético', async () => {
      const mod = await load();
      const d = setup('nativo');
      const result = await mod.paletteDrag(
        d.page,
        'Button',
        { x: 500, y: 300 },
        { steps: 2, projectDir: d.projeto },
      );
      expect(result).toEqual({ via: 'nativo' });
      expect(d.events).toEqual([
        'rola',
        'move 110,120',
        'down',
        'move 305,210',
        'move 500,300',
        'up',
      ]);
    });

    it('sem marcação nova no nativo, refaz pelo evento sintético: via sintetico', async () => {
      const mod = await load();
      const d = setup('sintetico');
      const result = await mod.paletteDrag(
        d.page,
        'Box',
        { x: 500, y: 300 },
        { steps: 1, projectDir: d.projeto, waitMs: 20 },
      );
      expect(result).toEqual({ via: 'sintetico' });
      expect(d.events.at(-1)).toBe('sintetico');
    });

    it('a marcação que chega ao disco depois do settle (autosave) ainda conta como nativa', async () => {
      const mod = await load();
      const d = setup('nenhum');
      const up = d.page.mouse.up;
      d.page.mouse.up = async () => {
        await up();
        setTimeout(() => {
          const json = JSON.parse(readFileSync(d.file, 'utf8')) as {
            markings: unknown[];
          };
          json.markings.push({ id: 'tarde' });
          writeFileSync(d.file, JSON.stringify(json));
        }, 120);
      };
      const result = await mod.paletteDrag(
        d.page,
        'Button',
        { x: 500, y: 300 },
        { steps: 1, projectDir: d.projeto, waitMs: 1000 },
      );
      expect(result).toEqual({ via: 'nativo' });
      expect(d.events).not.toContain('sintetico');
    });

    it('o nativo criou: o sintético não roda (sem instância duplicada)', async () => {
      const mod = await load();
      const d = setup('nativo');
      await mod.paletteDrag(
        d.page,
        'Box',
        { x: 500, y: 300 },
        { steps: 1, projectDir: d.projeto },
      );
      expect(d.events).not.toContain('sintetico');
      expect(
        (JSON.parse(readFileSync(d.file, 'utf8')) as { markings: unknown[] }).markings,
      ).toHaveLength(2);
    });

    it('sem nenhuma das duas, lança que o arrasto não criou a instância', async () => {
      const mod = await load();
      const d = setup('nenhum');
      await expect(
        mod.paletteDrag(
          d.page,
          'Button',
          { x: 500, y: 300 },
          { steps: 1, projectDir: d.projeto, waitMs: 20 },
        ),
      ).rejects.toThrow('o arrasto da Paleta não criou a instância');
    });

    it('sem a pasta do projeto, lança "paletteDrag precisa da pasta do projeto"', async () => {
      const mod = await load();
      const d = setup('nativo');
      await expect(
        mod.paletteDrag(d.page, 'Button', { x: 500, y: 300 }, { steps: 1 }),
      ).rejects.toThrow('paletteDrag precisa da pasta do projeto');
      expect(d.events).toEqual([]);
    });

    it('o motivo do sintético vira a mensagem: item sumiu e ponto fora do canvas', async () => {
      const mod = await load();
      for (const motivo of [
        "o item 'Button' sumiu da Paleta",
        'o ponto (500, 300) não cai no canvas (div.dock)',
      ]) {
        const d = setup('nenhum', { syntheticReason: motivo });
        await expect(
          mod.paletteDrag(
            d.page,
            'Button',
            { x: 500, y: 300 },
            { steps: 1, projectDir: d.projeto },
          ),
        ).rejects.toThrow(motivo);
      }
    });

    it('tipo repetido em dois grupos lança com os grupos; { grupo } escolhe', async () => {
      const mod = await load();
      const d = setup('nativo', { groups: ['Material', 'Ícones'] });
      await expect(
        mod.paletteDrag(
          d.page,
          'Button',
          { x: 500, y: 300 },
          { steps: 1, projectDir: d.projeto },
        ),
      ).rejects.toThrow(/mais de um grupo.*Material.*Ícones/);
      const result = await mod.paletteDrag(
        d.page,
        'Button',
        { x: 500, y: 300 },
        { steps: 1, projectDir: d.projeto, grupo: 'Ícones' },
      );
      expect(result).toEqual({ via: 'nativo' });
      expect(d.selectors.some((s) => s.includes('aria-label="Ícones"'))).toBe(true);
      await expect(
        mod.paletteDrag(
          d.page,
          'Button',
          { x: 500, y: 300 },
          { steps: 1, projectDir: d.projeto, grupo: 'Outro' },
        ),
      ).rejects.toThrow(/Outro.*Material.*Ícones/);
    });

    it('tipo que nenhum grupo tem: lança que não está na Paleta aberta', async () => {
      const mod = await load();
      const d = setup('nativo', { groups: [] });
      await expect(
        mod.paletteDrag(
          d.page,
          'Nada',
          { x: 500, y: 300 },
          { steps: 1, projectDir: d.projeto },
        ),
      ).rejects.toThrow("o tipo 'Nada' não está na Paleta aberta");
    });

    it('capture grava o recorte do canvas antes de soltar', async () => {
      const mod = await load();
      const d = setup('nativo');
      await mod.paletteDrag(
        d.page,
        'Box',
        { x: 500, y: 300 },
        { steps: 1, capture: '/tmp/destino.png', projectDir: d.projeto },
      );
      const shot = d.events.indexOf('captura /tmp/destino.png');
      expect(shot).toBeGreaterThan(d.events.indexOf('down'));
      expect(shot).toBeLessThan(d.events.indexOf('up'));
    });
  });

  describe('caminho absoluto (decisão 8)', () => {
    for (const name of ['selectFolder', 'openFile', 'saveFile'] as const) {
      it(`${name} com caminho relativo cancela o seletor (alt+c) e diz o que fazer`, async () => {
        const mod = await load();
        const apoio = mkdtempSync(path.join(tmpdir(), 'mapping-rel-'));
        let cancelled = 0;
        try {
          await expect(
            mod[name](apoio, 'pasta/rel', {
              cancel: async () => {
                cancelled += 1;
              },
            }),
          ).rejects.toThrow(
            "caminho relativo 'pasta/rel': passe o caminho absoluto (path.resolve)",
          );
        } finally {
          rmSync(apoio, { recursive: true, force: true });
        }
        expect(cancelled).toBe(1);
      });
    }
  });

  describe('pasta lembrada no state() (decisão 9)', () => {
    const dom = { title: 'Mapping', url: 'x', dialogs: [], notices: [], focus: null };
    const page = {
      evaluate: async (_fn: Fn, arg: unknown) =>
        arg && typeof arg === 'object' && 'timeoutMs' in arg ? null : dom,
    };
    const setup = () => {
      const apoio = mkdtempSync(path.join(tmpdir(), 'mapping-lem-'));
      const projeto = mkdtempSync(path.join(tmpdir(), 'mapping-proj-'));
      writeFileSync(path.join(projeto, 'mapping.json'), JSON.stringify({ revision: 7 }));
      return { apoio, projeto };
    };

    it('com projectDir grava o caminho absoluto em state/ultima-pasta.txt', async () => {
      const mod = await load();
      const { apoio, projeto } = setup();
      try {
        await mod.state(page, apoio, { projectDir: projeto });
        expect(
          readFileSync(path.join(apoio, 'state', 'ultima-pasta.txt'), 'utf8').trim(),
        ).toBe(path.resolve(projeto));
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(projeto, { recursive: true, force: true });
      }
    });

    it('sem projectDir usa a pasta gravada e devolve o caminho lido', async () => {
      const mod = await load();
      const { apoio, projeto } = setup();
      try {
        await mod.state(page, apoio, { projectDir: projeto });
        const result = (await mod.state(page, apoio)) as {
          project: { revision: number; dir: string };
        };
        expect(result.project.revision).toBe(7);
        expect(result.project.dir).toBe(path.resolve(projeto));
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(projeto, { recursive: true, force: true });
      }
    });

    it('pasta explícita sem mapping.json também é gravada como a última (a leitura falha, #1430 e)', async () => {
      const mod = await load();
      const { apoio, projeto } = setup();
      try {
        const vazia = path.join(apoio, 'nao-existe');
        const result = (await mod.state(page, apoio, { projectDir: vazia })) as {
          project: { error: string };
        };
        expect(result.project.error).toContain('não existe');
        expect(
          readFileSync(path.join(apoio, 'state', 'ultima-pasta.txt'), 'utf8').trim(),
        ).toBe(path.resolve(vazia));
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(projeto, { recursive: true, force: true });
      }
    });

    it('o ultima-pasta.txt só é regravado quando o conteúdo muda; a pasta lembrada não o regrava', async () => {
      const mod = await load();
      const { apoio, projeto } = setup();
      try {
        const file = path.join(apoio, 'state', 'ultima-pasta.txt');
        await mod.state(page, apoio, { projectDir: projeto });
        const old = new Date('2020-01-01T00:00:00Z');
        utimesSync(file, old, old);
        await mod.state(page, apoio, { projectDir: projeto });
        await mod.state(page, apoio);
        expect(statSync(file).mtimeMs).toBe(old.getTime());
        const outra = mkdtempSync(path.join(tmpdir(), 'mapping-proj2-'));
        try {
          await mod.state(page, apoio, { projectDir: outra });
          expect(statSync(file).mtimeMs).not.toBe(old.getTime());
          expect(readFileSync(file, 'utf8').trim()).toBe(path.resolve(outra));
        } finally {
          rmSync(outra, { recursive: true, force: true });
        }
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(projeto, { recursive: true, force: true });
      }
    });

    it('sem pasta gravada, nada é lido; com projectDir null, não lê disco', async () => {
      const mod = await load();
      const { apoio, projeto } = setup();
      try {
        expect(((await mod.state(page, apoio)) as { project?: unknown }).project).toBe(
          undefined,
        );
        await mod.state(page, apoio, { projectDir: projeto });
        expect(
          ((await mod.state(page, apoio, { projectDir: null })) as { project?: unknown })
            .project,
        ).toBe(undefined);
      } finally {
        rmSync(apoio, { recursive: true, force: true });
        rmSync(projeto, { recursive: true, force: true });
      }
    });

    it('formatState imprime a pasta lida', async () => {
      const mod = await load();
      const text = mod.formatState({
        ...dom,
        saveStatus: null,
        windows: [],
        project: { revision: 3, changes: null, dir: '/tmp/espaco' },
      }) as string;
      expect(text).toContain('Pasta: /tmp/espaco');
    });
  });
});

// Etapa #1232 (GL1): `cloud.mjs passo` imprime o trecho do guia da rodada, sem abrir o Chrome.
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

  function passo(
    args: string[],
    env: Record<string, string | undefined> = { APOIO: apoio },
  ) {
    const r = spawnSync('node', ['scripts/testing/cloud.mjs', 'passo', ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  it('R22.4 imprime o cabeçalho da tabela e a linha do passo', () => {
    const r = passo(['R22.4']);
    expect(r.status).toBe(0);
    const lines = r.stdout.trimEnd().split('\n');
    expect(lines.slice(0, 2)).toEqual([
      '| Passo | Ação | Esperado |',
      '| --- | --- | --- |',
    ]);
    expect(lines[2]).toMatch(/^\| R22\.4 \|/);
    expect(lines).toHaveLength(3);
  });

  it('vários itens, em ordem, separados por ---; --guia aponta outro arquivo', () => {
    const r = passo(['R22.4', 'R0.1', `--guia=${path.join(apoio, 'guia.md')}`], {
      APOIO: undefined,
    });
    expect(r.status).toBe(0);
    expect(r.stdout.indexOf('| R22.4 |')).toBeLessThan(r.stdout.indexOf('| R0.1 |'));
    expect(r.stdout).toContain('\n---\n');
  });

  it('R22.99 sai com 2 e diz o que o guia tem; sem item sai com 2 e mostra o uso', () => {
    const bad = passo(['R22.99']);
    expect(bad.status).toBe(2);
    expect(bad.stdout).toBe('');
    expect(bad.stderr).toContain(
      'R22.99 não está no guia da rodada; o R22 tem R22.1 a R22.22',
    );
    const none = passo([]);
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('Uso: node cloud.mjs passo <item…> [--guia=<arquivo>]');
  });

  it('guia que não existe sai com 2 e diz como gerá-lo', () => {
    const r = passo(['R0'], { APOIO: path.join(apoio, 'nada') });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('round-guide.mjs');
  });
});

// Etapa #1533 (TE1, decisão 2): `cloud.mjs secao` imprime uma seção do guia da rodada, sem abrir o Chrome.
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

  it('secao 7 imprime a seção 7 e só ela', () => {
    const r = secao(['7']);
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith('## 7. Como relatar um problema')).toBe(true);
    expect(r.stdout).not.toContain('## 8. Roteiros');
  });

  it('secao xyz sai com 2 e lista as chaves', () => {
    const r = secao(['xyz']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('xyz');
    for (const key of ['1', '5', 'A.seletores', 'B', 'consulta.grupos']) {
      expect(r.stderr, key).toContain(key);
    }
  });

  it('sem chave lista as chaves com o tamanho e o "quando ler"', () => {
    const r = secao([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^5\b.*\d+.*\S/m);
    expect(r.stdout).toContain('consulta.historico');
  });

  it('as chaves consulta.* leem o docs/TESTING-NUVEM-CONSULTA.md do clone', () => {
    const r = secao(['consulta.passada']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Passada visual');
  });

  it('--guia aponta outro arquivo; guia que não existe sai com 2', () => {
    const r = secao(['1', `--guia=${path.join(apoio, 'guia.md')}`], { APOIO: undefined });
    expect(r.status).toBe(0);
    const bad = secao(['1'], { APOIO: path.join(apoio, 'nada') });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('round-guide.mjs');
  });
});

// Etapa #1533 (TE2, decisões 6 a 8): servidor persistente do `run`, `check`, `runs.log` e `apoio/runs/`.
describe('servidor persistente do run, check e runs.log (etapa #1533, TE2)', () => {
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

  it('dois run seguidos usam a mesma conexão e veem o mesmo ctx', async () => {
    const a = await run('ctx.n = 41; console.log("um")');
    const b = await run('console.log("n=" + (ctx.n + 1))');
    expect([a.code, b.code]).toEqual([0, 0]);
    expect(a.out).toContain('um');
    expect(b.out).toContain('n=42');
    expect(connections).toHaveLength(1);
    expect(spawned).toBe(1);
  });

  it('o prazo esgotado sai 124, o servidor sai e o run seguinte sobe outro (ctx vazio)', async () => {
    await run('ctx.n = 1');
    const slow = await run('await new Promise(() => {})', { prazoSeconds: 0.05 });
    expect(slow.code).toBe(124);
    expect(slow.err).toContain('prazo de 0.05 s esgotado no passo');
    expect(exits).toBe(1);
    const next = await run('console.log("ctx=" + JSON.stringify(ctx))');
    expect(next.code).toBe(0);
    expect(next.out).toContain('ctx={}');
    expect(spawned).toBe(2);
    expect(connections).toHaveLength(2);
  });

  it('uma conexão caída reconecta no run seguinte, com o aviso e o ctx vazio', async () => {
    await run('ctx.n = 1');
    connections[0]!.connected = false;
    const b = await run('console.log("ctx=" + JSON.stringify(ctx))');
    expect(b.code).toBe(0);
    expect(b.out).toContain('ctx={}');
    expect(b.err).toMatch(/aviso: .*reconect/);
    expect(connections).toHaveLength(2);
    expect(spawned).toBe(1);
  });

  it('run --novo reinicia o servidor', async () => {
    await run('ctx.n = 1');
    const b = await run('console.log("ctx=" + JSON.stringify(ctx))', { novo: true });
    expect(b.out).toContain('ctx={}');
    expect(spawned).toBe(2);
  });

  it('um run por vez: o segundo espera o primeiro', async () => {
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

  it('sem servidor que suba, cai no caminho de hoje e avisa', async () => {
    const r = await run('console.log("direto")', {
      spawnServer: async () => {},
      socketWaitMs: 100,
      connectFn,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('direto');
    expect(r.err).toMatch(/aviso: .*servidor/);
  });

  it('resposta perdida (o servidor caiu no meio do run) não repete o corpo em outro servidor', async () => {
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
      expect(r.err).toMatch(/servidor do run caiu/);
      expect(requests).toBe(1);
      expect(spawned).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('o corpo e a saída com acentos passam inteiros mesmo acima de um pedaço do soquete', async () => {
    const filler = 'ãé✅'.repeat(60000);
    const r = await run(`/* ${filler} */ console.log("fim ${'ç'.repeat(70000)}")`);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`fim ${'ç'.repeat(70000)}`);
    expect(readFileSync(path.join(apoio, 'runs', '1.js'), 'utf8')).toContain(filler);
  });

  it('run na fila atrás de um prazo esgotado recebe o erro e o corpo dele não roda', async () => {
    const slow = run('await new Promise(() => {})', { prazoSeconds: 0.3 });
    await new Promise((r) => setTimeout(r, 50));
    const queued = await run('globalThis.__naoDeveRodar = true');
    expect((await slow).code).toBe(124);
    expect(queued.code).toBe(1);
    expect(queued.err).toMatch(/prazo|saiu/);
    expect((globalThis as { __naoDeveRodar?: boolean }).__naoDeveRodar).toBeUndefined();
  });

  it('um segundo servidor na mesma pasta não sobe (o primeiro segue de pé)', async () => {
    const mod = await load();
    await run('ctx.n = 1');
    await expect(
      mod.startRunServer({ apoioDir: apoio, connectFn, onExit: () => {} }),
    ).rejects.toThrow(/já existe um servidor/);
    const b = await run('console.log("n=" + ctx.n)');
    expect(b.out).toContain('n=1');
  });

  it('paletteDrag no corpo do run usa a pasta do run e, sem ela, a última pasta lembrada', async () => {
    const projeto = mkdtempSync(path.join(tmpdir(), 'mapping-srv-proj-'));
    try {
      mkdirSync(path.join(apoio, 'state'), { recursive: true });
      writeFileSync(path.join(apoio, 'state', 'ultima-pasta.txt'), projeto);
      const body = `try { await paletteDrag(page, 'X', { x: 1, y: 1 }); } catch (e) { console.log('ERRO ' + e.message); }`;
      const lembrada = await run(body);
      expect(lembrada.out).toContain('ERRO');
      expect(lembrada.out).not.toContain('precisa da pasta');
    } finally {
      rmSync(projeto, { recursive: true, force: true });
    }
    rmSync(path.join(apoio, 'state'), { recursive: true, force: true });
    const sem = await run(
      `try { await paletteDrag(page, 'X', { x: 1, y: 1 }); } catch (e) { console.log('ERRO ' + e.message); }`,
    );
    expect(sem.out).toContain('ERRO paletteDrag precisa da pasta do projeto');
  });

  describe('check', () => {
    it('um check com falha não interrompe o corpo, sai uma linha por check antes do estado e o run sai 1', async () => {
      const r = await run(`
        check('R4.2', true);
        check('R4.3', false, 'faltou o aviso');
        check('R4.4', async () => { throw new Error('não achei o botão'); });
        check('R4.5', () => true);
        check('R4.6', Promise.resolve(true));
        check('R4.7', () => false);
        console.log('corpo seguiu');
      `);
      expect(r.code).toBe(1);
      const lines = r.out.split('\n');
      expect(lines).toContain('corpo seguiu');
      expect(lines).toContain('✅ R4.2');
      expect(lines).toContain('❌ R4.3 — faltou o aviso');
      expect(lines).toContain('❌ R4.4 — não achei o botão');
      expect(lines).toContain('✅ R4.5');
      expect(lines).toContain('✅ R4.6');
      expect(lines.find((l) => l.startsWith('❌ R4.7'))).toMatch(/condição falsa/);
      const stateAt = lines.findIndex((l) => l.includes('Mapping'));
      expect(stateAt).toBeGreaterThan(lines.indexOf('❌ R4.7 — condição falsa'));
      expect(lines.indexOf('corpo seguiu')).toBeLessThan(lines.indexOf('✅ R4.2'));
    });

    it('corpo que lança ou passa do prazo ainda imprime os checks pendentes', async () => {
      const r = await run(`
        check('R9.1', async () => { await new Promise((r) => setTimeout(r, 30)); return false; }, 'tarde');
        throw new Error('quebrou depois');
      `);
      expect(r.code).toBe(1);
      expect(r.out).toContain('❌ R9.1 — tarde');
      expect(readFileSync(path.join(apoio, 'runs.log'), 'utf8')).toMatch(
        /checks=1 falhas=1/,
      );
    });

    it('todos passando: o run sai 0; check sem await também é esperado', async () => {
      const r = await run(
        `check('ok', async () => { await new Promise((r) => setTimeout(r, 30)); return true; })`,
      );
      expect(r.code).toBe(0);
      expect(r.out).toContain('✅ ok');
    });
  });

  describe('runs.log e apoio/runs/', () => {
    it('cada run grava uma linha em runs.log e o corpo e a saída em runs/<n>.js e .out', async () => {
      await run(`check('a', true); console.log('primeiro')`);
      await run(`check('b', false, 'x'); check('c', true)`);
      const log = readFileSync(path.join(apoio, 'runs.log'), 'utf8').trim().split('\n');
      expect(log).toHaveLength(2);
      expect(log[0]).toMatch(
        /^\d{4}-\d\d-\d\dT[\d:.]+Z run=1 codigo=0 checks=1 falhas=0$/,
      );
      expect(log[1]).toMatch(/ run=2 codigo=1 checks=2 falhas=1$/);
      expect(readFileSync(path.join(apoio, 'runs', '1.js'), 'utf8')).toContain(
        "console.log('primeiro')",
      );
      expect(readFileSync(path.join(apoio, 'runs', '1.out'), 'utf8')).toContain(
        'primeiro',
      );
      expect(readFileSync(path.join(apoio, 'runs', '2.out'), 'utf8')).toContain(
        '❌ b — x',
      );
    });

    it('o contador continua depois de um servidor novo', async () => {
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

    it('o caminho de reserva também grava', async () => {
      await run('1', { spawnServer: async () => {}, socketWaitMs: 50, connectFn });
      expect(readFileSync(path.join(apoio, 'runs.log'), 'utf8')).toMatch(
        /run=1 codigo=0/,
      );
    });
  });

  describe('tempos com run e checks', () => {
    it('conta os run e os checks de cada roteiro pelas marcas do tempos.log', async () => {
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
      // Sem runs.log o texto de antes não muda.
      expect(mod.formatTempos(mod.temposFromLog(tempos))).not.toMatch(/run/);
    });
  });

  it('o cloud-up.sh --restart-chrome para o servidor do run antes de fechar o Chrome', () => {
    const up = read(CLOUD_UP);
    const stop = up.indexOf('"$S/cloud.pid"');
    expect(stop).toBeGreaterThan(-1);
    expect(up.indexOf('Browser.close')).toBeGreaterThan(stop);
    expect(up).toContain('"$S/cloud.sock"');
  });
});

// Etapa #1533 (TE3, decisão 12): pré-conferência dos pacotes com retry e código 14.
describe('cloud-up.sh --check-packages (etapa #1533, TE3)', () => {
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

  /** Um comando falso: `body` é o corpo do script. */
  function fake(name: string, body = 'exit 0'): void {
    const file = path.join(dir, 'bin', name);
    writeFileSync(file, `#!/bin/bash\n${body}\n`);
    chmodSync(file, 0o755);
  }

  /** Tudo instalado, menos o que `missing` lista. */
  function setup(missing: string[], { chrome = true } = {}): void {
    for (const name of ['xdotool', 'openbox', 'import', 'python3']) {
      if (!missing.includes(name)) fake(name);
    }
    fake('sudo', 'if [ "$1" = -n ]; then shift; fi; exec "$@"');
    writeFileSync(path.join(dir, 'launcher'), '');
    if (chrome) writeFileSync(path.join(dir, 'chromium'), '');
  }

  /** `apt-get` falso: falha `fails` vezes e na seguinte instala (cria `xdotool`). */
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

  function checkPackages(): { status: number | null; stdout: string; stderr: string } {
    const r = spawnSync(
      'bash',
      [CLOUD_UP, path.join(dir, 'rodada'), '--check-packages'],
      {
        env: {
          PATH: path.join(dir, 'bin'),
          HOME: dir,
          CLOUD_UP_RETRY_SLEEP: '0',
          CLOUD_UP_ATSPI_LAUNCHER: path.join(dir, 'launcher'),
          CLOUD_UP_CHROME: path.join(dir, 'chromium'),
        },
        encoding: 'utf8',
      },
    );
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  it('tudo instalado: sai 0 sem chamar o apt-get', () => {
    setup([]);
    fakeApt(0);
    const r = checkPackages();
    expect(r.status).toBe(0);
    expect(existsSync(path.join(dir, 'apt-log'))).toBe(false);
  });

  it('falta o xdotool: o apt-get falha duas vezes, instala na terceira e sai 0', () => {
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

  it('o apt-get falha sempre: sai 14 com a lista do que falta', () => {
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

  it('sem o Chrome: sai 14 direto, sem chamar o apt-get', () => {
    setup([], { chrome: false });
    fakeApt(0);
    const r = checkPackages();
    expect(r.status).toBe(14);
    expect(r.stderr).toContain('chromium');
    expect(existsSync(path.join(dir, 'apt-log'))).toBe(false);
  });
});

describe('cloud.mjs passo: item fora do guia da rodada (etapa #1533, TE3, decisão 14 (4))', () => {
  let dir = '';
  let guide = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'passo-fora-'));
    guide = path.join(dir, 'guia.md');
    spawnSync('node', ['scripts/testing/round-guide.mjs', 'R0', 'R22', '--out', guide]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const passo = (...itens: string[]) =>
    spawnSync(
      'node',
      ['scripts/testing/cloud.mjs', 'passo', ...itens, `--guia=${guide}`],
      {
        encoding: 'utf8',
      },
    );

  it('R12.4 sem o R12 no guia imprime o passo do docs/TESTING.md, com a primeira linha dizendo', () => {
    const r = passo('R12.4');
    expect(r.status).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines[0]).toBe('fora do guia da rodada (lido do docs/TESTING.md)');
    expect(r.stdout).toMatch(/^\| R12\.4 \|/m);
  });

  it('um item do guia e outro de fora saem juntos, cada um com a sua marca', () => {
    const r = passo('R22.4', 'R12.4');
    expect(r.status).toBe(0);
    expect(r.stdout.match(/fora do guia da rodada/g)).toHaveLength(1);
    expect(r.stdout.indexOf('R22.4')).toBeLessThan(r.stdout.indexOf('fora do guia'));
  });

  it('item que o guia inteiro também não tem sai com código 2', () => {
    const r = passo('R99.1');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/R99\.1 não está/);
    expect(passo('R12.999').status).toBe(2);
  });
});
