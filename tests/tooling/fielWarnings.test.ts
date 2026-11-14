// R25.1: a biblioteca m3-fiel (cópia do pacote com oito componentes trocados pelo fiel.mjs) valida sem erro e só com os
// avisos `parâmetro fora da ficha` conhecidos do pacote (S5, #1079; provisório: bug #1774, curadoria na #1134).
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
  it('m3-fiel: sem erro e só com avisos conhecidos (o interaction dos tipos trocados não fica sem uso)', () => {
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

  it('m3-fx (R25.71): o card de formato 4 valida sem erro e só com os avisos conhecidos, sem "texto maior que a caixa" (CL1, achado 1.1)', () => {
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
        .filter((m) => m.includes('maior que a caixa')),
    ).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
  }, 30_000);

  it('top-app-bar: a caixa vermelha mede 48, 68 e 88 com 1, 2 e 3 linhas (R25.95)', () => {
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
      const box = [...walk(root)].find((n) => n.name === 'caixa');
      return box?.height ?? -1;
    };
    expect(['small', 'center', 'medium'].map(heightOf)).toEqual([48, 68, 88]);
  });
  it('flow-row: as cinco caixas quebram em 3 + 2, em x 10, 50, 90 e y 10 / 36 (R25.98)', () => {
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
