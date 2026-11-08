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
  it('grava os três arquivos e os três .sha256, e imprime a lista (um por linha)', () => {
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
    ]);
    for (const file of files) expect(read(file).length).toBeGreaterThan(0);
  });

  it('cada .sha256 confere com sha256sum -c na pasta de saída', () => {
    const out = tmp();
    expect(run(out).status).toBe(0);
    for (const name of ['setup.sh', 'SKILL.md', 'AGENTS.mapping.md']) {
      const check = spawnSync('sha256sum', ['-c', `${name}.sha256`], {
        cwd: out,
        encoding: 'utf8',
      });
      expect(check.status, check.stderr).toBe(0);
      expect(check.stdout).toContain(`${name}: OK`);
    }
  });

  it('setup.sh e SKILL.md são cópias, e o AGENTS.mapping.md é o trecho entre os marcadores (inclusive)', () => {
    const out = tmp();
    expect(run(out).status).toBe(0);
    expect(read(join(out, 'setup.sh'))).toBe(read('examples/workspace/setup.sh'));
    expect(read(join(out, 'SKILL.md'))).toBe(read('.claude/skills/spec-author/SKILL.md'));
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

  const cases: [string, string, string[]][] = [
    ['snapshot', '.github/workflows/mcp-prerelease.yml', ['create', 'upload']],
    ['rc', '.github/workflows/mcp-prerelease.yml', ['create']],
    ['estável', '.github/workflows/mcp-release.yml', ['create', 'upload']],
  ];

  it('os três jobs rodam o script depois do passo Checksum', () => {
    const prerelease = read('.github/workflows/mcp-prerelease.yml');
    const release = read('.github/workflows/mcp-release.yml');
    const call = 'node scripts/release/workspaceAssets.mjs dist-mcp';
    expect(prerelease.split(call).length - 1).toBeGreaterThanOrEqual(4); // 2 jobs × (passo + publicação)
    expect(release.split(call).length - 1).toBeGreaterThanOrEqual(2);
    for (const yaml of [prerelease, release]) {
      expect(yaml.indexOf('name: Checksum')).toBeLessThan(yaml.indexOf(call));
    }
  });

  for (const [job, file, verbs] of cases) {
    for (const verb of verbs) {
      it(`${job}: gh release ${verb} leva mapping-mcp.js, o .sha256 e os arquivos do script`, () => {
        const yaml = read(file);
        const start =
          job === 'snapshot'
            ? yaml.indexOf('  snapshot:')
            : job === 'rc'
              ? yaml.indexOf('\n  rc:')
              : 0;
        const end = job === 'snapshot' ? yaml.indexOf('  cleanup:') : yaml.length;
        const chunk = yaml.slice(start, end);
        const commands = commandsOf(chunk, verb);
        expect(commands.length).toBeGreaterThan(0);
        for (const command of commands) {
          expect(command).toContain('dist-mcp/mapping-mcp.js');
          expect(command).toContain('dist-mcp/mapping-mcp.js.sha256');
          expect(command).toContain('"${assets[@]}"');
        }
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
