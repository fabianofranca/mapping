// @vitest-environment node
// Phase 5.6: what blocks a bad publication is configuration (workflows, lint,
// Playwright, Node). These tests read the files and fail if it regresses.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it, vi } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');
const ci = read('.github/workflows/ci.yml');
const deploy = read('.github/workflows/deploy.yml');
const setupAction = read('.github/actions/setup-deps/action.yml');

/** Block of a top-level job (`  name:` up to the next job), with the comment lines. */
const jobOf = (yaml: string, name: string): string => {
  const start = yaml.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const rest = yaml.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/);
  return end < 0 ? rest : rest.slice(0, end + 1);
};

/** Bodies of the file's `run:` entries (one line or a `|` block), to check interpolations. */
const runBodies = (yaml: string): string[] => {
  const lines = yaml.split('\n');
  const bodies: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i] ?? '');
    if (!match) continue;
    const indent = (match[1] ?? '').length;
    if (match[2] && match[2] !== '|') {
      bodies.push(match[2]);
      continue;
    }
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j] ?? '';
      if (line.trim() !== '' && line.search(/\S/) <= indent) break;
      body.push(line);
    }
    bodies.push(body.join('\n'));
  }
  return bodies;
};

describe('deploy.yml runs the same as ci.yml before publishing', () => {
  it('ci.yml can be called by another workflow, with the ref to validate', () => {
    expect(ci).toMatch(/^ {2}workflow_call:/m);
    expect(ci).toMatch(/ref: \$\{\{ inputs\.ref \}\}/);
  });

  it('ci.yml validates everything: typecheck, tests, perf, build, build:mcp, size and e2e', () => {
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

  it('the deploy calls ci.yml for main and for the preview and only publishes after them', () => {
    const calls = deploy.match(/uses: \.\/\.github\/workflows\/ci\.yml/g) ?? [];
    expect(calls).toHaveLength(2);
    const build = deploy.slice(deploy.indexOf('\n  build:'));
    expect(build).toMatch(/needs: \[.*checks-main.*checks-preview.*\]/);
    expect(build).toContain('upload-pages-artifact');
    // No validation of its own that could diverge from ci.yml.
    expect(deploy).not.toContain('npm run lint');
    expect(deploy).not.toMatch(/npm (run )?test/);
  });

  it('the deploy publishes even without a preview (a skipped checks-preview does not skip it)', () => {
    // Without `if`, the implicit `success()` requires every ancestor to succeed, including the
    // skipped `checks-preview`: from 10/10 to 11/10 every push to main ended green with the
    // `deploy` skipped and Pages stood still. The `if` must look only at the `build`.
    const job = deploy.slice(deploy.indexOf('\n  deploy:'));
    expect(job).toMatch(/^ {4}needs: build$/m);
    expect(job).toMatch(/^ {4}if: .*!cancelled\(\).*needs\.build\.result == 'success'/m);
    expect(job).toContain('deploy-pages');
  });

  it('the dist/index.html budget in a single place, with the size in the job summary', () => {
    // Stage #1614 (decisions 1 and 2): the ceiling lives in `scripts/ci/dist-budget.json`, which
    // `distBudget.mjs raise --write` raises without touching `.github/`. The number is not fixed here.
    const data = JSON.parse(read('scripts/ci/dist-budget.json')) as {
      indexHtmlMaxBytes: number;
      history: string[];
    };
    expect(data.indexHtmlMaxBytes).toBeGreaterThan(0);
    expect(data.indexHtmlMaxBytes % (16 * 1024)).toBe(0);
    expect(data.history.length).toBeGreaterThan(0);
    expect(ci).not.toMatch(/^\s*INDEX_HTML_MAX_BYTES: \d+/m);
    expect(jobOf(ci, 'build')).not.toMatch(/^ {4}env:/m);
    expect(ci).toContain('GITHUB_STEP_SUMMARY');
  });
});

describe('Node pinned in the repository', () => {
  it('.nvmrc with 22 and engines >=22', () => {
    expect(existsSync('.nvmrc') && read('.nvmrc').trim()).toBe('22');
    const pkg = JSON.parse(read('package.json')) as { engines?: { node?: string } };
    expect(pkg.engines?.node).toBe('>=22');
  });

  it('the workflows read the version from .nvmrc', () => {
    for (const workflow of [setupAction, deploy]) {
      expect(workflow).toContain('node-version-file:');
      expect(workflow).not.toMatch(/node-version: \d/);
    }
  });
});

describe('Playwright', () => {
  it('one retry on CI, with trace only on it', async () => {
    vi.stubEnv('CI', 'true');
    vi.resetModules();
    const { default: config } = await import('../../playwright.config');
    vi.unstubAllEnvs();
    expect(config.retries).toBe(1);
    expect(config.use?.trace).toBe('on-first-retry');
  });

  it('addImage waits for the canvas to fit, with no fixed delay', () => {
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

  it.each(dirs)('konva is forbidden in src/%s/', async (dir) => {
    const [result] = await eslint.lintText(
      "import Konva from 'konva';\nexport const stage = Konva.Stage;\n",
      { filePath: `src/${dir}/KonvaProbe.ts` },
    );
    expect(result?.messages.map((m) => m.ruleId)).toContain('no-restricted-imports');
  });

  it('konva is still allowed in src/canvas/', async () => {
    const [result] = await eslint.lintText(
      "import Konva from 'konva';\nexport const stage = Konva.Stage;\n",
      { filePath: 'src/canvas/KonvaProbe.ts' },
    );
    expect(result?.messages).toEqual([]);
  });

  it('react-hooks/exhaustive-deps is an error', async () => {
    const config = (await eslint.calculateConfigForFile('src/ui/Probe.tsx')) as {
      rules: Record<string, unknown>;
    };
    const rule = config.rules['react-hooks/exhaustive-deps'];
    expect(Array.isArray(rule) ? rule[0] : rule).toBe(2);
  });
});

describe('Dependabot', () => {
  it('npm and github-actions, weekly, minor and patch grouped', () => {
    expect(existsSync('.github/dependabot.yml')).toBe(true);
    const config = read('.github/dependabot.yml');
    expect(config).toContain('package-ecosystem: npm');
    expect(config).toContain('package-ecosystem: github-actions');
    expect(config.match(/interval: weekly/g)).toHaveLength(2);
    expect(config.match(/update-types: \[minor, patch\]/g)).toHaveLength(2);
  });

  // Stage #294 (Preact 11), decision 8: the migration is done, so Dependabot proposes the major
  // versions of `preact` again; the `typescript` rule stays until #293.
  it('proposes the major versions of preact again; the typescript major stays ignored', () => {
    const config = read('.github/dependabot.yml');
    expect(config).not.toMatch(/dependency-name: preact\b/);
    expect(config).toMatch(
      /dependency-name: typescript\n\s+update-types: \['version-update:semver-major'\]/,
    );
  });
});

describe('mcp-release.yml attaches mapping-mcp.js to the Release', () => {
  const release = read('.github/workflows/mcp-release.yml');

  it('runs the tests without the performance budgets (they fluctuate on the runner and say nothing about the MCP)', () => {
    expect(release).toMatch(/PERF_BUDGETS=off npm test/);
    expect(release).not.toMatch(/^\s+- run: npm test\s*$/m);
  });

  it('attaches to the Release that already exists (created from the GitHub screen) instead of failing', () => {
    expect(release).toMatch(/gh release view/);
    expect(release).toMatch(/gh release upload [^\n]*--clobber/);
  });

  it('can be triggered by hand for a tag that already exists', () => {
    expect(release).toMatch(/^ {2}workflow_dispatch:/m);
    expect(release).toMatch(/refs\/tags\/\{0\}/);
  });

  // Stage #920: the stable release goes out on its own when the epic is merged into main.
  it('triggers on push to main, besides the mcp-v* tag', () => {
    expect(release).toMatch(/^ {4}branches: \[main\]$/m);
    expect(release).toMatch(/^ {4}tags: \['mcp-v\*', '!mcp-v\*-\*'\]$/m);
  });

  it('has the jobs decide (contents: read) and release (contents: write, needs, if)', () => {
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

  it('creates the tag and the Release together (--target) and does not let two publications of the same tag run in parallel', () => {
    expect(release).toMatch(
      /gh release create[\s\S]*--target "\$\(git rev-parse HEAD\)"/,
    );
    expect(release).toMatch(
      /concurrency:\n {6}group: mcp-release-\$\{\{ needs\.decide\.outputs\.tag \}\}\n {6}cancel-in-progress: false/,
    );
  });

  it('no PR data enters run: by interpolation', () => {
    const runs = release.split('\n').filter((line) => /\$\{\{/.test(line));
    for (const line of runs) {
      expect(line).not.toMatch(/github\.event\.(pull_request|head_commit)/);
    }
  });
});

describe("ci.yml locks the MCP version in the epic's PR to main", () => {
  const job = ci.slice(ci.indexOf('  epic:'), ci.indexOf('  static:'));
  const step = job.slice(job.indexOf('Versão do MCP'));

  it('the epic job checks out with history and tags and calls the script', () => {
    expect(job).toMatch(/fetch-depth: 0/);
    expect(job).toMatch(/fetch-tags: true/);
    expect(step).toContain('node scripts/release/stableRelease.mjs epic');
  });

  it('only runs on epic/* with main as the base', () => {
    expect(job).toMatch(
      /github\.base_ref == 'main' && startsWith\(github\.head_ref, 'epic\/'\)/,
    );
  });
});

describe("ci.yml requires the epic's changelog in epic PRs to main", () => {
  const job = ci.slice(ci.indexOf('  epic:'), ci.indexOf('  static:'));
  const step = job.slice(
    job.indexOf('Changelog updated'),
    job.indexOf('Design system recorded'),
  );

  it("the epic job checks the epic's own changelog/<name>.md file", () => {
    expect(job).toContain('Changelog updated');
    expect(step).toMatch(/pulls\/\$PR\/files/);
    expect(step).toContain('name="${HEAD#epic/}"');
    expect(step).toContain('grep -qxF "$name.md"');
    expect(step).not.toMatch(/grep -qxE/);
    expect(step).not.toMatch(/grep -qx 'CHANGELOG\.md'/);
  });

  it('only continues for epic/* with main as the base', () => {
    expect(step).toMatch(/\[ "\$BASE" != "main" \]/);
    expect(step).toMatch(/epic\/\*\) ;;/);
  });

  it('the error message states the expected path', () => {
    expect(step).toContain('changelog/$name.md');
    expect(step).toContain('changelog/YYYY-MM-DD-$name.md');
  });

  it('docs/PROCESS.md describes the rule and the changelog/ folder exists', () => {
    const claude = read('docs/PROCESS.md');
    expect(claude).toContain('**Changelog per epic:**');
    expect(claude).toContain('`changelog/<name>.md`');
    expect(existsSync('changelog/README.md')).toBe(true);
  });
});

describe("ci.yml requires the epic's DS record in epic PRs to main", () => {
  const job = ci.slice(ci.indexOf('  epic:'), ci.indexOf('  static:'));
  const step = job.slice(job.indexOf('Design system recorded'));

  it("the epic job checks the epic's own docs/design-system/<name>.md file", () => {
    expect(step).toMatch(/pulls\/\$PR\/files/);
    expect(step).toContain('name="${HEAD#epic/}"');
    expect(step).toContain('grep -qxF "$name.md"');
    expect(step).not.toMatch(/grep -qxE/);
    expect(step).not.toContain("grep -qx 'docs/DESIGN-SYSTEM.md'");
  });

  it('only continues for epic/* with main as the base', () => {
    expect(step).toMatch(/\[ "\$BASE" != "main" \]/);
    expect(step).toMatch(/epic\/\*\) ;;/);
  });

  it('the error message states the expected path', () => {
    expect(step).toContain('docs/design-system/$name.md');
    expect(step).toContain('docs/design-system/YYYY-MM-DD-$name.md');
  });

  it('docs/PROCESS.md describes the rule and the folder exists', () => {
    const claude = read('docs/PROCESS.md');
    expect(claude).toContain('`docs/design-system/<name>.md`');
    expect(existsSync('docs/design-system')).toBe(true);
  });
});

// Stage #375, phase CI1: each PR commit is validated once (decisions 1, 2 and 3).
describe('one validation per commit', () => {
  const preview = read('.github/workflows/preview-on-pr.yml');
  const job = (yaml: string, name: string): string => {
    const start = yaml.indexOf(`\n  ${name}:`);
    const next = yaml.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
    return next < 0 ? yaml.slice(start) : yaml.slice(start, start + 1 + next);
  };

  it('ci.yml does not run on push (only pull_request and workflow_call)', () => {
    const on = ci.slice(ci.indexOf('\non:'), ci.indexOf('\npermissions:'));
    expect(on).toMatch(/^ {2}pull_request:/m);
    expect(on).toMatch(/^ {2}workflow_call:/m);
    expect(on).not.toMatch(/^ {2}push:/m);
  });

  // Stage #1466, decisions 5 and 6: editing the PR (title, body or base) does not run the CI.
  describe('CI without `edited` in the trigger (stage #1466)', () => {
    it('pull_request declares opened, synchronize and reopened, without edited', () => {
      const on = ci.slice(ci.indexOf('\non:'), ci.indexOf('\npermissions:'));
      expect(on).toMatch(
        /^ {2}pull_request:\n(?: {4}#.*\n)* {4}types: \[opened, synchronize, reopened\]\n/m,
      );
      expect(on).not.toContain('edited,');
    });

    it.each(['epic', 'static', 'test', 'coverage', 'build', 'e2e', 'check'])(
      'the %s job does not look at github.event.action or changes.base',
      (name) => {
        const text = job(ci, name);
        expect(text).not.toContain('github.event.action');
        expect(text).not.toContain('changes.base');
      },
    );

    it('the check always runs and the epic only on pull_request', () => {
      expect(job(ci, 'check')).toContain('if: ${{ always() }}');
      expect(job(ci, 'epic')).toMatch(/^ {4}if: github\.event_name == 'pull_request'$/m);
    });

    it('the coverage still skips together with the test', () => {
      expect(job(ci, 'coverage')).toMatch(/needs\.test\.result != 'skipped'/);
    });

    it('the concurrency group has no run_id suffix nor a base-change suffix', () => {
      const concurrency = ci.slice(ci.indexOf('\nconcurrency:'), ci.indexOf('\njobs:'));
      expect(concurrency).not.toContain('github.run_id');
      expect(concurrency).not.toContain('changes.base');
    });

    it('the file no longer keeps the accepted risk of the skipped job', () => {
      expect(ci).not.toMatch(/conta job pulado como sucesso/);
    });
  });

  it('the preview goes out by workflow_run of the CI, only after success on a PR of the repository itself', () => {
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

  it('the Deploy accepts the sha and the plan checks its check and e2e check runs', () => {
    expect(deploy).toMatch(/^ {6}sha:\n/m);
    const plan = job(deploy, 'plan');
    expect(plan).toMatch(/commits\/\$SHA\/check-runs/);
    expect(plan).toMatch(/for name in check e2e/);
    expect(plan).toContain('success');
    expect(plan).toMatch(/^ {6}validated: /m);
    expect(plan).toMatch(/^ {6}preview_sha: /m);
  });

  it('the checks-preview only runs without the check-runs validation, on the SHA when there is one', () => {
    const checks = job(deploy, 'checks-preview');
    expect(checks).toMatch(
      /if: needs\.plan\.outputs\.preview != '' && needs\.plan\.outputs\.validated != 'true'/,
    );
    expect(checks).toMatch(
      /ref: \$\{\{ needs\.plan\.outputs\.preview_sha \|\| needs\.plan\.outputs\.preview \}\}/,
    );
  });

  it('the build accepts the checks-preview as success or skipped because already validated, and publishes the SHA', () => {
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

// Stage #375, phase CI2: the `check` is the aggregator of parallel jobs, with caches.
describe('parallel check job and caches', () => {
  const block = (name: string): string => {
    const start = ci.indexOf(`\n  ${name}:\n`);
    const rest = ci.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}(#|[a-z0-9-]+:)/);
    return end < 0 ? rest : rest.slice(0, end + 1);
  };
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  it('static, test, coverage and build each have their own checks', () => {
    expect(block('static')).toContain('npm run lint:ci');
    expect(block('static')).toContain('npm run typecheck');
    expect(block('test')).toMatch(
      /vitest run --coverage --shard=\$\{\{ matrix\.shard \}\}\/4 --reporter=blob/,
    );
    expect(block('test')).toMatch(/shard: \[1, 2, 3, 4\]/);
    // Only the `coverage` job generates the report (on the merge); the shards carry the data in the blob.
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

  it('the check aggregates the four jobs, always, and fails if any is not success', () => {
    const check = block('check');
    expect(check).toMatch(/needs: \[static, test, coverage, build\]/);
    expect(check).toContain('if: ${{ always() }}');
    expect(check).toContain('!= "success"');
    expect(check).toContain('exit 1');
  });

  it('every new job keeps the ref and Node 22 without .nvmrc; artifacts carry shard and label', () => {
    for (const name of ['static', 'test', 'coverage', 'build', 'e2e']) {
      const job = block(name);
      expect(job, name).toContain('ref: ${{ inputs.ref }}');
    }
    expect(setupAction).toContain(
      "node-version: ${{ hashFiles('.nvmrc') == '' && '22' || '' }}",
    );
    const blobs = block('test');
    expect(blobs).toMatch(
      /name: vitest-blob\$\{\{ inputs\.label && format\('-\{0\}', inputs\.label\) \|\| '' \}\}-\$\{\{ matrix\.shard \}\}/,
    );
    expect(block('coverage')).toMatch(/pattern: vitest-blob\$\{\{ inputs\.label/);
  });

  it('build and build:mcp do not repeat tsc (the types stay in typecheck)', () => {
    expect(pkg.scripts.build).not.toContain('tsc');
    expect(pkg.scripts['build:mcp']).not.toContain('tsc');
    expect(pkg.scripts.typecheck).toContain('tsc --noEmit -p mcp/tsconfig.json');
    expect(pkg.scripts.lint).toBe('eslint . && prettier --check .');
    expect(pkg.scripts['lint:ci']).toMatch(
      /eslint \. --cache .*prettier --check \. --cache/,
    );
  });

  it('caches: node_modules (npm ci only without a hit), lint and the Playwright browser', () => {
    for (const name of ['static', 'test', 'coverage', 'build', 'e2e']) {
      expect(block(name), name).toContain('uses: ./.github/actions/setup-deps');
    }
    expect(setupAction).toContain('path: node_modules');
    expect(setupAction).toContain("if: steps.modules.outputs.cache-hit != 'true'");
    expect(block('static')).toContain('path: .cache');
    expect(block('e2e')).toContain('path: ~/.cache/ms-playwright');
    expect(block('e2e')).toContain('playwright install-deps chromium');
    expect(read('.gitignore')).toMatch(/^\.cache$/m);
  });

  it('the e2e uses 3 workers on CI and install-deps only runs if Chromium does not open', () => {
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

  it('the deploy still looks only at the result of the called ci.yml', () => {
    expect(deploy).toMatch(/checks-main:/);
    expect(deploy).toMatch(/checks-preview:/);
    expect(deploy).not.toMatch(/needs\.(static|coverage)/);
  });
});

// Stage #971, phase 4 (item 73): the Node and dependencies setup block is a composite action.
describe('setup-deps composite action', () => {
  const jobs = ['static', 'test', 'coverage', 'build', 'e2e'];

  it('the five jobs use it after the checkout, and none repeats setup-node or npm ci', () => {
    for (const name of jobs) {
      const job = jobOf(ci, name);
      expect(job, name).toContain('uses: ./.github/actions/setup-deps');
      expect(job.indexOf('actions/checkout'), name).toBeLessThan(
        job.indexOf('uses: ./.github/actions/setup-deps'),
      );
      expect(job, name).not.toContain('actions/setup-node');
      expect(job, name).not.toMatch(/run: npm ci/);
    }
    expect(ci.match(/uses: \.\/\.github\/actions\/setup-deps/g)).toHaveLength(5);
  });

  it('the action is composite, keeps the cache keys and does not restore the npm cache for nothing', () => {
    expect(setupAction).toContain('using: composite');
    expect(setupAction).toContain(
      "key: node-modules-${{ runner.os }}-${{ steps.node.outputs.node-version }}-${{ hashFiles('package-lock.json') }}",
    );
    expect(setupAction).toContain('run: npm ci');
    expect(setupAction).toMatch(/shell: bash/);
    expect(setupAction).not.toMatch(/^\s+cache: npm/m);
    expect(ci).not.toMatch(/^\s+cache: npm/m);
  });

  it('the names of the required checks do not change', () => {
    for (const name of ['check', 'e2e', 'epic']) {
      expect(ci).toMatch(new RegExp(`^ {2}${name}:\\n`, 'm'));
      expect(jobOf(ci, name)).not.toMatch(/^ {4}name:/m);
    }
  });
});

// Stage #971, phase 4 (item 72): the epic name is compared without regex and the API failure shows up.
describe('ci.yml: epic changelog and DS without regex and without masking an API failure', () => {
  const epic = jobOf(ci, 'epic');
  for (const [title, next] of [
    ['Changelog updated', 'Design system recorded'],
    ['Design system recorded', 'The MCP stable release'],
  ] as const) {
    const step = epic.slice(epic.indexOf(title), epic.indexOf(next));

    it(`${title}: uses grep -qxF and fails the step with the gh api message`, () => {
      expect(step).toContain('grep -qxF "$name.md"');
      expect(step).not.toMatch(/grep -qxE/);
      expect(step).toMatch(/if ! files="\$\(gh api /);
      expect(step).toContain('Could not list the files of PR');
      expect(step).toContain('$files');
    });
  }
});

// Stage #971, phase 4 (items 74 and 75, decision 10): per-job permissions and Deploy without cancelling the deploy.
describe('deploy.yml: permissions and concurrency', () => {
  it('the workflow level is only contents: read; pages: write and id-token: write stay in the deploy job', () => {
    const top = deploy.slice(deploy.indexOf('\npermissions:'), deploy.indexOf('\njobs:'));
    expect(top).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(top).not.toMatch(/^ {2}(pages|id-token):/m);
    const job = jobOf(deploy, 'deploy');
    expect(job).toMatch(
      /permissions:\n {6}contents: read\n {6}pages: write\n {6}id-token: write/,
    );
    for (const name of ['plan', 'build', 'checks-main', 'checks-preview']) {
      expect(jobOf(deploy, name), name).not.toMatch(/pages: write|id-token/);
    }
  });

  it('the deploy job has the pages group without cancel-in-progress; the rest of the pipeline does not use that group', () => {
    const job = jobOf(deploy, 'deploy');
    expect(job).toMatch(/concurrency:\n {6}group: pages\n {6}cancel-in-progress: false/);
    const rest = deploy.replace(job, '');
    expect(rest).not.toMatch(/group: pages\n/);
  });

  it('the plan/build phase still cancels the superseded run, in a group of its own', () => {
    const build = jobOf(deploy, 'build');
    expect(build).toMatch(
      /concurrency:\n {6}group: pages-build\n {6}cancel-in-progress: true/,
    );
    const top = deploy.slice(deploy.indexOf('\npermissions:'), deploy.indexOf('\njobs:'));
    expect(top).not.toContain('concurrency:');
  });
});

// Stage #971, phase 4 (items 76 to 79, decision 11): MCP pre-releases.
describe('mcp-prerelease.yml', () => {
  const pre = read('.github/workflows/mcp-prerelease.yml');

  it('the workflow level is contents: read; only the publishing jobs and the cleanup write', () => {
    const top = pre.slice(pre.indexOf('\npermissions:'), pre.indexOf('\njobs:'));
    expect(top).toMatch(/^permissions:\n {2}contents: read\n/m);
    for (const name of ['snapshot-build', 'rc-build']) {
      expect(jobOf(pre, name), name).toMatch(/permissions:\n {6}contents: read\n/);
      expect(jobOf(pre, name), name).not.toContain('contents: write');
    }
    for (const name of ['snapshot-publish', 'rc-publish', 'cleanup']) {
      expect(jobOf(pre, name), name).toMatch(/permissions:\n {6}contents: write\n/);
    }
  });

  it('the PR code is built without a persisted credential and the publishing job does no checkout', () => {
    for (const name of ['snapshot-build', 'rc-build']) {
      const job = jobOf(pre, name);
      expect(job, name).toContain('persist-credentials: false');
      expect(job, name).toContain('actions/upload-artifact');
      expect(job, name).not.toMatch(/gh release (create|upload|edit|delete)/);
    }
    for (const name of ['snapshot-publish', 'rc-publish']) {
      const job = jobOf(pre, name);
      expect(job, name).not.toContain('actions/checkout');
      expect(job, name).not.toMatch(/npm (ci|run|test)/);
      expect(job, name).toContain('actions/download-artifact');
      expect(job, name).toMatch(/needs: [a-z]+-build/);
    }
  });

  it('the snapshot and the cleanup of the same PR share the group and cancel what is in progress', () => {
    const concurrency = pre.slice(pre.indexOf('\nconcurrency:'), pre.indexOf('\njobs:'));
    expect(concurrency).toContain('mcp-snapshot-pr{0}');
    expect(concurrency).toContain('github.event.pull_request.number');
    expect(concurrency).toMatch(/cancel-in-progress: true/);
    expect(jobOf(pre, 'cleanup')).not.toMatch(/concurrency:/);
  });

  it('the rc uses the same group on the PR and on workflow_dispatch (branch name, without refs/heads/)', () => {
    for (const name of ['rc-build', 'rc-publish']) {
      const job = jobOf(pre, name);
      expect(job, name).toContain(
        'group: mcp-rc-${{ github.event.pull_request.base.ref || github.ref_name }}',
      );
      expect(job, name).toMatch(/cancel-in-progress: false/);
      expect(job, name).not.toMatch(/group: mcp-rc-[^\n]*github\.ref\b/);
    }
  });

  it('the publishing jobs check the exact set of artifact files before publishing', () => {
    for (const name of ['snapshot-publish', 'rc-publish']) {
      const job = jobOf(pre, name);
      expect(job, name).toContain('Check the downloaded files');
      for (const file of [
        'AGENTS.mapping.md',
        'SKILL.md',
        'mapping-mcp.js',
        'mapping-signature.mjs',
        'setup.sh',
        'watch-comments.mjs',
      ]) {
        expect(job, `${name} ${file}`).toContain(`${file} ${file}.sha256`);
      }
      expect(job.indexOf('Check the downloaded files'), name).toBeLessThan(
        job.indexOf('gh release create'),
      );
    }
  });

  it('the list of expected files follows alphabetical order (LC_ALL=C) and the notes cite the extractor', () => {
    for (const name of ['snapshot-publish', 'rc-publish']) {
      const job = jobOf(pre, name);
      const expected = /expected="([^"]+)"/.exec(job)?.[1]?.split(' ') ?? [];
      expect(expected, name).toContain('mapping-signature.mjs.sha256');
      expect([...expected].sort(), name).toEqual(expected);
    }
    expect(pre.match(/mapping-signature\.mjs/g)?.length).toBeGreaterThan(8);
  });

  it('the PR number enters run: only through env:', () => {
    for (const body of runBodies(pre)) expect(body).not.toContain('${{');
  });

  it('workspaceAssets runs once per job and there is no sed of the version', () => {
    for (const name of ['snapshot-build', 'rc-build']) {
      const job = jobOf(pre, name);
      expect(job.match(/workspaceAssets\.mjs/g) ?? [], name).toHaveLength(1);
      expect(job, name).toContain(
        'stableRelease.mjs version --version-file mcp/version.ts',
      );
    }
    expect(pre).not.toContain('sed -n "s/.*SERVER_VERSION');
  });
});

// Stage #971, phase 4 (items 80 to 82): MCP stable release.
describe('mcp-release.yml: rc tags, a tag that shows up midway and one pass per script', () => {
  const release = read('.github/workflows/mcp-release.yml');

  it('the tag push does not match the rcs (mcp-v*-rc.N)', () => {
    expect(release).toMatch(/^ {4}tags: \['mcp-v\*', '!mcp-v\*-\*'\]$/m);
  });

  it('no step only emits ::notice::; a tag that shows up midway only attaches', () => {
    expect(release).not.toContain('::notice::');
    expect(release).not.toContain('appeared during the run; only attaches');
    expect(release).toMatch(/gh release view/);
    expect(release).toMatch(/gh release upload [^\n]*--clobber/);
  });

  it('workspaceAssets runs once and the version comes from readServerVersion (no sed)', () => {
    expect(release.match(/workspaceAssets\.mjs/g)).toHaveLength(1);
    expect(release).toContain('stableRelease.mjs version --version-file mcp/version.ts');
    expect(release).not.toContain('sed -n "s/.*SERVER_VERSION');
  });
});

// Stage #971, phase 4 (decision 12 of #920): no PR data enters run: by interpolation.
describe('no workflow interpolates PR, input or event data in run:', () => {
  const files = [
    'ci.yml',
    'deploy.yml',
    'mcp-prerelease.yml',
    'mcp-release.yml',
    'preview-on-pr.yml',
    'ci-rerun.yml',
  ];
  it.each(files)('%s', (file) => {
    for (const body of runBodies(read(`.github/workflows/${file}`))) {
      expect(body).not.toMatch(
        /\$\{\{[^}]*(github\.event|github\.head_ref|github\.base_ref|inputs\.)/,
      );
    }
  });
});

// Stage #1325, phase CA1 (decision 2): every ci.yml job has a timeout, close to double the longest
// time measured on 2026-11-09, so the required check finishes instead of staying pending.
describe('timeout-minutes on every ci.yml job', () => {
  const table: Record<string, number> = {
    epic: 3,
    static: 4,
    test: 8,
    coverage: 3,
    build: 7,
    check: 2,
    e2e: 7,
  };
  it.each(Object.entries(table))('%s: %i min', (name, minutes) => {
    expect(jobOf(ci, name)).toMatch(new RegExp(`^ {4}timeout-minutes: ${minutes}$`, 'm'));
  });

  it('the table covers every job in the file', () => {
    const jobsBlock = ci.slice(ci.indexOf('\njobs:\n'));
    const all = [...jobsBlock.matchAll(/^ {2}([a-z0-9-]+):$/gm)].map((m) => m[1]);
    expect(all.sort()).toEqual(Object.keys(table).sort());
  });

  it('the comment records the measurement and the date', () => {
    expect(ci).toMatch(/`timeout-minutes` on every job[\s\S]*2026-11-09/);
    expect(ci).toContain('double the longest time measured');
  });
});

// Stage #1325, phase CA1 (decisions 6 and 7): dist/index.html margin in the summary, at the end of the build.
describe('passo "Tamanho do dist/index.html"', () => {
  const build = jobOf(ci, 'build');
  const stepAt = build.indexOf('- name: Tamanho do dist/index.html');
  const step = build.slice(stepAt);

  it('is the last step of the build job', () => {
    expect(stepAt).toBeGreaterThan(-1);
    expect(build.indexOf('npm run build:mcp')).toBeLessThan(stepAt);
    expect(build.indexOf('npm run build:viewer')).toBeLessThan(stepAt);
    expect(step.match(/^ {6}- /gm)).toBeNull();
  });

  it('writes the margin to the summary and warns below 2,048 bytes', () => {
    expect(step).toContain('GITHUB_STEP_SUMMARY');
    expect(step).toContain('margin=$((INDEX_HTML_MAX_BYTES - size))');
    expect(step).toContain('-lt 2048');
    expect(step).toContain('::warning file=dist/index.html::');
    expect(step).toContain('abaixo de 2 KiB: enxugue antes de subir o teto');
  });

  it('keeps the ::error with the usual sentence', () => {
    expect(step).toContain(
      '::error file=dist/index.html::$size bytes, acima do orçamento de $INDEX_HTML_MAX_BYTES bytes.',
    );
  });

  it('reads the ceiling through `node scripts/ci/distBudget.mjs ceiling` (stage #1614, decision 2)', () => {
    expect(step).toContain('node scripts/ci/distBudget.mjs ceiling');
    expect(step).toContain('scripts/ci/dist-budget.json');
  });
});

// Stage #1614 (decision 2) and stage #1594 (decision 5): the step's `run:`, extracted from ci.yml and run
// with `bash`, finds the ceiling only in the JSON; without it (ref older than stage #1614) or with it invalid, it errors.
describe('passo "Tamanho do dist/index.html": where the ceiling comes from (stage #1614)', () => {
  const build = jobOf(ci, 'build');
  const stepAt = build.indexOf('- name: Tamanho do dist/index.html');
  const lines = build.slice(stepAt).split('\n');
  const runAt = lines.findIndex((l) => /^ {8}run: \|$/.test(l));
  const body = lines
    .slice(runAt + 1)
    .filter((l, i, all) => l.trim() !== '' || all.slice(i).some((x) => x.trim() !== ''))
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n');
  const SIZE = 1000;
  const JSON_CEILING = 1500;

  const runStep = (
    setup: (dir: string) => void,
  ): { status: number; out: string; summary: string } => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dist-step-'));
    try {
      mkdirSync(path.join(dir, 'dist'), { recursive: true });
      writeFileSync(path.join(dir, 'dist/index.html'), 'x'.repeat(SIZE));
      setup(dir);
      const summary = path.join(dir, 'summary.md');
      writeFileSync(summary, '');
      writeFileSync(path.join(dir, 'step.sh'), body);
      const r = spawnSync('bash', ['-e', '-o', 'pipefail', 'step.sh'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
      });
      return {
        status: r.status ?? -1,
        out: r.stdout,
        summary: readFileSync(summary, 'utf8'),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  const withJson = (ceiling: number) => (dir: string) => {
    mkdirSync(path.join(dir, 'scripts/ci'), { recursive: true });
    copyFileSync(
      'scripts/ci/distBudget.mjs',
      path.join(dir, 'scripts/ci/distBudget.mjs'),
    );
    writeFileSync(
      path.join(dir, 'scripts/ci/dist-budget.json'),
      `${JSON.stringify({ indexHtmlMaxBytes: ceiling, history: ['x'] }, null, 2)}\n`,
    );
  };

  it('with dist-budget.json and distBudget.mjs in the checkout: uses the JSON ceiling', () => {
    const r = runStep(withJson(JSON_CEILING));
    expect(r.status).toBe(0);
    expect(r.summary).toContain(`${SIZE} bytes (0 KiB) of ${JSON_CEILING} bytes`);
    expect(r.summary).toContain(`Margin: ${JSON_CEILING - SIZE} bytes`);
  });

  it('with the JSON, above the ceiling: exits with 1 and the usual ::error', () => {
    const r = runStep(withJson(SIZE - 1));
    expect(r.status).toBe(1);
    expect(r.out).toContain(
      `::error file=dist/index.html::${SIZE} bytes, acima do orçamento de ${SIZE - 1} bytes.`,
    );
  });

  it('without the JSON and with an old ci.yml: exits with 1 and the ::error that says to bring in main', () => {
    const r = runStep((dir) => {
      mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
      writeFileSync(
        path.join(dir, '.github/workflows/ci.yml'),
        'jobs:\n  build:\n    env:\n      # Budget.\n      INDEX_HTML_MAX_BYTES: 2500\n',
      );
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('ref older than stage #1614: bring in main');
    expect(r.summary).not.toContain('2500');
  });

  it('without the JSON and without the old ci.yml: exits with 1 and the ::error of ceiling not found', () => {
    const r = runStep(() => undefined);
    expect(r.status).toBe(1);
    expect(r.out).toContain('::error file=dist/index.html::Budget ceiling not found');
  });

  it('with an invalid JSON: exits with 1 and the ::error of ceiling not found', () => {
    const r = runStep((dir) => {
      withJson(JSON_CEILING)(dir);
      writeFileSync(path.join(dir, 'scripts/ci/dist-budget.json'), '{}');
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('::error file=dist/index.html::Budget ceiling not found');
  });
});

// Stage #1325, phase CA1 (decisions 3 and 4): rerun after an abandoned runner.
describe('ci-rerun.yml', () => {
  const rerun = read('.github/workflows/ci-rerun.yml');

  it('triggers by workflow_run of the CI, when completed', () => {
    expect(rerun).toMatch(/^name: 'CI: rerun after an abandoned runner'$/m);
    expect(rerun).toMatch(
      /^ {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]/m,
    );
  });

  it("the job's if: has the five conditions", () => {
    for (const condition of [
      "github.event.workflow_run.conclusion == 'failure'",
      "github.event.workflow_run.event == 'pull_request'",
      'github.event.workflow_run.head_repository.full_name == github.repository',
      'github.event.workflow_run.run_attempt == 1',
      "github.event.workflow_run.actor.login != 'dependabot[bot]'",
    ]) {
      expect(rerun).toContain(condition);
    }
  });

  it('permissions only on the job, none at the top', () => {
    expect(rerun).not.toMatch(/^permissions:/m);
    expect(rerun).toMatch(/^ {4}permissions:\n {6}contents: read\n {6}actions: write$/m);
  });

  it('checkout of main without PR code, only ci.yml and scripts/ci', () => {
    expect(rerun).toContain('ref: main');
    expect(rerun).toContain('sparse-checkout');
    expect(rerun).toContain('.github/workflows/ci.yml');
    expect(rerun).toContain('scripts/ci');
    expect(rerun).not.toMatch(/head_sha|head_branch|head_ref/);
  });

  it('reads the jobs, decides through the script and reruns only the failed ones', () => {
    expect(rerun).toContain('actions/runs/$RUN_ID/jobs?filter=latest&per_page=100');
    expect(rerun).toContain(
      'node scripts/ci/ciRerun.mjs decide --ci .github/workflows/ci.yml --jobs',
    );
    expect(rerun).toContain('gh run rerun "$RUN_ID" --failed --repo "$REPO"');
    expect(rerun).toContain('reruns: abandoned');
    expect(rerun).toContain('does not rerun:');
  });

  it('the summary always goes out, even when decide fails', () => {
    const summary = rerun.slice(rerun.indexOf('- name: Summary'));
    expect(summary).toMatch(/^ {8}if: always\(\)$/m);
    expect(summary).toContain('OUTCOME: ${{ steps.decide.outcome }}');
  });

  it('3 min timeout and concurrency per run, without cancelling', () => {
    expect(rerun).toMatch(/^ {4}timeout-minutes: 3$/m);
    expect(rerun).toMatch(/group: ci-rerun-\$\{\{ github\.event\.workflow_run\.id \}\}/);
    expect(rerun).toMatch(/cancel-in-progress: false/);
  });
});
