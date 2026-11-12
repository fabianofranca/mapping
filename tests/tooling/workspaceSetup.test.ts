// @vitest-environment node
// Etapa #681, fase WA2: `examples/workspace/setup.sh` deixa o workspace inteiro na versão da
// tag (servidor, skill, bloco do AGENTS.md e o próprio script). Cada teste roda o script de
// verdade, contra uma "release" falsa em `file://` montada por `workspaceAssets.mjs`.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWorkspaceAssets } from '../../scripts/release/workspaceAssets.mjs';

const REPO = process.cwd();
const SKELETON = join(REPO, 'examples/workspace');
const BEGIN =
  '<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->';
const END = '<!-- mapping:end -->';
const OLD_AGENTS = readFileSync(
  join(REPO, 'tests/fixtures/workspace/AGENTS.old.md'),
  'utf8',
);
const REAL_SETUP = readFileSync(join(SKELETON, 'setup.sh'), 'utf8');
const REAL_AGENTS = readFileSync(join(SKELETON, 'AGENTS.md'), 'utf8');
const BLOCK = `${REAL_AGENTS.slice(REAL_AGENTS.indexOf(BEGIN), REAL_AGENTS.indexOf(END) + END.length)}\n`;
const RELEASE_SKILL = '# skill da release\n';
const RAW_SKILL = '# skill do raw (main)\n';
const RELEASE_WATCHER = '// watcher da release\n';
const OLD_WATCHER = '// watcher copiado à mão, antigo\n';
const RELEASE_EXTRACTOR = '// extrator da release\n';
const OLD_EXTRACTOR = '// extrator antigo\n';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
const tmp = (name: string): string => {
  const dir = mkdtempSync(join(tmpdir(), `wa-setup-${name}-`));
  dirs.push(dir);
  return dir;
};
const sha = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** `setup.sh` real com uma linha que conta as execuções, logo após `set -euo pipefail`. */
const COUNTED = REAL_SETUP.replace(
  'set -euo pipefail\n',
  'set -euo pipefail\n[ -z "${MAPPING_TEST_COUNT:-}" ] || echo run >> "$MAPPING_TEST_COUNT"\n',
);
const LOCAL_SETUP = `${COUNTED}# versão antiga, só para diferir\n`;

interface Env {
  release: string;
  raw: string;
  ws: string;
  count: string;
}

interface Options {
  /** Arquivos da release a não publicar (nem o `.sha256`). */
  omit?: string[];
  /** Não copia o `setup.sh` local para o workspace. */
  noLocalSetup?: boolean;
}

/** Monta release falsa, raw falso e uma cópia do esqueleto como workspace. */
function setup(options: Options = {}): Env {
  const root = tmp('root');
  mkdirSync(join(root, 'examples/workspace'), { recursive: true });
  mkdirSync(join(root, '.claude/skills/spec-author'), { recursive: true });
  writeFileSync(join(root, 'examples/workspace/setup.sh'), COUNTED);
  writeFileSync(join(root, 'examples/workspace/AGENTS.md'), REAL_AGENTS);
  writeFileSync(join(root, '.claude/skills/spec-author/SKILL.md'), RELEASE_SKILL);
  writeFileSync(join(root, 'examples/workspace/watch-comments.mjs'), RELEASE_WATCHER);
  const release = join(tmp('release'), 'rel');
  buildWorkspaceAssets(release, root);
  const server = "if (process.argv.includes('--version')) console.log('0.0.0-test');\n";
  writeFileSync(join(release, 'mapping-mcp.js'), server);
  writeFileSync(
    join(release, 'mapping-mcp.js.sha256'),
    `${sha(server)}  mapping-mcp.js\n`,
  );
  writeFileSync(join(release, 'mapping-signature.mjs'), RELEASE_EXTRACTOR);
  writeFileSync(
    join(release, 'mapping-signature.mjs.sha256'),
    `${sha(RELEASE_EXTRACTOR)}  mapping-signature.mjs\n`,
  );
  for (const name of options.omit ?? []) {
    rmSync(join(release, name));
    rmSync(join(release, `${name}.sha256`));
  }
  const raw = tmp('raw');
  mkdirSync(join(raw, '.claude/skills/spec-author'), { recursive: true });
  writeFileSync(join(raw, '.claude/skills/spec-author/SKILL.md'), RAW_SKILL);
  const ws = tmp('ws');
  cpSync(SKELETON, ws, { recursive: true, filter: (src) => !src.endsWith('setup.sh') });
  if (!options.noLocalSetup) {
    writeFileSync(join(ws, 'setup.sh'), LOCAL_SETUP);
    chmodSync(join(ws, 'setup.sh'), 0o755);
  }
  return { release, raw, ws, count: join(tmp('count'), 'count') };
}

