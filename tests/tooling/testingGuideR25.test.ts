// Findings 2 and 3 of the report of #838: the R25.22/R25.23 scripts and the R25.43/R25.44 folders of
// docs/TESTING.md, really run against the repository package, give what the guide promises.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFontPath } from '../../src/model/components/library';
import { validateLibrary } from '../../src/model/library';
import { typeOf } from '../support/material3Library';

const REPO = join(__dirname, '../..');
const PACKAGE = join(REPO, 'libraries/material3-compose');

const work = mkdtempSync(join(tmpdir(), 'r25-'));
const tokensMjs = join(REPO, 'scripts/testing/tokens.mjs');

function copyPackage(name: string): string {
  const dir = join(work, name);
  cpSync(PACKAGE, dir, { recursive: true });
  return dir;
}

function list(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
  );
}

function validate(dir: string) {
  const files = list(dir).map((path) =>
    isFontPath(path)
      ? { path, binary: true as const }
      : { path, text: readFileSync(join(dir, path), 'utf8') },
  );
  return validateLibrary({ files });
}

function editJson(file: string, edit: (json: Record<string, unknown>) => void): void {
  const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  edit(json);
  writeFileSync(file, JSON.stringify(json, null, 2));
}

const MSG_15 = 'only allowed with formatVersion 15';
const MSG_16 = 'only allowed with formatVersion 16';
const MSG_17 = 'only allowed with formatVersion 17';
const MSG_18 = 'only allowed with formatVersion 18';

/**
 * With the specialization lowered to 14, there are only version errors: those of 15 (`tokens`, `icons`, `structural`), those of 16
 * (`fieldModels` and `signature`, `ignore`, `calls` and `formats` of `code.compose`, in each type and case) and, with the package
 * at 17, those of 17 (the `slots` of the types) and, with the package at 18, those of 18 (the `accessibility` of the root and of the types).
 */
function onlyVersionErrors(
  errors: readonly { message: string; path: string }[],
): boolean {
  return errors.every(
    (e) =>
      e.message === MSG_15 ||
      (e.message === MSG_17 && e.path.endsWith('.slots')) ||
      (e.message === MSG_18 && e.path.endsWith('accessibility')) ||
      (e.message === MSG_16 &&
        (e.path === 'fieldModels' || e.path.includes('.code.compose.'))),
  );
}

describe('R25.22 and R25.23: the guide tokens.mjs merges the package tokens', () => {
  const ok = copyPackage('m3-tokens');
  execFileSync('node', [tokensMjs, ok]);
  const failing = copyPackage('m3-tokens-error');
  execFileSync('node', [tokensMjs, failing, 'error']);
  const v14 = copyPackage('m3-tokens-v14');
  execFileSync('node', [tokensMjs, v14]);
  editJson(join(v14, 'material3-compose.spec.json'), (s) => {
    s.formatVersion = 14;
  });

  it('m3-tokens: valid, no error or warning, 50 types and 50 components', () => {
    const report = validate(ok);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    // Validates the whole package (229 examples): takes over 5 s with coverage on in CI.
  }, 30_000);

  it('m3-tokens-error: exactly the two errors of card.json', () => {
    const report = validate(failing);
    expect(report.ok).toBe(false);
    expect(report.errors.map((e) => e.file)).toEqual([
      'components/card.json',
      'components/card.json',
    ]);
    expect(report.errors.map((e) => e.message).sort()).toEqual([
      'the token "missing" does not exist in the specialization tokens',
      'the token "primary" is a color, but a number is expected here',
    ]);
  }, 30_000);

  it('m3-tokens-v14: tokens and icons ask for 15, the slots for 17, the accessibility for 18 and everything else is from 16 (fieldModels and signatures)', () => {
    const report = validate(v14);
    expect(report.ok).toBe(false);
    expect(report.errors.every((e) => e.file === 'material3-compose.spec.json')).toBe(
      true,
    );
    expect(onlyVersionErrors(report.errors)).toBe(true);
    expect(
      report.errors
        .filter((e) => e.message === MSG_15)
        .map((e) => e.path)
        .sort(),
    ).toEqual(['icons', 'tokens']);
  }, 30_000);
});

