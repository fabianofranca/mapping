import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { diffSpecs } from '../../src/model/specVersions';
import { parseSpec, parseSpecText, type Spec } from '../../src/model/spec';
import { specWarnings } from '../../src/model/specWarnings';
import { parseComponent } from '../../src/model/components/parseComponent';
import { parseIconsText } from '../../src/model/components/icons';
import { validateLibrary } from '../../src/model/library';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { parseComponentText } from '../../src/model/components/parseComponent';
import { isModelMessageTemplateCode } from '../../src/model/messages';
import { brokenDocuments, readFixture } from '../support/invalidInputs';
import {
  ROOT,
  SPEC_FILE,
  files as m3Files,
  text as m3Text,
} from '../support/material3Library';

// Guard (MB6, #1361, decision 15): no problem or warning from the stage #1263 modules reaches the
// interface without a `code`. The inputs come from `tests/support/invalidInputs.ts` (valid documents
// systematically broken). The EXCEPTIONS list is the only way out: each entry states the reason.

/**
 * Declared exceptions (decision 6 and the stage's "Out" list): none today. The `JSON.parse` text enters
 * as the `{detail}` of `JSON inválido: {detail}`, which has a code; a zod code outside the decision 6
 * list only enters here, with the reason, if the guard finds it.
 */
const EXCEPTIONS: { readonly match: RegExp; readonly reason: string }[] = [];

type Coded = {
  message: string;
  code?: string;
  path?: string;
  file?: string;
  detail?: { code: string };
};

let problems: string[] = [];
let checked = 0;
beforeEach(() => {
  problems = [];
  checked = 0;
});
function check(origin: string, items: readonly Coded[]): void {
  for (const item of items) {
    checked += 1;
    const excepted = EXCEPTIONS.some((e) => e.match.test(item.message));
    if (excepted) continue;
    const rawDetail = item.detail?.code === 'raw';
    if (rawDetail || item.code === undefined || !isModelMessageTemplateCode(item.code)) {
      problems.push(`${origin} [${item.file ?? ''}${item.path ?? ''}]: ${item.message}`);
    }
  }
}

const iconsSpec = JSON.parse(readFixture('icons/icons.spec.json')) as unknown;
const iconsComponent = JSON.parse(readFixture('icons/components/badge.json')) as unknown;
const iconsSet = JSON.parse(readFixture('icons/icons/set.json')) as unknown;
const m3Spec = JSON.parse(m3Text(SPEC_FILE)) as unknown;
const m3Button = JSON.parse(m3Text('components/button.json')) as unknown;

describe('guard: every model problem and warning has a code', () => {
  it('the specialization (parseSpec, specWarnings, diffSpecs)', () => {
    const valid = parseSpec(m3Spec);
    expect(valid.ok).toBe(true);
    for (const doc of [
      ...brokenDocuments(m3Spec, 120),
      ...brokenDocuments(iconsSpec, 80),
    ]) {
      const result = parseSpec(doc);
      if (!result.ok) check('spec', result.issues);
      else {
        check(
          'specWarnings',
          specWarnings(result.spec, result.ignored).map((w) => ({
            message: w.message,
            code: w.messageCode,
            path: w.path,
          })),
        );
        if (valid.ok) {
          const changes = diffSpecs(valid.spec as Spec, result.spec);
          check(
            'diffSpecs',
            changes.map((c) => ({ message: c.message, code: c.messageCode })),
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(problems).toEqual([]);
    // 120 s like the neighboring tests: takes ~24 s (the same on the epic without CL2) and exceeded 60 s on the overloaded CI shard.
  }, 120_000);

  it('the component (parseComponent)', () => {
    for (const doc of [
      ...brokenDocuments(m3Button, 120),
      ...brokenDocuments(iconsComponent, 80),
    ]) {
      const result = parseComponent(doc);
      if (!result.ok) check('component', result.issues);
      else check('component warning', result.warnings);
    }
    expect(checked).toBeGreaterThan(300);
    expect(problems).toEqual([]);
  });

  it('the icons file (parseIconsText)', () => {
    for (const doc of brokenDocuments(iconsSet, 120)) {
      const result = parseIconsText(JSON.stringify(doc));
      if (!result.ok) check('icons', result.issues);
    }
    expect(checked).toBeGreaterThan(100);
    expect(problems).toEqual([]);
  });

  it('the library validator (validateLibrary)', () => {
    const small = [
      { path: 'icons.spec.json', doc: iconsSpec },
      { path: 'components/badge.json', doc: iconsComponent },
      { path: 'icons/set.json', doc: iconsSet },
    ];
    const baseFiles = small.map((f) => ({ path: f.path, text: JSON.stringify(f.doc) }));
    for (const { path, doc } of small) {
      for (const broken of brokenDocuments(doc, 15)) {
        const files = baseFiles.map((f) =>
          f.path === path ? { ...f, text: JSON.stringify(broken) } : f,
        );
        check('library', validateLibrary({ files, level: 3 }).issues);
      }
    }
    // missing, empty, stray file and broken JSON (the large library, once each)
    const base = m3Files.filter((f) => f.text !== undefined);
    const dropped = base.filter((f) => f.path !== 'components/button.json');
    check('library/ausente', validateLibrary({ files: dropped, level: 3 }).issues);
    const extra = [...base, { path: 'extra.json', text: '{}' }];
    check('library/solto', validateLibrary({ files: extra, level: 3 }).issues);
    const brokenJson = base.map((f) =>
      f.path === 'components/button.json' ? { ...f, text: '{' } : f,
    );
    check('library/json', validateLibrary({ files: brokenJson, level: 3 }).issues);
    expect(checked).toBeGreaterThan(100);
    expect(problems).toEqual([]);
  }, 120_000);

  it('the drawing engine (instantiate): messages follow warnings', () => {
    for (const doc of brokenDocuments(m3Button, 120)) {
      const parsed = parseComponentText(JSON.stringify(doc));
      if (!parsed.ok) continue;
      const out = instantiate(
        parsed.component,
        {},
        { x: 0, y: 0, width: 300, height: 40 },
        { measure: approximateMeasurer },
      );
      expect(out.messages.map((m) => m.text)).toEqual([...out.warnings]);
      for (const m of out.messages) expect(isModelMessageTemplateCode(m.code)).toBe(true);
    }
    // 120 s like the neighboring tests: takes ~1.3 s, but exceeded the default 5 s on the overloaded CI shard (CL2).
  }, 120_000);

  it('the guard rejects a problem without a code', () => {
    check('simulado', [{ message: 'sem código' }, { message: 'x', code: 'nao.existe' }]);
    expect(problems).toHaveLength(2);
  });

  it('broken JSON comes out with a code (the JSON.parse text stays in {detail})', () => {
    for (const parsed of [
      parseSpecText('{'),
      parseComponentText('{'),
      parseIconsText('{'),
    ]) {
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) check('json', parsed.issues);
    }
    expect(checked).toBe(3);
    expect(problems).toEqual([]);
  });

  it('the helper reads the library files (sanity)', () => {
    expect(readdirSync(ROOT).length).toBeGreaterThan(0);
    expect(readFileSync(join(ROOT, SPEC_FILE), 'utf8').length).toBeGreaterThan(0);
  });
});
