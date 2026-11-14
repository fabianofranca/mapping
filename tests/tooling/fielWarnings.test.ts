// R25.1: the m3-fiel library (copy of the package with eight components swapped by fiel.mjs) validates without error and only with the
// known `parameter outside the signature` warnings of the package (S5, #1079; provisional: bug #1774, curation in #1134).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { isFontPath } from '../../src/model/components/library';
import { parseComponentText } from '../../src/model/components/parseComponent';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { validateLibrary } from '../../src/model/library';
import { unknownWarnings } from '../support/material3Library';

const REPO = join(__dirname, '../..');

function list(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
  );
}

describe('fiel.mjs (R25.1)', () => {
  it('m3-fiel: no error and only known warnings (the interaction of the swapped types is not left unused)', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'fiel-')), 'm3-fiel');
    cpSync(join(REPO, 'libraries/material3-compose'), dir, { recursive: true });
    execFileSync('node', [join(REPO, 'scripts/testing/fiel.mjs'), dir, '4']);
    writeFileSync(join(dir, '.keep'), '');
    const files = list(dir)
      .filter((p) => p !== '.keep')
      .map((path) =>
        isFontPath(path)
          ? { path, binary: true as const }
          : { path, text: readFileSync(join(dir, path), 'utf8') },
      );
    const report = validateLibrary({ files });
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
  }, 30_000);

  it('m3-fx (R25.71): the format 4 card validates without error and only with the known warnings, without "text larger than the box" (CL1, finding 1.1)', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'fx-')), 'm3-fx');
    cpSync(join(REPO, 'libraries/material3-compose'), dir, { recursive: true });
    execFileSync('node', [join(REPO, 'scripts/testing/tokens.mjs'), dir]);
    execFileSync('node', [join(REPO, 'scripts/testing/fx.mjs'), dir]);
    const files = list(dir).map((path) =>
      isFontPath(path)
        ? { path, binary: true as const }
        : { path, text: readFileSync(join(dir, path), 'utf8') },
    );
    const report = validateLibrary({ files });
    expect(report.errors).toEqual([]);
    expect(
      report.warnings
        .map((w) => w.message)
        .filter((m) => m.includes('larger than the box')),
    ).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
  }, 30_000);

  it('top-app-bar: the red box measures 48, 68 and 88 with 1, 2 and 3 lines (R25.95)', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'fiel-')), 'm3-fiel');
    cpSync(join(REPO, 'libraries/material3-compose'), dir, { recursive: true });
    execFileSync('node', [join(REPO, 'scripts/testing/fiel.mjs'), dir, '4']);
    const parsed = parseComponentText(
      readFileSync(join(dir, 'components/top-app-bar.json'), 'utf8'),
    );
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const heightOf = (style: string): number => {
      const { root } = instantiate(
        parsed.component,
        { style },
        { x: 0, y: 0, width: 140, height: 100 },
        { measure: approximateMeasurer },
      );
      // pt-BR kept: node name written by scripts/testing/fiel.mjs into the library component
      const box = [...walk(root)].find((n) => n.name === 'caixa');
      return box?.height ?? -1;
    };
    expect(['small', 'center', 'medium'].map(heightOf)).toEqual([48, 68, 88]);
  });
  it('flow-row: the five boxes wrap into 3 + 2, at x 10, 50, 90 and y 10 / 36 (R25.98)', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'fiel-')), 'm3-fiel');
    cpSync(join(REPO, 'libraries/material3-compose'), dir, { recursive: true });
    execFileSync('node', [join(REPO, 'scripts/testing/fiel.mjs'), dir, '4']);
    const parsed = parseComponentText(
      readFileSync(join(dir, 'components/flow-row.json'), 'utf8'),
    );
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const { root } = instantiate(
      parsed.component,
      {},
      { x: 0, y: 0, width: 140, height: 80 },
      { measure: approximateMeasurer },
    );
    const boxes = absoluteBoxes(root);
    const at = (name: string) => {
      const node = [...walk(root)].find((n) => n.name === name);
      const box = node === undefined ? undefined : boxes.get(node.id);
      return [box?.x, box?.y];
    };
    expect(['k1', 'k2', 'k3', 'k4', 'k5'].map(at)).toEqual([
      [10, 10],
      [50, 10],
      [90, 10],
      [10, 36],
      [50, 36],
    ]);
  });
});