describe('R25.43 and R25.44: the screen folders of the guide', () => {
  const colorField = typeOf('divider').fields.find((f) => f.key === 'color');
  const dividerColors = colorField?.type === 'enum' ? colorField.options : [];
  const divider = (dir: string) => join(dir, 'components/divider.json');
  const specOf = (dir: string) => join(dir, 'material3-compose.spec.json');
  const issues = (dir: string) =>
    validate(dir).errors.map((e) => `${e.file}:${e.path}:${e.message}`);

  const screen = copyPackage('m3-tela');
  editJson(divider(screen), (c) => {
    c.formatVersion = 4;
    c.screen = { anchor: 'top-left' };
    const template = c.template as { children: { stroke?: unknown }[] };
    template.children[0]!.stroke = { color: '#000000', width: 2, scale: false };
  });
  const screenV3 = join(work, 'm3-tela-v3');
  cpSync(screen, screenV3, { recursive: true });
  editJson(divider(screenV3), (c) => {
    c.formatVersion = 3;
  });
  const structural = (dir: string, version: number, dropComponent: boolean) =>
    editJson(specOf(dir), (spec) => {
      // like the guide's `node -e`: raises up to `version` (`Math.max`) or, for `st9`, lowers on purpose
      spec.formatVersion =
        version >= 15 ? Math.max(spec.formatVersion as number, version) : version;
      const layers = spec.layers as { annotationTypes: Record<string, unknown>[] }[];
      for (const type of layers.flatMap((l) => l.annotationTypes)) {
        if (type.id !== 'divider') continue;
        type.structural = true;
        if (dropComponent) delete type.component;
      }
    });
  const st = join(work, 'm3-tela-st');
  cpSync(screen, st, { recursive: true });
  structural(st, 15, false);
  const st9 = join(work, 'm3-tela-st9');
  cpSync(screen, st9, { recursive: true });
  structural(st9, 14, true);

  it('m3-tela: valid, no error or warning', () => {
    const report = validate(screen);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  }, 30_000);

  it('m3-tela-v3: "only allowed with formatVersion 4" errors, all in the divider', () => {
    const msg = 'only allowed with formatVersion 4';
    expect(issues(screenV3).sort()).toEqual(
      [
        'screen',
        'template.children[0].stroke.scale',
        'template.children[0].layout.type',
        'template.children[0].children[1].width',
        'template.children[0].children[1].height',
        // the chosen role's color (MF5): a `$token` in each case of the `$switch` and in the default
        ...dividerColors.map(
          (role) => `template.children[0].children[1].fill.cases.${role}`,
        ),
        'template.children[0].children[1].fill.default',
        // the per-end inset (MF5): the size of the two ends comes from an expression
        'template.children[0].children[0].width',
        'template.children[0].children[0].height',
        'template.children[0].children[2].width',
        'template.children[0].children[2].height',
      ]
        .map((path) => `components/divider.json:${path}:${msg}`)
        .sort(),
    );
  });

  it('m3-tela-st: one error, the structural type with a component', () => {
    expect(issues(st)).toEqual([
      'material3-compose.spec.json:layers[2].annotationTypes[25].structural:a structural type does not draw: it cannot have a component',
    ]);
  });

  it('m3-tela-st9 (formatVersion 14): structural, tokens and icons ask for 15, the slots for 17 and the rest is from 16', () => {
    const errors = validate(st9).errors;
    expect(onlyVersionErrors(errors)).toBe(true);
    expect(
      errors
        .filter((e) => e.message === MSG_15)
        .map((e) => e.path)
        .sort(),
    ).toEqual(['icons', 'layers[2].annotationTypes[25].structural', 'tokens']);
  }, 30_000);
});
