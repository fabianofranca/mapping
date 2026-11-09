// @vitest-environment node
// Fase TR1 (etapa #359): os auxiliares da nuvem em `scripts/testing/` (decisão 2) existem, o
// `cloud.mjs` importa sem efeito colateral e exporta os nomes certos, o guia aponta para eles
// (decisão 4) e a parte pura de `cloud.mjs` (`mark`) tem teste unitário.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

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
  'waitForWindow',
  'windowShortcut',
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
        'mcp-stdio-client.mjs',
        'mock-github-release.mjs',
        'round-guide.d.mts',
        'round-guide.mjs',
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
      writeFileSync(path.join(dir, 'env'), ENV_LINE);
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
      expect(() => loadEnv(dir, {})).toThrow('apoio/env não existe: rode o cloud-up.sh');
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
