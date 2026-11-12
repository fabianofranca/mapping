// @vitest-environment node
// Etapa #681, fase WA1: cada release do MCP traz os arquivos do workspace (`setup.sh`, `SKILL.md`
// e `AGENTS.mapping.md`, com `sha256`), montados por `scripts/release/workspaceAssets.mjs`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/release/workspaceAssets.mjs';
const BEGIN =
  '<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->';
const END = '<!-- mapping:end -->';
const read = (path: string): string => readFileSync(path, 'utf8');

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'wa-assets-'));
  dirs.push(dir);
  return dir;
};

/** Esqueleto mínimo (setup.sh, skill e AGENTS.md) numa pasta de teste. */
function fakeRoot(agents: string): string {
  const root = tmp();
  mkdirSync(join(root, 'examples/workspace'), { recursive: true });
  mkdirSync(join(root, '.claude/skills/spec-author'), { recursive: true });
  writeFileSync(
    join(root, 'examples/workspace/setup.sh'),
    '#!/usr/bin/env bash\necho oi\n',
  );
  writeFileSync(join(root, '.claude/skills/spec-author/SKILL.md'), '# skill\n');
  writeFileSync(join(root, 'examples/workspace/watch-comments.mjs'), '// watcher\n');
  writeFileSync(join(root, 'examples/workspace/AGENTS.md'), agents);
  return root;
}

function run(out: string, root?: string) {
  const args = [SCRIPT, out, ...(root ? ['--root', root] : [])];
  return spawnSync('node', args, { encoding: 'utf8' });
}

describe('o esqueleto examples/workspace/AGENTS.md', () => {
  const text = read('examples/workspace/AGENTS.md');
  const count = (s: string): number => text.split(s).length - 1;

  it('tem exatamente um bloco gerenciado, com os marcadores na ordem', () => {
    expect(count(BEGIN)).toBe(1);
    expect(count(END)).toBe(1);
    expect(text.indexOf(BEGIN)).toBeLessThan(text.indexOf(END));
  });

  it('"Para que servem estes mapeamentos" fica fora do bloco, depois do título', () => {
    const purpose = text.indexOf('## Para que servem estes mapeamentos');
    expect(purpose).toBeGreaterThan(text.indexOf('# Mapeamentos'));
    expect(purpose).toBeLessThan(text.indexOf(BEGIN));
  });

  it('o bloco vai da introdução até o fim de "Fluxo típico"', () => {
    const block = text.slice(text.indexOf(BEGIN), text.indexOf(END) + END.length);
    expect(block).toContain('Esta pasta centraliza');
    expect(block).toContain('## Fluxo típico');
    expect(block).not.toContain('Para que servem');
    expect(text.slice(text.indexOf(END) + END.length).trim()).toBe('');
  });

  it('o bloco manda aplicar a biblioteca por proposta, com a pasta, e não diz que ela é recusada', () => {
    const block = text.slice(text.indexOf(BEGIN), text.indexOf(END) + END.length);
    expect(block).not.toContain('recusa pacote v4');
    const item =
      block.split('\n').find((l) => l.startsWith('- **Especializações nascem')) ?? '';
    expect(item).toContain('`apply_specialization`');
    expect(item).toContain('`update_specialization`');
    expect(item).toMatch(/`file`\s*=\s*a pasta/);
  });
});

