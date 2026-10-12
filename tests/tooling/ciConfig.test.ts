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
