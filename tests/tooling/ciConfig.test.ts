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
      'vitest run --coverage',
      'npm run test:perf',
      'npm run build',
      'npm run build:mcp',
      'npm run test:e2e',
    ]) {
      expect(ci).toContain(step);
    }
    for (const name of ['static', 'test', 'coverage', 'build', 'check', 'e2e']) {
      expect(ci).toMatch(new RegExp(`^ {2}${name}:`, 'm'));
    }
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
    expect(ci.match(/INDEX_HTML_MAX_BYTES: (\d+)/)?.[1]).toBe(
      String(1.84375 * 1024 * 1024),
    );
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
    expect(release).toMatch(/refs\/tags\/\{0\}/);
  });

  // Etapa #920: a estável sai sozinha no merge do épico na main.
  it('dispara no push na main, além da tag mcp-v*', () => {
    expect(release).toMatch(/^ {4}branches: \[main\]$/m);
    expect(release).toMatch(/^ {4}tags: \['mcp-v\*'\]$/m);
  });

  it('tem os jobs decide (contents: read) e release (contents: write, needs, if)', () => {
    const decide = release.slice(
      release.indexOf('\n  decide:'),
      release.indexOf('\n  release:'),
    );
    const job = release.slice(release.indexOf('\n  release:'));
    expect(decide).toMatch(/permissions:\n {6}contents: read/);
    expect(decide).toContain('scripts/release/stableRelease.mjs decide');
    expect(job).toMatch(/needs: decide/);
    expect(job).toMatch(/if: needs\.decide\.outputs\.publish == 'true'/);
    expect(job).toMatch(/permissions:\n {6}contents: write/);
    expect(release).toMatch(/^permissions:\n {2}contents: read/m);
  });

  it('cria a tag e a Release juntas (--target) e não deixa duas publicações da mesma tag em paralelo', () => {
    expect(release).toMatch(
      /gh release create[\s\S]*--target "\$\(git rev-parse HEAD\)"/,
    );
    expect(release).toMatch(
      /concurrency:\n {6}group: mcp-release-\$\{\{ needs\.decide\.outputs\.tag \}\}\n {6}cancel-in-progress: false/,
    );
  });

  it('nenhum dado de PR entra em run: por interpolação', () => {
    const runs = release.split('\n').filter((line) => /\$\{\{/.test(line));
    for (const line of runs) {
      expect(line).not.toMatch(/github\.event\.(pull_request|head_commit)/);
    }
  });
});

describe('ci.yml trava a versão do MCP no PR do épico para a main', () => {
  const job = ci.slice(ci.indexOf('  epic:'), ci.indexOf('  static:'));
  const step = job.slice(job.indexOf('Versão do MCP'));

  it('o job epic faz checkout com histórico e tags e chama o script', () => {
    expect(job).toMatch(/fetch-depth: 0/);
    expect(job).toMatch(/fetch-tags: true/);
    expect(step).toContain('node scripts/release/stableRelease.mjs epic');
  });

  it('só roda em epic/* com base na main', () => {
    expect(job).toMatch(
      /github\.base_ref == 'main' && startsWith\(github\.head_ref, 'epic\/'\)/,
    );
  });
});

describe('ci.yml exige o changelog do épico nos PRs de épico para a main', () => {
  const job = ci.slice(ci.indexOf('  epic:'), ci.indexOf('  static:'));
  const step = job.slice(
    job.indexOf('Changelog atualizado'),
    job.indexOf('Design system registrado'),
  );

  it('o job epic confere o arquivo changelog/<nome>.md do próprio épico', () => {
    expect(job).toContain('Changelog atualizado');
    expect(step).toMatch(/pulls\/\$PR\/files/);
    expect(step).toContain('name="${HEAD#epic/}"');
    expect(step).toContain(
      'grep -qxE "changelog/([0-9]{4}-[0-9]{2}-[0-9]{2}-)?$name\\.md"',
    );
    expect(step).not.toMatch(/grep -qx 'CHANGELOG\.md'/);
  });

  it('continua só para epic/* com base na main', () => {
    expect(step).toMatch(/\[ "\$BASE" != "main" \]/);
    expect(step).toMatch(/epic\/\*\) ;;/);
  });

  it('a mensagem de erro diz o caminho esperado', () => {
    expect(step).toContain('changelog/$name.md');
    expect(step).toContain('changelog/AAAA-MM-DD-$name.md');
  });

  it('o CLAUDE.md descreve a regra e a pasta changelog/ existe', () => {
    const claude = read('CLAUDE.md');
    expect(claude).toContain('**Changelog por épico:**');
    expect(claude).toContain('`changelog/<nome>.md`');
    expect(existsSync('changelog/README.md')).toBe(true);
  });
});