describe('scripts/release/workspaceAssets.mjs', () => {
  it('grava os quatro arquivos e os quatro .sha256, e imprime a lista (um por linha)', () => {
    const out = tmp();
    const result = run(out);
    expect(result.status, result.stderr).toBe(0);
    const files = result.stdout.trim().split('\n');
    expect(files.map((f) => f.split(/[\\/]/).pop())).toEqual([
      'setup.sh',
      'setup.sh.sha256',
      'SKILL.md',
      'SKILL.md.sha256',
      'AGENTS.mapping.md',
      'AGENTS.mapping.md.sha256',
      'watch-comments.mjs',
      'watch-comments.mjs.sha256',
    ]);
    for (const file of files) expect(read(file).length).toBeGreaterThan(0);
  });

  it('cada .sha256 confere com sha256sum -c na pasta de saída', () => {
    const out = tmp();
    expect(run(out).status).toBe(0);
    for (const name of [
      'setup.sh',
      'SKILL.md',
      'AGENTS.mapping.md',
      'watch-comments.mjs',
    ]) {
      const check = spawnSync('sha256sum', ['-c', `${name}.sha256`], {
        cwd: out,
        encoding: 'utf8',
      });
      expect(check.status, check.stderr).toBe(0);
      expect(check.stdout).toContain(`${name}: OK`);
    }
  });

  it('setup.sh, SKILL.md e watch-comments.mjs são cópias, e o AGENTS.mapping.md é o trecho entre os marcadores (inclusive)', () => {
    const out = tmp();
    expect(run(out).status).toBe(0);
    expect(read(join(out, 'setup.sh'))).toBe(read('examples/workspace/setup.sh'));
    expect(read(join(out, 'SKILL.md'))).toBe(read('.claude/skills/spec-author/SKILL.md'));
    expect(read(join(out, 'watch-comments.mjs'))).toBe(
      read('examples/workspace/watch-comments.mjs'),
    );
    const agents = read('examples/workspace/AGENTS.md');
    const block = agents.slice(agents.indexOf(BEGIN), agents.indexOf(END) + END.length);
    expect(read(join(out, 'AGENTS.mapping.md'))).toBe(`${block}\n`);
  });

  it('cria a pasta de saída se ela não existe', () => {
    const out = join(tmp(), 'novo/dist-mcp');
    expect(run(out).status).toBe(0);
    expect(read(join(out, 'setup.sh'))).toContain('#!');
  });

  it('falha, com mensagem clara, se o esqueleto não tem bloco', () => {
    const result = run(tmp(), fakeRoot('# Mapeamentos\n\ntexto\n'));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('AGENTS.md');
    expect(result.stderr).toMatch(/nenhum bloco|sem bloco/i);
  });

  it('falha se o esqueleto tem dois blocos', () => {
    const block = `${BEGIN}\nregras\n${END}\n`;
    const result = run(tmp(), fakeRoot(`# T\n\n${block}\n${block}`));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/exatamente um bloco/i);
  });

  it('falha se o fim vem antes do começo', () => {
    const result = run(tmp(), fakeRoot(`# T\n\n${END}\nregras\n${BEGIN}\n`));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/ordem|antes do começo/i);
  });

  it('falha, citando o arquivo, se falta o watch-comments.mjs de origem', () => {
    const root = fakeRoot(`${BEGIN}\nx\n${END}\n`);
    rmSync(join(root, 'examples/workspace/watch-comments.mjs'));
    const result = run(tmp(), root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('watch-comments.mjs');
  });

  it('falha se falta um arquivo de origem', () => {
    const root = fakeRoot(`${BEGIN}\nx\n${END}\n`);
    rmSync(join(root, '.claude/skills/spec-author/SKILL.md'));
    const result = run(tmp(), root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SKILL.md');
  });
});

describe('os workflows de release publicam os arquivos do workspace', () => {
  const commandsOf = (yaml: string, verb: string): string[] =>
    yaml
      .split(/\n(?=\s*(?:- name:|- run:|- uses:))/)
      .join('\n')
      .split(/\n(?=\s*(?:gh release create|gh release upload))/)
      .filter((chunk) => new RegExp(`^\\s*gh release ${verb}`).test(chunk))
      .map((chunk) => chunk.split(/\n\s*\n|\n {6,8}- /)[0] ?? '');

  const cases: [string, string, string, string[]][] = [
    [
      'snapshot',
      '.github/workflows/mcp-prerelease.yml',
      'snapshot-publish',
      ['create', 'upload'],
    ],
    ['rc', '.github/workflows/mcp-prerelease.yml', 'rc-publish', ['create']],
    ['estável', '.github/workflows/mcp-release.yml', 'release', ['create', 'upload']],
  ];

  const jobOf = (yaml: string, name: string): string => {
    const start = yaml.indexOf(`\n  ${name}:\n`);
    const rest = yaml.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/);
    return end < 0 ? rest : rest.slice(0, end + 1);
  };

  it('cada job que compila roda o script uma vez, depois do Checksum, em release-assets/', () => {
    const call = 'node scripts/release/workspaceAssets.mjs release-assets';
    const prerelease = read('.github/workflows/mcp-prerelease.yml');
    const release = read('.github/workflows/mcp-release.yml');
    const jobs = [
      jobOf(prerelease, 'snapshot-build'),
      jobOf(prerelease, 'rc-build'),
      jobOf(release, 'release'),
    ];
    for (const job of jobs) {
      expect(job.split(call).length - 1).toBe(1);
      expect(job.indexOf('name: Checksum')).toBeLessThan(job.indexOf(call));
      expect(job).toContain(
        'cp dist-mcp/mapping-mcp.js dist-mcp/mapping-mcp.js.sha256 release-assets/',
      );
      // O extrator (S3 da #1079) vai junto, com o hash, e é testado fora do repositório.
      expect(job).toContain(
        'cp dist-mcp/mapping-signature.mjs dist-mcp/mapping-signature.mjs.sha256 release-assets/',
      );
      expect(job).toContain('sha256sum mapping-signature.mjs > mapping-signature.mjs.sha256');
      expect(job).toContain('node mapping-signature.mjs --help');
    }
  });

  for (const [job, file, name, verbs] of cases) {
    for (const verb of verbs) {
      it(`${job}: gh release ${verb} leva tudo o que está em release-assets/`, () => {
        const chunk = jobOf(read(file), name);
        const commands = commandsOf(chunk, verb);
        expect(commands.length).toBeGreaterThan(0);
        expect(chunk).toContain('assets=(release-assets/*)');
        for (const command of commands) expect(command).toContain('"${assets[@]}"');
      });
    }
  }

  it('as notas das releases citam a linha da transição', () => {
    for (const file of [
      '.github/workflows/mcp-prerelease.yml',
      '.github/workflows/mcp-release.yml',
    ]) {
      expect(read(file)).toContain('-o setup.sh && chmod +x setup.sh && ./setup.sh');
    }
  });
});
