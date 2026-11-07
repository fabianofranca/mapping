// @vitest-environment node
// Etapa #681, fase WA2: `examples/workspace/setup.sh` deixa o workspace inteiro na versão da
// tag (servidor, skill, bloco do AGENTS.md e o próprio script). Cada teste roda o script de
// verdade, contra uma "release" falsa em `file://` montada por `workspaceAssets.mjs`.
import { spawnSync } from 'node:child_process';
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
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
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
  const release = join(tmp('release'), 'rel');
  buildWorkspaceAssets(release, root);
  const server = "if (process.argv.includes('--version')) console.log('0.0.0-test');\n";
  writeFileSync(join(release, 'mapping-mcp.js'), server);
  writeFileSync(
    join(release, 'mapping-mcp.js.sha256'),
    `${sha(server)}  mapping-mcp.js\n`,
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

/** Roda o `setup.sh` do workspace. */
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
    const result = run(env);
    expect(result.status, result.all).toBe(0);
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
  it.each(['mapping-mcp.js', 'setup.sh', 'SKILL.md', 'AGENTS.mapping.md'])(
    'em %s: sai com erro e nada muda',
    (name) => {
      const env = setup();
      write(env, 'tools/mapping-mcp.js', 'servidor antigo\n');
      write(env, '.agents/skills/spec-author/SKILL.md', 'skill antiga\n');
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
    },
  );
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