describe('ci.yml exige o registro do DS do épico nos PRs de épico para a main', () => {
  const job = ci.slice(ci.indexOf('  epic:'), ci.indexOf('  static:'));
  const step = job.slice(job.indexOf('Design system registrado'));

  it('o job epic confere o arquivo docs/design-system/<nome>.md do próprio épico', () => {
    expect(step).toMatch(/pulls\/\$PR\/files/);
    expect(step).toContain('name="${HEAD#epic/}"');
    expect(step).toContain(
      'grep -qxE "docs/design-system/([0-9]{4}-[0-9]{2}-[0-9]{2}-)?$name\\.md"',
    );
    expect(step).not.toContain("grep -qx 'docs/DESIGN-SYSTEM.md'");
  });

  it('continua só para epic/* com base na main', () => {
    expect(step).toMatch(/\[ "\$BASE" != "main" \]/);
    expect(step).toMatch(/epic\/\*\) ;;/);
  });

  it('a mensagem de erro diz o caminho esperado', () => {
    expect(step).toContain('docs/design-system/$name.md');
    expect(step).toContain('docs/design-system/AAAA-MM-DD-$name.md');
  });

  it('o CLAUDE.md descreve a regra e a pasta existe', () => {
    const claude = read('CLAUDE.md');
    expect(claude).toContain('`docs/design-system/<nome>.md`');
    expect(existsSync('docs/design-system')).toBe(true);
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

  // Etapa #974, decisão 6: o CI ouve `edited`, mas só roda quando a base do PR mudou.
  describe('CI na troca de base do PR', () => {
    const condition = "github.event.action != 'edited' || github.event.changes.base";

    it('o pull_request declara opened, synchronize, reopened e edited', () => {
      const on = ci.slice(ci.indexOf('\non:'), ci.indexOf('\npermissions:'));
      expect(on).toMatch(
        /^ {2}pull_request:\n(?: {4}#.*\n)* {4}types: \[opened, synchronize, reopened, edited\]/m,
      );
    });

    it.each(['epic', 'static', 'test', 'build', 'e2e', 'check'])(
      'o job %s só roda na edição que troca a base',
      (name) => {
        expect(job(ci, name)).toContain(condition);
      },
    );

    it('o coverage continua pulando junto com o test', () => {
      expect(job(ci, 'coverage')).toMatch(/needs\.test\.result != 'skipped'/);
    });

    it('o grupo de concurrency separa a edição sem troca de base', () => {
      const concurrency = ci.slice(ci.indexOf('\nconcurrency:'), ci.indexOf('\njobs:'));
      expect(concurrency).toContain('github.run_id');
      expect(concurrency).toContain('github.event.changes.base');
    });

    it('o comentário registra o risco aceito do check pulado', () => {
      expect(ci).toMatch(/conta job pulado como sucesso/);
    });
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

// Etapa #375, fase CI2: o `check` é o agregador de jobs em paralelo, com caches.
describe('job check em paralelo e caches', () => {
  const block = (name: string): string => {
    const start = ci.indexOf(`\n  ${name}:\n`);
    const rest = ci.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}(#|[a-z0-9-]+:)/);
    return end < 0 ? rest : rest.slice(0, end + 1);
  };
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  it('static, test, coverage e build têm cada um as suas verificações', () => {
    expect(block('static')).toContain('npm run lint:ci');
    expect(block('static')).toContain('npm run typecheck');
    expect(block('test')).toMatch(
      /vitest run --coverage --shard=\$\{\{ matrix\.shard \}\}\/4 --reporter=blob/,
    );
    expect(block('test')).toMatch(/shard: \[1, 2, 3, 4\]/);
    // Só o job `coverage` gera o relatório (no merge); os shards levam os dados no blob.
    expect(block('test')).toContain('COVERAGE_REPORT: off');
    expect(block('coverage')).not.toContain('COVERAGE_REPORT');
    expect(block('coverage')).toContain('vitest run --merge-reports --coverage');
    expect(block('coverage')).toContain('path: .vitest/blob');
    expect(block('coverage')).toContain('GITHUB_STEP_SUMMARY');
    expect(block('coverage')).toMatch(/name: coverage\$\{\{ inputs\.label/);
    for (const step of [
      'npm run test:perf',
      'npm run build\n',
      'INDEX_HTML_MAX_BYTES',
      'npm run build:mcp',
      'npm run build:viewer --if-present',
    ]) {
      expect(block('build')).toContain(step);
    }
  });

  it('o check agrega os quatro jobs, sempre, e falha se algum não for success', () => {
    const check = block('check');
    expect(check).toMatch(/needs: \[static, test, coverage, build\]/);
    expect(check).toMatch(/if: \$\{\{ always\(\) &&/);
    expect(check).toContain('!= "success"');
    expect(check).toContain('exit 1');
  });

  it('todo job novo mantém o ref e o Node 22 sem .nvmrc; artifacts levam shard e label', () => {
    for (const name of ['static', 'test', 'coverage', 'build', 'e2e']) {
      const job = block(name);
      expect(job, name).toContain('ref: ${{ inputs.ref }}');
      expect(job, name).toContain(
        "node-version: ${{ hashFiles('.nvmrc') == '' && '22' || '' }}",
      );
    }
    const blobs = block('test');
    expect(blobs).toMatch(
      /name: vitest-blob\$\{\{ inputs\.label && format\('-\{0\}', inputs\.label\) \|\| '' \}\}-\$\{\{ matrix\.shard \}\}/,
    );
    expect(block('coverage')).toMatch(/pattern: vitest-blob\$\{\{ inputs\.label/);
  });

  it('build e build:mcp não repetem o tsc (os tipos ficam no typecheck)', () => {
    expect(pkg.scripts.build).not.toContain('tsc');
    expect(pkg.scripts['build:mcp']).not.toContain('tsc');
    expect(pkg.scripts.typecheck).toContain('tsc --noEmit -p mcp/tsconfig.json');
    expect(pkg.scripts.lint).toBe('eslint . && prettier --check .');
    expect(pkg.scripts['lint:ci']).toMatch(
      /eslint \. --cache .*prettier --check \. --cache/,
    );
  });

  it('caches: node_modules (npm ci só sem hit), lint e navegador do Playwright', () => {
    for (const name of ['static', 'test', 'coverage', 'build', 'e2e']) {
      expect(block(name), name).toContain('path: node_modules');
      expect(block(name), name).toContain(
        "if: steps.modules.outputs.cache-hit != 'true'",
      );
    }
    expect(block('static')).toContain('path: .cache');
    expect(block('e2e')).toContain('path: ~/.cache/ms-playwright');
    expect(block('e2e')).toContain('playwright install-deps chromium');
    expect(read('.gitignore')).toMatch(/^\.cache$/m);
  });

  it('o e2e usa 3 workers no CI e o install-deps só roda se o Chromium não abrir', () => {
    expect(read('playwright.config.ts')).toContain(
      'workers: process.env.CI ? 3 : undefined',
    );
    const e2e = block('e2e');
    expect(e2e).toContain('id: chromium');
    expect(e2e).toMatch(/--headless/);
    expect(e2e).toMatch(/ldd/);
    expect(e2e).toMatch(
      /- if: steps\.chromium\.outputs\.ok != 'true'\n\s+run: npx playwright install-deps chromium/,
    );
    expect(e2e).not.toMatch(/- run: npx playwright install-deps chromium/);
  });

  it('o deploy continua olhando só o resultado do ci.yml chamado', () => {
    expect(deploy).toMatch(/checks-main:/);
    expect(deploy).toMatch(/checks-preview:/);
    expect(deploy).not.toMatch(/needs\.(static|coverage)/);
  });
});