/** Roda o `setup.sh` do workspace (síncrono: o `file://` não precisa de servidor). */
function run(env: Env, args: string[] = [], extraEnv: Record<string, string> = {}) {
  const result = spawnSync('bash', ['setup.sh', ...args], {
    cwd: env.ws,
    encoding: 'utf8',
    env: {
      ...process.env,
      MAPPING_RELEASE_BASE: `file://${env.release}`,
      MAPPING_RAW_BASE: `file://${env.raw}`,
      MAPPING_TEST_COUNT: env.count,
      ...extraEnv,
    },
  });
  return {
    status: result.status,
    out: result.stdout,
    err: result.stderr,
    all: result.stdout + result.stderr,
  };
}

const executions = (env: Env): number =>
  existsSync(env.count)
    ? readFileSync(env.count, 'utf8').split('\n').filter(Boolean).length
    : 0;

/** Caminho relativo -> hash do conteúdo (ou alvo do link) de tudo na pasta. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const key = relative(dir, path);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) out[key] = `link:${readlinkSync(path)}`;
      else if (stat.isDirectory()) {
        out[key] = 'dir';
        walk(path);
      } else out[key] = sha(readFileSync(path));
    }
  };
  walk(dir);
  return out;
}

const read = (env: Env, path: string): string => readFileSync(join(env.ws, path), 'utf8');
const write = (env: Env, path: string, text: string): void => {
  mkdirSync(join(env.ws, path, '..'), { recursive: true });
  writeFileSync(join(env.ws, path), text);
};
const backups = (env: Env): string[] =>
  readdirSync(env.ws).filter((name) => name.startsWith('AGENTS.md.bak-'));
const leftovers = (env: Env): string[] =>
  readdirSync(env.ws).filter(
    (name) => name.startsWith('.mapping-setup.') || name === 'setup.sh.new',
  );

describe('workspace novo (só o setup.sh)', () => {
  it('baixa e confere servidor e skill, cria o AGENTS.md e o link da skill, e imprime o resumo', () => {
    const env = setup({ noLocalSetup: true });
    writeFileSync(join(env.ws, 'setup.sh'), COUNTED);
    // O esqueleto não traz o AGENTS.md nem o link em um workspace novo.
    rmSync(join(env.ws, 'AGENTS.md'));
    rmSync(join(env.ws, 'watch-comments.mjs'));
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, 'watch-comments.mjs')).toBe(RELEASE_WATCHER);
    expect(result.out).toContain('Watcher: instalado');
    expect(read(env, 'tools/mapping-mcp.js')).toContain('0.0.0-test');
    expect(read(env, 'tools/mapping-mcp.js.sha256')).toContain('mapping-mcp.js');
    expect(read(env, '.agents/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
    expect(lstatSync(join(env.ws, '.claude/skills/spec-author')).isSymbolicLink()).toBe(
      true,
    );
    expect(read(env, '.claude/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
    const agents = read(env, 'AGENTS.md');
    expect(
      agents.startsWith('# Mapeamentos\n\n## Para que servem estes mapeamentos\n\n<!--'),
    ).toBe(true);
    expect(agents.endsWith(`\n\n${BLOCK}`)).toBe(true);
    expect(result.out).toContain('Servidor: 0.0.0-test');
    expect(result.out).toContain('Skill: release');
    expect(result.out).toContain('AGENTS.md: criado');
    expect(result.out).toContain('Pronto.');
    expect(leftovers(env)).toEqual([]);
  });
});

describe('watcher (watch-comments.mjs)', () => {
  it('cópia antiga à mão: é trocada pela da release, sem backup, e o resumo diz atualizado', () => {
    const env = setup();
    write(env, 'watch-comments.mjs', OLD_WATCHER);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, 'watch-comments.mjs')).toBe(RELEASE_WATCHER);
    expect(result.out).toContain('Watcher: atualizado');
    expect(readdirSync(env.ws).filter((n) => n.includes('watch-comments.mjs.'))).toEqual(
      [],
    );
  });

  it('release sem o watcher: aviso, o arquivo local intacto e o resto do setup segue', () => {
    const env = setup({ omit: ['watch-comments.mjs'] });
    write(env, 'watch-comments.mjs', OLD_WATCHER);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(result.err).toContain('watch-comments.mjs');
    expect(read(env, 'watch-comments.mjs')).toBe(OLD_WATCHER);
    expect(result.out).toContain('Watcher: não atualizado (release sem o watcher)');
    expect(result.out).toContain('Servidor: 0.0.0-test');
  });

  it('release sem o watcher e sem arquivo local: continua ausente', () => {
    const env = setup({ omit: ['watch-comments.mjs'] });
    rmSync(join(env.ws, 'watch-comments.mjs'));
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(existsSync(join(env.ws, 'watch-comments.mjs'))).toBe(false);
    expect(result.out).toContain('Watcher: não atualizado (release sem o watcher)');
  });

  it('cópia igual à da release: sem mudança', () => {
    const env = setup();
    write(env, 'watch-comments.mjs', RELEASE_WATCHER);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(result.out).toContain('Watcher: sem mudança');
  });
});

describe('autoatualização', () => {
  it('troca o setup.sh, avisa e roda de novo uma vez só', () => {
    const env = setup();
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(result.all).toContain('setup.sh atualizado');
    expect(executions(env)).toBe(2);
    expect(read(env, 'setup.sh')).toBe(COUNTED);
    expect(statSync(join(env.ws, 'setup.sh')).mode & 0o111).not.toBe(0);
    expect(result.out).toContain('Pronto.');
    expect(leftovers(env)).toEqual([]);
  });

  it('--no-self-update (antes ou depois da tag) não troca', () => {
    for (const args of [
      ['--no-self-update'],
      ['mcp-v0.0.0', '--no-self-update'],
      ['--no-self-update', 'mcp-v0.0.0'],
    ]) {
      const env = setup();
      const result = run(env, args);
      expect(result.status, result.all).toBe(0);
      expect(executions(env)).toBe(1);
      expect(read(env, 'setup.sh')).toBe(LOCAL_SETUP);
      expect(result.out).toContain('Pronto.');
    }
  });

  it('MAPPING_SETUP_UPDATED=1 não troca', () => {
    const env = setup();
    const result = run(env, [], { MAPPING_SETUP_UPDATED: '1' });
    expect(result.status, result.all).toBe(0);
    expect(executions(env)).toBe(1);
    expect(read(env, 'setup.sh')).toBe(LOCAL_SETUP);
  });

  it('release sem setup.sh: segue com o atual e avisa', () => {
    const env = setup({ omit: ['setup.sh'] });
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(executions(env)).toBe(1);
    expect(read(env, 'setup.sh')).toBe(LOCAL_SETUP);
    expect(result.err).toContain('setup.sh');
    expect(result.out).toContain('Pronto.');
  });
});

describe('sha256 divergente', () => {
  it.each([
    'mapping-mcp.js',
    'setup.sh',
    'SKILL.md',
    'AGENTS.mapping.md',
    'watch-comments.mjs',
    'mapping-signature.mjs',
  ])('em %s: sai com erro e nada muda', (name) => {
    const env = setup();
    write(env, 'tools/mapping-mcp.js', 'servidor antigo\n');
    write(env, '.agents/skills/spec-author/SKILL.md', 'skill antiga\n');
    write(env, 'watch-comments.mjs', OLD_WATCHER);
    write(env, 'tools/mapping-signature.mjs', OLD_EXTRACTOR);
    write(env, 'AGENTS.md', `# Mapeamentos\n\nmeu texto\n\n${BEGIN}\nvelho\n${END}\n`);
    const file = join(env.release, name);
    writeFileSync(file, `${readFileSync(file, 'utf8')}adulterado\n`);
    const before = snapshot(env.ws);
    const result = run(env);
    expect(result.status).not.toBe(0);
    expect(snapshot(env.ws)).toEqual(before);
    expect(backups(env)).toEqual([]);
    expect(leftovers(env)).toEqual([]);
    expect(executions(env)).toBe(1);
  });
});

describe('extrator de assinaturas (tools/mapping-signature.mjs)', () => {
  it('instala o arquivo e o .sha256 em tools/ e imprime o resumo', () => {
    const env = setup();
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, 'tools/mapping-signature.mjs')).toBe(RELEASE_EXTRACTOR);
    expect(read(env, 'tools/mapping-signature.mjs.sha256')).toContain(
      sha(RELEASE_EXTRACTOR),
    );
    expect(result.out).toContain('Extrator: instalado');
    expect(leftovers(env)).toEqual([]);
  });

  it('segunda execução: sem mudança; arquivo diferente: atualizado', () => {
    const env = setup();
    run(env);
    expect(run(env).out).toContain('Extrator: sem mudança');
    write(env, 'tools/mapping-signature.mjs', OLD_EXTRACTOR);
    const result = run(env);
    expect(result.out).toContain('Extrator: atualizado');
    expect(read(env, 'tools/mapping-signature.mjs')).toBe(RELEASE_EXTRACTOR);
  });

  it('release sem o extrator: só o aviso, o arquivo local fica e o resto segue', () => {
    const env = setup({ omit: ['mapping-signature.mjs'] });
    write(env, 'tools/mapping-signature.mjs', OLD_EXTRACTOR);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(result.err).toContain('mapping-signature.mjs');
    expect(read(env, 'tools/mapping-signature.mjs')).toBe(OLD_EXTRACTOR);
    expect(result.out).toContain('Extrator: não atualizado (release sem o extrator)');
    expect(read(env, 'tools/mapping-mcp.js')).toContain('0.0.0-test');
  });
});

describe('skill', () => {
  it('vem da mesma origem do servidor (a release), não do raw', () => {
    const env = setup();
    run(env);
    expect(read(env, '.agents/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
  });

  it('ausente na release: cai para o raw, com aviso', () => {
    const env = setup({ omit: ['SKILL.md'] });
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, '.agents/skills/spec-author/SKILL.md')).toBe(RAW_SKILL);
    expect(result.err).toContain('SKILL.md');
    expect(result.out).toContain('main (release antiga)');
  });

  it('.claude/skills/spec-author como cópia (pasta real) é copiada de novo', () => {
    const env = setup();
    write(env, '.claude/skills/spec-author/SKILL.md', 'cópia velha\n');
    write(env, '.claude/skills/spec-author/extra.md', 'sobra\n');
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(lstatSync(join(env.ws, '.claude/skills/spec-author')).isDirectory()).toBe(
      true,
    );
    expect(read(env, '.claude/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
    expect(existsSync(join(env.ws, '.claude/skills/spec-author/extra.md'))).toBe(false);
  });

  it('.claude/skills/spec-author como link continua link e não muda', () => {
    const env = setup();
    mkdirSync(join(env.ws, '.claude/skills'), { recursive: true });
    mkdirSync(join(env.ws, '.agents/skills/spec-author'), { recursive: true });
    symlinkSync(
      '../../.agents/skills/spec-author',
      join(env.ws, '.claude/skills/spec-author'),
    );
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(readlinkSync(join(env.ws, '.claude/skills/spec-author'))).toBe(
      '../../.agents/skills/spec-author',
    );
    expect(read(env, '.claude/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
  });
});

describe('bloco do AGENTS.md', () => {
  const OLD_BLOCK = `${BEGIN}\nconteúdo velho\n${END}\n`;

  it.each([
    [
      'com texto antes e depois',
      `# Mapeamentos\r\n\r\nmeu texto\r\n\r\n${OLD_BLOCK}\r\ntexto do dono\n`,
    ],
    ['sem newline final', `# Mapeamentos\n\nmeu texto\n${OLD_BLOCK}depois sem newline`],
  ])('só o trecho entre os marcadores muda (%s)', (_name, original) => {
    const env = setup();
    write(env, 'AGENTS.md', original);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    const start = original.indexOf(BEGIN);
    const endAt = original.indexOf(END) + END.length;
    const afterOriginal = original.slice(endAt).replace(/^\n/, '');
    expect(read(env, 'AGENTS.md')).toBe(
      original.slice(0, start) + BLOCK.replace(/\n$/, '') + '\n' + afterOriginal,
    );
    expect(result.out).toContain('AGENTS.md: atualizado');
    expect(backups(env)).toHaveLength(1);
    expect(readFileSync(join(env.ws, backups(env)[0] as string), 'utf8')).toBe(original);
  });
});

describe('AGENTS.md antigo (sem marcadores)', () => {
  const purpose = 'Documentar as telas do app X.\n';
  const old = OLD_AGENTS.replace(/<!--[\s\S]*?-->\n/, purpose);

  it('estrutura reconhecida: migra, com backup, preservando "Para que servem"', () => {
    const env = setup();
    write(env, 'AGENTS.md', old);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    const from = old.indexOf('## Para que servem estes mapeamentos');
    const section = old.slice(from, old.indexOf('## Estrutura'));
    expect(section).toContain(purpose);
    expect(read(env, 'AGENTS.md')).toBe(`# Mapeamentos\n\n${section}${BLOCK}`);
    expect(backups(env)).toHaveLength(1);
    expect(readFileSync(join(env.ws, backups(env)[0] as string), 'utf8')).toBe(old);
    expect(backups(env)[0]).toMatch(/^AGENTS\.md\.bak-\d{8}-\d{6}$/);
    expect(result.out).toContain('AGENTS.md: migrado');
  });

  it('estrutura não reconhecida: backup, bloco no fim, aviso e nada apagado', () => {
    const env = setup();
    const custom = `${old}\n## Seção do dono\n\nalgo meu\n`;
    write(env, 'AGENTS.md', custom);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    const after = read(env, 'AGENTS.md');
    expect(after.startsWith(custom)).toBe(true);
    expect(after.endsWith(`\n\n${BLOCK}`)).toBe(true);
    expect(backups(env)).toHaveLength(1);
    expect(readFileSync(join(env.ws, backups(env)[0] as string), 'utf8')).toBe(custom);
    expect(result.err).toContain('revise o AGENTS.md');
    expect(result.out).toContain('não reconhecido');
  });
});

describe('marcadores quebrados', () => {
  it.each([
    ['só o begin', `# M\n\n${BEGIN}\nvelho\n`],
    ['só o end', `# M\n\nvelho\n${END}\n`],
    ['fora de ordem', `# M\n\n${END}\nvelho\n${BEGIN}\n`],
    ['begin duplicado', `# M\n${BEGIN}\na\n${BEGIN}\nb\n${END}\n`],
  ])('%s: arquivo intacto, aviso e sem backup', (_name, original) => {
    const env = setup();
    write(env, 'AGENTS.md', original);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, 'AGENTS.md')).toBe(original);
    expect(backups(env)).toEqual([]);
    expect(result.err).toContain('marcadores');
    expect(result.out).toContain('marcadores quebrados: não alterado');
  });
});

describe('idempotência', () => {
  it('rodar de novo sem nada novo não muda nenhum arquivo nem cria backup', () => {
    const env = setup();
    const first = run(env);
    expect(first.status, first.all).toBe(0);
    const before = snapshot(env.ws);
    const second = run(env);
    expect(second.status, second.all).toBe(0);
    expect(snapshot(env.ws)).toEqual(before);
    expect(second.out).toContain('AGENTS.md: sem mudança');
    expect(second.out).toContain('Watcher: sem mudança');
  });

  it('migra um AGENTS.md antigo grande sem SIGPIPE (status 141 sob carga)', () => {
    const env = setup();
    // Depois do "## Estrutura" há muito mais que o buffer do pipe: o `tail` ainda escreve
    // quando o `head` já saiu. Com `set -o pipefail`, isso vira status 141 (causa da falha
    // intermitente "expected 141 to be +0").
    write(
      env,
      'AGENTS.md',
      `${OLD_AGENTS}\n${'linha de enchimento do esqueleto antigo\n'.repeat(20000)}`,
    );
    const result = run(env);
    expect(result.status, result.all).toBe(0);
  });

  it('vale também depois da migração', () => {
    const env = setup();
    write(env, 'AGENTS.md', OLD_AGENTS);
    expect(run(env).status).toBe(0);
    expect(backups(env)).toHaveLength(1);
    const before = snapshot(env.ws);
    const second = run(env);
    expect(second.status, second.all).toBe(0);
    expect(snapshot(env.ws)).toEqual(before);
    expect(second.out).toContain('AGENTS.md: sem mudança');
  });
});

describe('o que nunca é tocado', () => {
  it('projetos/, especializacoes/, CLAUDE.md e as configs dos clientes ficam iguais', () => {
    const env = setup();
    write(env, 'projetos/a/mapping.json', '{"x":1}\n');
    write(env, 'especializacoes/s.json', '{"id":"s"}\n');
    write(env, 'CLAUDE.md', '# meu claude\n');
    write(
      env,
      '.mcp.json',
      '{"mcpServers":{"outro":{"command":"x"},"mapping":{"command":"node"}}}\n',
    );
    write(env, '.cursor/mcp.json', '{"mcpServers":{"outro":{"command":"y"}}}\n');
    const paths = [
      'projetos/a/mapping.json',
      'especializacoes/s.json',
      'CLAUDE.md',
      '.mcp.json',
      '.cursor/mcp.json',
    ];
    const before = paths.map((p) => sha(read(env, p)));
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(paths.map((p) => sha(read(env, p)))).toEqual(before);
  });

  it('não cria o CLAUDE.md quando ele não existe', () => {
    const env = setup();
    rmSync(join(env.ws, 'CLAUDE.md'), { force: true });
    run(env);
    expect(existsSync(join(env.ws, 'CLAUDE.md'))).toBe(false);
  });
});

// Etapa #877 (SD1): o download da release mostra o motivo da falha, tenta de novo e, quando o
// GitHub responde 5xx ou não responde, usa a API de assets. Um servidor `node:http` local imita
// `github.com`, `api.github.com` e a CDN dos assets; o `setup.sh` real aponta para ele por
// `MAPPING_GITHUB_BASE` e `MAPPING_GITHUB_API`, sem `MAPPING_RELEASE_BASE`.
const SLOW = 40_000;

interface MockOptions {
  /** Status do download direto (arquivo, nº da requisição àquela URL); 200 serve o arquivo. */
  direct?: (file: string, n: number) => number;
  /** Status do JSON da release (`releases/latest` ou `releases/tags/<tag>`). */
  api?: number;
  /** Status do download do asset pela API. */
  asset?: number;
  /** Assets cujo conteúdo, pela API, sai adulterado. */
  tamper?: string[];
}

