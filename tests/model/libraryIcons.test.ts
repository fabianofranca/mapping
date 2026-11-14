// CF7: o conjunto de ícones no validador da biblioteca (níveis 1 a 3), no catálogo e no pacote.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { componentPaths, loadSpecComponents } from '../../src/model/componentCatalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { loadLibrary, withHostTokens } from '../../src/model/components/library';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { usesPackageFiles } from '../../src/model/libraryPackage';
import { parseSpecText } from '../../src/model/spec';

const DIR = 'tests/fixtures/icons';
const SPEC = 'icons.spec.json';
const PATHS = [SPEC, 'components/badge.json', 'icons/set.json'];

const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function pack(overrides: Record<string, string | null> = {}): LibraryFile[] {
  const out: LibraryFile[] = [];
  for (const path of PATHS) {
    const text = path in overrides ? overrides[path] : read(path);
    if (text !== null && text !== undefined) out.push({ path, text });
  }
  return out;
}

type JsonPath = readonly (string | number)[];

/** O texto do arquivo com o valor trocado (ou, com `undefined`, apagado) no caminho. */
const edit = (path: string, at: JsonPath, value: unknown): string => {
  const json: unknown = JSON.parse(read(path));
  let node: unknown = json;
  for (const key of at.slice(0, -1)) node = Reflect.get(Object(node), key);
  const last = at[at.length - 1] as string | number;
  if (value === undefined) Reflect.deleteProperty(Object(node), last);
  else Reflect.set(Object(node), last, value);
  return JSON.stringify(json);
};

const NAME = ['template', 'children', 0, 'name'] as const;
const OPTIONS = ['layers', 0, 'annotationTypes', 0, 'fields', 0, 'options'] as const;

const brief = (
  issues: readonly { severity: string; file: string; path: string; message: string }[],
) => issues.map((i) => `${i.severity} ${i.file} ${i.path}: ${i.message}`);

describe('validateLibrary: conjunto de ícones', () => {
  it('o pacote de teste passa sem erros nem avisos', () => {
    const report = validateLibrary({ files: pack() });
    expect(brief(report.issues)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('arquivo de ícones ausente é erro de arquivo na especialização', () => {
    const report = validateLibrary({ files: pack({ 'icons/set.json': null }) });
    expect(brief(report.errors)).toEqual([
      `error ${SPEC} icons: arquivo não encontrado: icons/set.json`,
    ]);
  });

  it('arquivo de ícones inválido dá os erros do arquivo, com o caminho', () => {
    const bad = read('icons/set.json').replace('"check"', '"Check"');
    const report = validateLibrary({ files: pack({ 'icons/set.json': bad }) });
    expect(brief(report.errors)).toContain(
      'error icons/set.json icons.Check: invalid name; use [a-z0-9][a-z0-9-_]*',
    );
  });

  it('o arquivo de ícones não é "arquivo não referenciado"', () => {
    const report = validateLibrary({ files: pack() });
    expect(report.warnings.some((w) => w.file === 'icons/set.json')).toBe(false);
  });

  it('nome literal fora do conjunto é erro no nível 2, no caminho do nó', () => {
    const badComponent = edit('components/badge.json', NAME, 'nuvem');
    const report = validateLibrary({
      files: pack({ 'components/badge.json': badComponent }),
    });
    expect(brief(report.errors)).toEqual([
      'error components/badge.json template.children[0].name: o ícone "nuvem" não existe no conjunto de ícones (icons/set.json)',
    ]);
  });

  it('nível 1 não confere o nome literal (só o nível 2 em diante)', () => {
    const badComponent = edit('components/badge.json', NAME, 'nuvem');
    const report = validateLibrary({
      files: pack({ 'components/badge.json': badComponent }),
      level: 1,
    });
    expect(report.errors).toEqual([]);
  });

  it('nó icon com nome literal e sem icons na especialização é erro', () => {
    const noIcons = edit(SPEC, ['icons'], undefined);
    const literal = edit('components/badge.json', NAME, 'check');
    const report = validateLibrary({
      files: pack({ [SPEC]: noIcons, 'components/badge.json': literal }),
    });
    expect(brief(report.errors)).toContain(
      'error components/badge.json template.children[0].name: o ícone "check" não pode ser conferido: a especialização não declara icons',
    );
  });

  it('nível 3: enum lido em name com opção fora do conjunto avisa', () => {
    const spec = edit(SPEC, OPTIONS, ['check', 'nuvem']);
    const report = validateLibrary({ files: pack({ [SPEC]: spec }) });
    expect(report.ok).toBe(true);
    expect(brief(report.warnings)).toContain(
      `warning ${SPEC} layers[0].annotationTypes[0].fields[0].options[1]: a opção "nuvem" do campo "icon" não está no conjunto de ícones; o desenho cai no reservado`,
    );
  });

  it('nível 2 não dá o aviso do enum (é do nível 3)', () => {
    const spec = edit(SPEC, OPTIONS, ['check', 'nuvem']);
    const report = validateLibrary({ files: pack({ [SPEC]: spec }), level: 2 });
    expect(report.warnings).toEqual([]);
  });

  it('a prova de desenho avisa o ícone desconhecido do preview', () => {
    const comp = edit('components/badge.json', ['preview', 'icon'], 'nuvem');
    const report = validateLibrary({ files: pack({ 'components/badge.json': comp }) });
    expect(brief(report.warnings).join('\n')).toContain('ícone desconhecido: nuvem');
  });
});

describe('catálogo e biblioteca carregam o conjunto de ícones', () => {
  const spec = (() => {
    const parsed = parseSpecText(read(SPEC));
    if (!parsed.ok) throw new Error('spec inválida');
    return parsed.spec;
  })();
  const readText = (path: string): string | undefined =>
    PATHS.includes(path) ? read(path) : undefined;

  it('componentPaths inclui o arquivo de ícones', () => {
    expect(componentPaths(spec, SPEC)).toEqual([
      'components/badge.json',
      'icons/set.json',
    ]);
  });

  it('loadSpecComponents põe o conjunto no componente e desenha o ícone do pacote', () => {
    const loaded = loadSpecComponents(spec, SPEC, 1, readText);
    expect(loaded.problems).toEqual([]);
    const component = loaded.byType.get('badge');
    expect(component?.resolvedIcons?.icons.check).toBeDefined();
    if (component === undefined) throw new Error('sem componente');
    const { root } = instantiate(
      component,
      { icon: 'check', tint: '#0a7' },
      { x: 0, y: 0, width: 48, height: 48 },
      { measure: approximateMeasurer },
    );
    expect(JSON.stringify(root)).toContain('M5 12l5 5L20 7');
  });

  it('arquivo de ícones ausente vira problema do catálogo', () => {
    const loaded = loadSpecComponents(spec, SPEC, 1, (p) =>
      p === 'icons/set.json' ? undefined : readText(p),
    );
    expect(loaded.problems).toEqual(['icons: arquivo ausente (icons/set.json)']);
  });

  it('loadLibrary (laboratório) lê icons e leva o conjunto aos componentes', () => {
    const files = PATHS.map((path) => ({ path, text: read(path) }));
    const library = withHostTokens(loadLibrary(files), {});
    expect(library.problems).toEqual([]);
    expect(library.icons?.viewBox).toEqual([24, 24]);
    expect(library.types[0]?.component?.resolvedIcons?.icons.close).toBeDefined();
  });

  it('o pacote que declara icons é um pacote de arquivos', () => {
    expect(usesPackageFiles(spec)).toBe(true);
    expect(usesPackageFiles({ ...spec, icons: undefined, layers: [] })).toBe(false);
  });
});
