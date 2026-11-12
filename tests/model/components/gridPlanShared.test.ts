// CL1 (P3): a conta das extensões das linhas de fluxo e a leitura das chaves de trilha são uma só
// (`gridPlan.ts`); `layout.ts`, `arrange.ts` e `componentMarkings.ts` a importam em vez de repeti-la.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { placeCells } from '../../../src/model/components/gridLayout';
import {
  TRACK_KEYS,
  lineExtents,
  validTrack,
} from '../../../src/model/components/gridPlan';

const SRC = join(__dirname, '../../../src/model');
const source = (file: string): string => readFileSync(join(SRC, file), 'utf8');

describe('lineExtents (gridPlan)', () => {
  it('a extensão de cada linha é a do maior filho dela', () => {
    const { cells, lines } = placeCells([1, 1, 1, 1, 1], 2);
    expect(lineExtents(cells, lines, [10, 30, 5, 5, 7])).toEqual([30, 5, 7]);
  });

  it('sem filhos não há linha', () => {
    expect(lineExtents([], 0, [])).toEqual([]);
  });
});

describe('uma só implementação', () => {
  it.each(['components/layout.ts', 'components/arrange.ts', 'componentMarkings.ts'])(
    '%s não repete a conta das linhas de fluxo nem a validação das trilhas',
    (file) => {
      const text = source(file);
      expect(text).not.toMatch(/function lineExtents\b/);
      expect(text).not.toMatch(/Array\.from\(\{ length: lines \}/);
      expect(text).not.toMatch(/function trackNumber\b/);
    },
  );

  it('arrange.ts lê as chaves de trilha de gridPlan', () => {
    expect(source('components/arrange.ts')).toMatch(
      /TRACK_KEYS[\s\S]*from '\.\/gridPlan'/,
    );
    expect(TRACK_KEYS.map((entry) => entry.key)).toEqual([
      'columns',
      'minColumnWidth',
      'rows',
      'minRowHeight',
    ]);
    expect(validTrack('count', 2.5)).toBeUndefined();
    expect(validTrack('min', '80')).toBe(80);
  });
});