interface Mock {
  base: string;
  calls: string[];
  close: () => Promise<void>;
}

const REPO_PATH = '/fabianofranca/mapping';
const API_PATH = '/api/repos/fabianofranca/mapping';

async function startMock(env: Env, options: MockOptions = {}): Promise<Mock> {
  const calls: string[] = [];
  const counts = new Map<string, number>();
  const names = readdirSync(env.release).sort();
  const idOf = (name: string): number => names.indexOf(name) + 1;
  const body = (name: string, tamper: boolean): Buffer => {
    const data = readFileSync(join(env.release, name));
    return tamper ? Buffer.concat([data, Buffer.from('adulterado\n')]) : data;
  };
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    calls.push(`${req.method} ${url}`);
    const n = (counts.get(url) ?? 0) + 1;
    counts.set(url, n);
    const send = (status: number, data: string | Buffer = 'erro', headers = {}): void => {
      res.writeHead(status, headers);
      res.end(data);
    };
    const direct = new RegExp(
      `^${REPO_PATH}/releases/(?:latest/download|download/[^/]+)/([^/]+)$`,
    ).exec(url);
    if (direct) {
      const file = direct[1] as string;
      const status = options.direct?.(file, n) ?? 200;
      if (status !== 200) return send(status);
      return names.includes(file)
        ? send(200, body(file, false))
        : send(404, 'não existe');
    }
    if (new RegExp(`^${API_PATH}/releases/(?:latest|tags/[^/]+)$`).test(url)) {
      const status = options.api ?? 200;
      if (status !== 200) return send(status);
      const assets = names.map((name) => ({ name, id: idOf(name) }));
      return send(200, JSON.stringify({ tag_name: 'mcp-v0.0.0', assets }), {
        'content-type': 'application/json',
      });
    }
    const asset = new RegExp(`^${API_PATH}/releases/assets/(\\d+)$`).exec(url);
    if (asset) {
      const status = options.asset ?? 200;
      if (status !== 200) return send(status);
      if (req.headers.accept !== 'application/octet-stream') return send(415);
      return send(302, '', { location: `/cdn/${asset[1]}` });
    }
    const cdn = /^\/cdn\/(\d+)$/.exec(url);
    if (cdn) {
      const name = names[Number(cdn[1]) - 1] as string;
      return send(200, body(name, options.tamper?.includes(name) ?? false));
    }
    return send(404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Roda o `setup.sh` apontando para o servidor local (assíncrono, para o servidor responder). */
function runMock(
  env: Env,
  base: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
): Promise<{ status: number | null; out: string; err: string; all: string }> {
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    MAPPING_GITHUB_BASE: base,
    MAPPING_GITHUB_API: `${base}/api`,
    MAPPING_RAW_BASE: `file://${env.raw}`,
    MAPPING_TEST_COUNT: env.count,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    ...extraEnv,
  };
  delete childEnv.MAPPING_RELEASE_BASE;
  Object.assign(childEnv, extraEnv);
  return new Promise((resolve) => {
    const child = spawn('bash', ['setup.sh', ...args], {
      cwd: env.ws,
      env: childEnv as NodeJS.ProcessEnv,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('close', (status) => resolve({ status, out, err, all: out + err }));
  });
}

const apiCalls = (mock: Mock): string[] => mock.calls.filter((c) => c.includes('/api/'));
const releaseJsonCalls = (mock: Mock): string[] =>
  mock.calls.filter((c) => /\/releases\/(latest|tags\/[^/]+)$/.test(c));

describe('download da release (etapa #877)', () => {
  it(
    '504 no download direto e 200 na API: instala pelo segundo caminho, com aviso e sha256 conferidos',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: () => 504 });
      try {
        const result = await runMock(env, mock.base, ['--no-self-update']);
        expect(result.status, result.all).toBe(0);
        expect(result.err).toContain(
          'download direto falhou (HTTP 504); usando a API de assets do GitHub',
        );
        expect(result.out).toContain('Servidor: 0.0.0-test');
        expect(result.out).toContain('Skill: release');
        expect(result.out).toContain('AGENTS.md:');
        expect(read(env, 'tools/mapping-mcp.js')).toContain('0.0.0-test');
        expect(read(env, '.agents/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
        // O JSON da release é lido uma vez por execução, não uma vez por arquivo.
        expect(releaseJsonCalls(mock)).toHaveLength(1);
        expect(leftovers(env)).toEqual([]);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    '504 nos dois caminhos: erro com o HTTP, o que fazer, os dois códigos, e a pasta fica igual',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: () => 504, api: 504 });
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base);
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('o GitHub não respondeu (HTTP 504)');
        expect(result.err).toContain('mapping-mcp.js');
        expect(result.err).toContain('Tente de novo em alguns minutos');
        expect(result.err).toContain('API de assets');
        expect(snapshot(env.ws)).toEqual(before);
        expect(executions(env)).toBe(1);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    '404 nos dois caminhos: diz que a release não traz o arquivo, sem chamar a API, pasta igual',
    async () => {
      const env = setup({ omit: ['mapping-mcp.js'] });
      const mock = await startMock(env);
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base);
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('não traz mapping-mcp.js (HTTP 404)');
        expect(result.err).toContain('https://github.com/fabianofranca/mapping/releases');
        expect(apiCalls(mock)).toEqual([]);
        expect(snapshot(env.ws)).toEqual(before);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'falha de rede (porta fechada): cita o host e o motivo do curl, sem segundo caminho de sucesso',
    async () => {
      const env = setup();
      const closed = await startMock(env);
      const base = closed.base;
      await closed.close();
      const before = snapshot(env.ws);
      const result = await runMock(env, base);
      expect(result.status).not.toBe(0);
      expect(result.err).toContain('sem resposta de 127.0.0.1');
      expect(result.err).toContain('curl: (7)');
      expect(result.err).toContain('Confira a rede');
      expect(snapshot(env.ws)).toEqual(before);
    },
    SLOW,
  );

  it(
    'falha passageira: 503 na primeira tentativa e 200 na segunda instala sem o segundo caminho',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: (_file, n) => (n === 1 ? 503 : 200) });
      try {
        const result = await runMock(env, mock.base, ['--no-self-update']);
        expect(result.status, result.all).toBe(0);
        expect(result.err).not.toContain('API de assets');
        expect(apiCalls(mock)).toEqual([]);
        expect(result.out).toContain('Servidor: 0.0.0-test');
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'com tag, o segundo caminho lê releases/tags/<tag>',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: () => 504 });
      try {
        const result = await runMock(env, mock.base, ['mcp-v9.9.9', '--no-self-update']);
        expect(result.status, result.all).toBe(0);
        expect(mock.calls).toContain(`GET ${API_PATH}/releases/tags/mcp-v9.9.9`);
        expect(mock.calls.some((c) => c.endsWith('/releases/latest'))).toBe(false);
        expect(
          mock.calls.some((c) =>
            c.startsWith(`GET ${REPO_PATH}/releases/download/mcp-v9.9.9/`),
          ),
        ).toBe(true);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'sha256 divergente no segundo caminho: erro "não confere" e a pasta fica igual',
    async () => {
      const env = setup();
      const mock = await startMock(env, {
        direct: () => 504,
        tamper: ['mapping-mcp.js'],
      });
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base);
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('não confere');
        expect(snapshot(env.ws)).toEqual(before);
        expect(leftovers(env)).toEqual([]);
        expect(executions(env)).toBe(1);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'MAPPING_RELEASE_BASE definida: 5xx não aciona o segundo caminho',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: () => 504 });
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base, [], {
          MAPPING_RELEASE_BASE: `${mock.base}${REPO_PATH}/releases/latest/download`,
        });
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('HTTP 504');
        expect(apiCalls(mock)).toEqual([]);
        expect(snapshot(env.ws)).toEqual(before);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'opcional ausente (404 do setup.sh): só avisa "release antiga", agora com o HTTP',
    async () => {
      const env = setup({ omit: ['setup.sh'] });
      const mock = await startMock(env);
      try {
        const result = await runMock(env, mock.base);
        expect(result.status, result.all).toBe(0);
        expect(result.err).toContain('não traz setup.sh');
        expect(result.err).toContain('release antiga');
        expect(result.err).toContain('HTTP 404');
        expect(apiCalls(mock)).toEqual([]);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'SKILL.md da release fora do ar (5xx nos dois): erro, sem cair para a skill da main',
    async () => {
      const env = setup();
      const mock = await startMock(env, {
        direct: (file) => (file.startsWith('SKILL.md') ? 503 : 200),
        asset: 504,
      });
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base);
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('SKILL.md');
        expect(result.err).toContain('HTTP 50');
        expect(result.err).not.toContain('usando a skill da main');
        expect(snapshot(env.ws)).toEqual(before);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it('arquivo ausente em file://: a mensagem também traz o HTTP 404', () => {
    const env = setup({ omit: ['mapping-mcp.js'] });
    const result = run(env);
    expect(result.status).not.toBe(0);
    expect(result.err).toContain('não traz mapping-mcp.js (HTTP 404)');
  });
});
