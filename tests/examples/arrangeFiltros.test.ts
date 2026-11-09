import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  arrangeMarking,
  deserialize,
  loadSpecComponents,
  parseSpecText,
  type ComponentCatalog,
} from '../../src/model';
import { readProjectZip } from '../../src/storage/zip';
import { EXAMPLE_ZIP } from '../../scripts/exampleProject.mjs';

// O Arrumar do Row "Filtros" do exemplo (chips do Material 3): cada chip mantém a largura do
// rótulo. O chip é uma raiz `none` `hug` cujo único conteúdo é um quadro esticado por âncoras
// (sem largura própria, logo `fill`); medido sem limite ele valia 0 e o Arrumar gravava largura 1.
// O defeito não dependia do medidor de texto (falha também com o aproximado).
describe('exemplo-completo: Arrumar no Row "Filtros"', () => {
  it('os chips mantêm a largura natural do rótulo, não 1', async () => {
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE_ZIP)]));
    if (!read.ok) throw new Error(`zip ilegível: ${read.error}`);
    const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
    if (!parsed.ok) throw new Error(`mapping.json inválido: ${parsed.error.code}`);
    const project = parsed.project;
    const owner = project.specializations.find((s) => s.id === 'material3-compose');
    if (owner === undefined) throw new Error('sem material3-compose');
    const spec = parseSpecText(read.files.specs.get(owner.file) ?? '');
    if (!spec.ok) throw new Error('especialização inválida');
    const catalog: ComponentCatalog = new Map([
      [
        owner.id,
        loadSpecComponents(spec.spec, owner.file, owner.version, (path) =>
          read.files.specs.get(path),
        ),
      ],
    ]);
    const row = project.markings.find((m) => m.name === 'Filtros');
    if (row === undefined) throw new Error('sem o Row Filtros');

    const arranged = arrangeMarking(project, catalog, row.id, approximateMeasurer);
    const chips = arranged.project.markings.filter((m) => m.parentId === row.id);

    expect(chips).toHaveLength(3);
    for (const chip of chips)
      expect(chip.rect.width, chip.name ?? chip.id).toBeGreaterThan(40);
    // Em fila, sem sobreposição (espaçamento 8).
    expect(chips[1]?.rect.x).toBe(
      (chips[0]?.rect.x ?? 0) + (chips[0]?.rect.width ?? 0) + 8,
    );
  });
});
