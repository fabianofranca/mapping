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

// Guarda (MB6, #1361, decisão 15): nenhum problema ou aviso dos módulos da etapa #1263 chega à
// interface sem `code`. As entradas vêm de `tests/support/invalidInputs.ts` (documentos válidos
// estragados de forma sistemática). A lista EXCEPTIONS é a única saída: cada entrada diz o motivo.

/**
 * Exceções declaradas (decisão 6 e "Fora" da etapa): nenhuma hoje. O texto do `JSON.parse` entra
 * como `{detail}` de `JSON inválido: {detail}`, que tem código; um código do zod fora da lista da
 * decisão 6 só entra aqui, com o motivo, se a guarda o achar.
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

describe('guarda: todo problema e aviso do modelo tem código', () => {
  it('a especialização (parseSpec, specWarnings, diffSpecs)', () => {
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
  }, 60_000);

  it('o componente (parseComponent)', () => {
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

  it('o arquivo de ícones (parseIconsText)', () => {
    for (const doc of brokenDocuments(iconsSet, 120)) {
      const result = parseIconsText(JSON.stringify(doc));
      if (!result.ok) check('icons', result.issues);
    }
    expect(checked).toBeGreaterThan(100);
    expect(problems).toEqual([]);
  });

  it('o validador da biblioteca (validateLibrary)', () => {
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
    // arquivo ausente, vazio, solto e JSON quebrado (a biblioteca grande, uma vez cada)
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

  it('o motor de desenho (instantiate): messages acompanham warnings', () => {
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
    // 120 s como os testes vizinhos: leva ~1,3 s, mas estourou os 5 s padrão no shard sobrecarregado do CI (CL2).
  }, 120_000);

  it('a guarda reprova um problema sem código', () => {
    check('simulado', [{ message: 'sem código' }, { message: 'x', code: 'nao.existe' }]);
    expect(problems).toHaveLength(2);
  });

  it('JSON quebrado sai com código (o texto do JSON.parse fica no {detail})', () => {
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

  it('o auxiliar lê os arquivos da biblioteca (sanidade)', () => {
    expect(readdirSync(ROOT).length).toBeGreaterThan(0);
    expect(readFileSync(join(ROOT, SPEC_FILE), 'utf8').length).toBeGreaterThan(0);
  });
});
