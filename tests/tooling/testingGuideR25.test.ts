// Achados 2 e 3 do relato da #838: os scripts do R25.22/R25.23 e as pastas do R25.43/R25.44 do
// docs/TESTING.md, rodados de verdade contra o pacote do repositório, dão o que o guia promete.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFontPath } from '../../src/model/components/library';
import { validateLibrary } from '../../src/model/library';
import { typeOf, unknownWarnings } from '../support/material3Library';

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

/**
 * Com a especialização baixada para a 14, só há erros de versão: os da 15 (`tokens`, `icons`, `structural`) e, com o pacote
 * na 16, os da 16 (`fieldModels` e `signature`, `ignore`, `calls` e `formats` do `code.compose`, em cada tipo e caso).
 */
function onlyVersionErrors(
  errors: readonly { message: string; path: string }[],
): boolean {
  return errors.every(
    (e) =>
      e.message === MSG_15 ||
      (e.message === MSG_16 &&
        (e.path === 'fieldModels' || e.path.includes('.code.compose.'))),
  );
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

  it('m3-tokens: valid, sem erro e só com avisos conhecidos, 50 tipos e 50 componentes', () => {
    const report = validate(ok);
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
    expect(report.ok).toBe(true);
    // Valida o pacote inteiro (229 exemplos): passa de 5 s com a cobertura ligada no CI.
  }, 30_000);

  it('m3-tokens-erro: exatamente os dois erros do card.json', () => {
    const report = validate(erro);
    expect(report.ok).toBe(false);
    expect(report.errors.map((e) => e.file)).toEqual([
      'components/card.json',
      'components/card.json',
    ]);
    expect(report.errors.map((e) => e.message).sort()).toEqual([
      'the token "inexistente" does not exist in the specialization tokens',
      'the token "primary" is a color, but a number is expected here',
    ]);
  }, 30_000);

  it('m3-tokens-v14: tokens e icons pedem a 15 e todo o resto é da 16 (fieldModels e assinaturas)', () => {
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
      // como o `node -e` do guia: sobe até `version` (`Math.max`) ou, para o `st9`, baixa de propósito
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
  cpSync(tela, st, { recursive: true });
  structural(st, 15, false);
  const st9 = join(work, 'm3-tela-st9');
  cpSync(tela, st9, { recursive: true });
  structural(st9, 14, true);

  it('m3-tela: valid, sem erro e só com avisos conhecidos', () => {
    const report = validate(tela);
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
  }, 30_000);

  it('m3-tela-v3: erros "only allowed with formatVersion 4", todos no divider', () => {
    const msg = 'only allowed with formatVersion 4';
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
      'material3-compose.spec.json:layers[2].annotationTypes[25].structural:a structural type does not draw: it cannot have a component',
    ]);
  });

  it('m3-tela-st9 (formatVersion 14): structural, tokens e icons pedem a 15 e o resto é da 16', () => {
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
