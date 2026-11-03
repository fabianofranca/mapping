// @vitest-environment node
// Fase 5.6: o que bloqueia uma publicação ruim é configuração (workflows, lint,
// Playwright, Node). Estes testes leem os arquivos e falham se ela regredir.
import { readFileSync, existsSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it, vi } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');
const ci = read('.github/workflows/ci.yml');
const deploy = read('.github/workflows/deploy.yml');

describe('deploy.yml roda o mesmo que o ci.yml antes de publicar', () => {
  it('o ci.yml pode ser chamado por outro workflow, com o ref a validar', () => {
    expect(ci).toMatch(/^ {2}workflow_call:/m);
    expect(ci).toMatch(/ref: \$\{\{ inputs\.ref \}\}/);
  });

  it('o ci.yml valida tudo: typecheck, testes, perf, build, build:mcp, tamanho e e2e', () => {
    for (const step of [
      'npm run lint',
      'npm run typecheck',
      'npm run test:coverage',
      'npm run test:perf',
      'npm run build',
      'npm run build:mcp',
      'npm run test:e2e',
    ]) {
      expect(ci).toContain(step);
    }
    expect(ci).toMatch(/^ {2}check:/m);
    expect(ci).toMatch(/^ {2}e2e:/m);
  });

  it('o deploy chama o ci.yml para a main e para o preview e só publica depois deles', () => {
    const calls = deploy.match(/uses: \.\/\.github\/workflows\/ci\.yml/g) ?? [];
    expect(calls).toHaveLength(2);
    const build = deploy.slice(deploy.indexOf('\n  build:'));
    expect(build).toMatch(/needs: \[.*checks-main.*checks-preview.*\]/);
    expect(build).toContain('upload-pages-artifact');
    // Nenhuma validação própria que possa divergir do ci.yml.
    expect(deploy).not.toContain('npm run lint');
    expect(deploy).not.toMatch(/npm (run )?test/);
  });

  it('o deploy publica mesmo sem preview (checks-preview skipped não o pula)', () => {
    // Sem `if`, o `success()` implícito exige todos os ancestrais em sucesso, inclusive o
    // `checks-preview` pulado: de 10/10 a 11/10 todo push na main terminou verde com o
    // `deploy` skipped e o Pages ficou parado. O `if` precisa olhar só o `build`.
    const job = deploy.slice(deploy.indexOf('\n  deploy:'));
    expect(job).toMatch(/^ {4}needs: build$/m);
    expect(job).toMatch(/^ {4}if: .*!cancelled\(\).*needs\.build\.result == 'success'/m);
    expect(job).toContain('deploy-pages');
  });

  it('orçamento do dist/index.html num só lugar, com o tamanho no resumo do job', () => {
    expect(ci.match(/INDEX_HTML_MAX_BYTES: (\d+)/)?.[1]).toBe(String(1.5 * 1024 * 1024));
    expect(ci.match(/INDEX_HTML_MAX_BYTES:/g)).toHaveLength(1);
    expect(ci).toContain('GITHUB_STEP_SUMMARY');
  });
});

describe('Node fixado no repositório', () => {
  it('.nvmrc com 22 e engines >=22', () => {
    expect(existsSync('.nvmrc') && read('.nvmrc').trim()).toBe('22');
    const pkg = JSON.parse(read('package.json')) as { engines?: { node?: string } };
    expect(pkg.engines?.node).toBe('>=22');
  });

  it('os workflows leem a versão do .nvmrc', () => {
    for (const workflow of [ci, deploy]) {
      expect(workflow).toContain('node-version-file:');
      expect(workflow).not.toMatch(/node-version: \d/);
    }
  });
});

describe('Playwright', () => {
  it('uma repetição no CI, com trace só nela', async () => {
    vi.stubEnv('CI', 'true');
    vi.resetModules();
    const { default: config } = await import('../../playwright.config');
    vi.unstubAllEnvs();
    expect(config.retries).toBe(1);
    expect(config.use?.trace).toBe('on-first-retry');
  });

  it('addImage espera o canvas enquadrar, sem tempo fixo', () => {
    const helpers = read('tests/e2e/helpers.ts');
    const addImage = helpers.slice(
      helpers.indexOf('export async function addImage'),
      helpers.indexOf('export async function canvasBox'),
    );
    expect(addImage).not.toContain('waitForTimeout');
    expect(addImage).toContain('data-fits');
  });
});

describe('ESLint', () => {
  const eslint = new ESLint();
  const dirs = ['ui', 'app', 'store', 'storage', 'i18n', 'theme', 'utils'];

  it.each(dirs)('konva é proibido em src/%s/', async (dir) => {
    const [result] = await eslint.lintText(
      "import Konva from 'konva';\nexport const stage = Konva.Stage;\n",
      { filePath: `src/${dir}/KonvaProbe.ts` },
    );
    expect(result?.messages.map((m) => m.ruleId)).toContain('no-restricted-imports');
  });

  it('konva continua permitido em src/canvas/', async () => {
    const [result] = await eslint.lintText(
      "import Konva from 'konva';\nexport const stage = Konva.Stage;\n",
      { filePath: 'src/canvas/KonvaProbe.ts' },
    );
    expect(result?.messages).toEqual([]);
  });

  it('react-hooks/exhaustive-deps é erro', async () => {
    const config = (await eslint.calculateConfigForFile('src/ui/Probe.tsx')) as {
      rules: Record<string, unknown>;
    };
    const rule = config.rules['react-hooks/exhaustive-deps'];
    expect(Array.isArray(rule) ? rule[0] : rule).toBe(2);
  });
});

