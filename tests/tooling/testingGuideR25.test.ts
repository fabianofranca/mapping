// Achados 2 e 3 do relato da #838: os scripts do R25.22/R25.23 e as pastas do R25.43/R25.44 do
// docs/TESTING.md, rodados de verdade contra o pacote do repositório, dão o que o guia promete.
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

describe('R25.22 e R25.23: o tokens.mjs do guia mescla os tokens do pacote', () => {
  const ok = copyPackage('m3-tokens');
  execFileSync('node', [tokensMjs, ok]);
  const erro = copyPackage('m3-tokens-erro');
  execFileSync('node', [tokensMjs, erro, 'erro']);
  const v14 = copyPackage('m3-tokens-v14');
  execFileSync('node', [tokensMjs, v14]);
  editJson(join(v14, 'material3-compose.spec.json'), (s) => {
    s.formatVersion = 14;
  });

  it('m3-tokens: valid, sem erro nem aviso, 50 tipos e 50 componentes', () => {
    const report = validate(ok);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('m3-tokens-erro: exatamente os dois erros do card.json', () => {
    const report = validate(erro);
    expect(report.ok).toBe(false);
    expect(report.errors.map((e) => e.file)).toEqual([
      'components/card.json',
      'components/card.json',
    ]);
    expect(report.errors.map((e) => e.message).sort()).toEqual([
      'o token "inexistente" não existe nos tokens da especialização',
      'o token "primary" é cor, mas aqui se espera número',
    ]);
  });

  it('m3-tokens-v14: dois erros, tokens e icons (o pacote também declara icons)', () => {
    const report = validate(v14);
    expect(report.ok).toBe(false);
    expect(report.errors.map((e) => `${e.file}:${e.path}`).sort()).toEqual([
      'material3-compose.spec.json:icons',
      'material3-compose.spec.json:tokens',
    ]);
    expect(
      report.errors.every((e) => e.message === 'só é permitido com formatVersion 15'),
    ).toBe(true);
  });
});

describe('R25.43 e R25.44: as pastas de tela do guia', () => {
  const colorField = typeOf('divider').fields.find((f) => f.key === 'color');
  const dividerColors = colorField?.type === 'enum' ? colorField.options : [];
  const divider = (dir: string) => join(dir, 'components/divider.json');
  const specOf = (dir: string) => join(dir, 'material3-compose.spec.json');
  const issues = (dir: string) =>
    validate(dir).errors.map((e) => `${e.file}:${e.path}:${e.message}`);

  const tela = copyPackage('m3-tela');
  editJson(divider(tela), (c) => {
    c.formatVersion = 4;
    c.screen = { anchor: 'top-left' };
    const template = c.template as { children: { stroke?: unknown }[] };
    template.children[0]!.stroke = { color: '#000000', width: 2, scale: false };
  });
  const telaV3 = join(work, 'm3-tela-v3');
  cpSync(tela, telaV3, { recursive: true });
  editJson(divider(telaV3), (c) => {
    c.formatVersion = 3;
  });
  const structural = (dir: string, version: number, dropComponent: boolean) =>
    editJson(specOf(dir), (spec) => {
      spec.formatVersion = version;
      const layers = spec.layers as { annotationTypes: Record<string, unknown>[] }[];
      for (const type of layers.flatMap((l) => l.annotationTypes)) {
        if (type.id !== 'divider') continue;
        type.structural = true;
        if (dropComponent) delete type.component;
      }
    });
  const st = join(work, 'm3-tela-st');
  cpSync(tela, st, { recursive: true });
  structural(st, 15, false);
  const st9 = join(work, 'm3-tela-st9');
  cpSync(tela, st9, { recursive: true });
  structural(st9, 14, true);

  it('m3-tela: valid, sem erro nem aviso', () => {
    const report = validate(tela);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('m3-tela-v3: erros "só é permitido com formatVersion 4", todos no divider', () => {
    const msg = 'só é permitido com formatVersion 4';
    expect(issues(telaV3).sort()).toEqual(
      [
        'screen',
        'template.children[0].stroke.scale',
        'template.children[0].layout.type',
        'template.children[0].children[1].width',
        'template.children[0].children[1].height',
        // a cor do papel escolhido (MF5): um `$token` em cada caso do `$switch` e no padrão
        ...dividerColors.map(
          (role) => `template.children[0].children[1].fill.cases.${role}`,
        ),
        'template.children[0].children[1].fill.default',
        // o recuo por ponta (MF5): o tamanho das duas pontas vem de expressão
        'template.children[0].children[0].width',
        'template.children[0].children[0].height',
        'template.children[0].children[2].width',
        'template.children[0].children[2].height',
      ]
        .map((path) => `components/divider.json:${path}:${msg}`)
        .sort(),
    );
  });

  it('m3-tela-st: um erro, o tipo estrutural com component', () => {
    expect(issues(st)).toEqual([
      'material3-compose.spec.json:layers[2].annotationTypes[25].structural:um tipo estrutural não desenha: não pode ter component',
    ]);
  });

  it('m3-tela-st9 (formatVersion 14): três erros, structural, tokens e icons', () => {
    const msg = 'só é permitido com formatVersion 15';
    expect(issues(st9).sort()).toEqual(
      ['icons', 'layers[2].annotationTypes[25].structural', 'tokens']
        .map((path) => `material3-compose.spec.json:${path}:${msg}`)
        .sort(),
    );
  });
});
