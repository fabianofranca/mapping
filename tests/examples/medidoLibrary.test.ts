// Biblioteca de exemplo `medido` (CF11): a origem `measured`, em que uma árvore de retângulos
// medidos (a página de um app web) vira marcações pelas `sources` dos tipos.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importMeasured } from '../../src/model/components/measured';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';

const ROOT = join(__dirname, '../../examples/libraries/medido');
const SPEC_FILE = 'medido.spec.json';
// A árvore medida fica ao lado da pasta: a origem `measured` não declara `examples`, e um arquivo
// solto dentro da biblioteca viraria aviso de "não referenciado".
const TREE = join(__dirname, '../../examples/pagina.medida.json');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

describe('biblioteca de exemplo medido', () => {
  it('tem a especialização, um componente e um documento por tipo', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/button.json',
        'components/card.json',
        'docs/button.md',
        'docs/card.md',
      ].sort(),
    );
  });

  it('valida sem erro nos três níveis e sem aviso', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 2, docs: 2 });
  });

  it('declara a origem measured na formatVersion 15', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.id).toBe('medido');
    expect(parsed.spec.origins).toMatchObject([
      { system: 'dom', name: 'Página medida', kind: 'measured' },
    ]);
  });
});

describe('importação da árvore medida de exemplo', () => {
  const parsed = parseSpecText(text(SPEC_FILE));
  const result = parsed.ok
    ? importMeasured([parsed.spec], {
        system: 'dom',
        tree: JSON.parse(readFileSync(TREE, 'utf8')),
      })
    : undefined;

  it('cria o cartão e os três botões', () => {
    expect(result?.error).toBeUndefined();
    expect(result?.markings.map((m) => m.typeId)).toEqual([
      'card',
      'button',
      'button',
      'button',
    ]);
  });

  it('preenche os campos pelas props, com values para o enum', () => {
    const buttons = result?.markings.filter((m) => m.typeId === 'button') ?? [];
    expect(buttons[0]?.values).toEqual({ label: 'Salvar', tone: 'error' });
    expect(buttons[1]?.values).toEqual({ label: 'Cancelar', tone: 'neutral' });
  });

  it('ignora com aviso os nós sem tipo e segue com os filhos', () => {
    const warnings = result?.warnings ?? [];
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes('x-pagina'))).toBe(true);
    expect(warnings.some((w) => w.includes('x-misterioso'))).toBe(true);
    expect(result?.markings.some((m) => m.values.label === 'Ajuda')).toBe(true);
  });
});