describe('Dependabot', () => {
  it('npm e github-actions, semanal, minor e patch agrupados', () => {
    expect(existsSync('.github/dependabot.yml')).toBe(true);
    const config = read('.github/dependabot.yml');
    expect(config).toContain('package-ecosystem: npm');
    expect(config).toContain('package-ecosystem: github-actions');
    expect(config.match(/interval: weekly/g)).toHaveLength(2);
    expect(config.match(/update-types: \[minor, patch\]/g)).toHaveLength(2);
  });
});

describe('mcp-release.yml anexa o mapping-mcp.js à Release', () => {
  const release = read('.github/workflows/mcp-release.yml');

  it('roda os testes sem os orçamentos de desempenho (oscilam no runner e não dizem nada do MCP)', () => {
    expect(release).toMatch(/PERF_BUDGETS=off npm test/);
    expect(release).not.toMatch(/^\s+- run: npm test\s*$/m);
  });

  it('anexa à Release que já existe (criada pela tela do GitHub) em vez de falhar', () => {
    expect(release).toMatch(/gh release view/);
    expect(release).toMatch(/gh release upload [^\n]*--clobber/);
  });

  it('pode ser disparado à mão para uma tag que já existe', () => {
    expect(release).toMatch(/^ {2}workflow_dispatch:/m);
    expect(release).toMatch(/ref: refs\/tags\/\$\{\{ env\.TAG \}\}/);
  });
});

describe('ci.yml exige o CHANGELOG.md nos PRs de épico para a main', () => {
  it('o job epic confere que o PR altera o CHANGELOG.md', () => {
    const job = ci.slice(ci.indexOf('  epic:'), ci.indexOf('  check:'));
    expect(job).toContain('Changelog atualizado');
    expect(job).toMatch(/pulls\/\$PR\/files/);
    expect(job).toMatch(/grep -qx 'CHANGELOG\.md'/);
    expect(job).toMatch(/epic\/\*\) ;;/);
  });

  it('o CLAUDE.md descreve a regra e o CHANGELOG.md existe', () => {
    expect(read('CLAUDE.md')).toContain('**Changelog por épico:**');
    expect(existsSync('CHANGELOG.md')).toBe(true);
  });
});

// Etapa #375, fase CI1: cada commit de PR é validado uma vez (decisões 1, 2 e 3).
describe('uma validação por commit', () => {
  const preview = read('.github/workflows/preview-on-pr.yml');
  const job = (yaml: string, name: string): string => {
    const start = yaml.indexOf(`\n  ${name}:`);
    const next = yaml.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
    return next < 0 ? yaml.slice(start) : yaml.slice(start, start + 1 + next);
  };

  it('o ci.yml não roda em push (só pull_request e workflow_call)', () => {
    const on = ci.slice(ci.indexOf('\non:'), ci.indexOf('\npermissions:'));
    expect(on).toMatch(/^ {2}pull_request:/m);
    expect(on).toMatch(/^ {2}workflow_call:/m);
    expect(on).not.toMatch(/^ {2}push:/m);
  });

  it('o preview sai por workflow_run do CI, só depois de sucesso num PR do próprio repositório', () => {
    expect(preview).toMatch(
      /^ {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]/m,
    );
    expect(preview).not.toMatch(/^ {2}pull_request:/m);
    expect(preview).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(preview).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(preview).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    );
    expect(preview).toMatch(
      /HEAD_BRANCH: \$\{\{ github\.event\.workflow_run\.head_branch \}\}/,
    );
    expect(preview).toMatch(
      /HEAD_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/,
    );
    expect(preview).toMatch(
      /gh workflow run deploy\.yml [^\n]*--ref main [^\n]*-f branch="\$HEAD_BRANCH" -f sha="\$HEAD_SHA"/,
    );
    expect(preview).toContain('GITHUB_STEP_SUMMARY');
  });

  it('o Deploy aceita o sha e o plan confere os check runs check e e2e dele', () => {
    expect(deploy).toMatch(/^ {6}sha:\n/m);
    const plan = job(deploy, 'plan');
    expect(plan).toMatch(/commits\/\$SHA\/check-runs/);
    expect(plan).toMatch(/for name in check e2e/);
    expect(plan).toContain('success');
    expect(plan).toMatch(/^ {6}validated: /m);
    expect(plan).toMatch(/^ {6}preview_sha: /m);
  });

  it('o checks-preview só roda sem a validação dos check runs, no SHA quando há', () => {
    const checks = job(deploy, 'checks-preview');
    expect(checks).toMatch(
      /if: needs\.plan\.outputs\.preview != '' && needs\.plan\.outputs\.validated != 'true'/,
    );
    expect(checks).toMatch(
      /ref: \$\{\{ needs\.plan\.outputs\.preview_sha \|\| needs\.plan\.outputs\.preview \}\}/,
    );
  });

  it('o build aceita o checks-preview em sucesso ou pulado por já validado, e publica o SHA', () => {
    const build = job(deploy, 'build');
    expect(build).toContain("needs.checks-preview.result == 'success'");
    expect(build).toMatch(
      /needs\.checks-preview\.result == 'skipped' && needs\.plan\.outputs\.validated == 'true'/,
    );
    expect(build).toMatch(
      /needs\.checks-preview\.result == 'skipped' && needs\.plan\.outputs\.preview == ''/,
    );
    expect(build).toMatch(
      /PREVIEW_REF: \$\{\{ needs\.plan\.outputs\.preview_sha \|\| needs\.plan\.outputs\.preview \}\}/,
    );
    expect(build).toMatch(/ref: \$\{\{ env\.PREVIEW_REF \}\}/);
    expect(build).toContain('previewSha');
  });
});
