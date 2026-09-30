import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  annotationsByMarking,
  buildListing,
  layerSections,
  removeMarking,
} from '../../src/model';
import { sampleProject } from './fixtures';

describe('visão de lista', () => {
  const p = sampleProject();
  const both = p.layers;

  it('agrupa Imagem → Marcação → Camada, com o caminho completo', () => {
    const listing = buildListing(p, both, { showEmpty: false });
    expect(listing.map((i) => i.image.id)).toEqual(['I1', 'I2']);
    const [i1] = listing;
    // M3 não tem anotação: fica de fora. M2 tem, e o caminho passa pelo pai.
    expect(i1?.markings.map((m) => m.marking.id)).toEqual(['M1', 'M2']);
    expect(i1?.markings[1]?.path.map((m) => m.id)).toEqual(['M1', 'M2']);
    const m1 = i1?.markings[0];
    expect(m1?.sections.map((s) => [s.layer.id, s.annotations.map((a) => a.id)])).toEqual(
      [
        ['L1', ['A1']],
        ['L2', ['A2']],
      ],
    );
  });

  it('respeita as camadas visíveis', () => {
    const onlyL2 = both.filter((l) => l.id === 'L2');
    const listing = buildListing(p, onlyL2, { showEmpty: false });
    expect(listing.flatMap((i) => i.markings.map((m) => m.marking.id))).toEqual([
      'M1',
      'M4',
    ]);
    expect(listing[0]?.markings[0]?.sections.map((s) => s.layer.id)).toEqual(['L2']);
  });

  it('sem camadas visíveis a lista fica vazia (a menos que mostre as vazias)', () => {
    expect(buildListing(p, [], { showEmpty: false })).toEqual([]);
    const all = buildListing(p, [], { showEmpty: true });
    expect(all.flatMap((i) => i.markings)).toHaveLength(4);
  });

  it('"mostrar marcações sem anotação" inclui as vazias, em profundidade', () => {
    const listing = buildListing(p, both, { showEmpty: true });
    expect(listing[0]?.markings.map((m) => m.marking.id)).toEqual(['M1', 'M2', 'M3']);
    expect(listing[0]?.markings[2]?.sections).toEqual([]);
  });

  it('imagem sem marcações só aparece com "mostrar vazias"', () => {
    const q = removeMarking(p, 'M4');
    expect(buildListing(q, both, { showEmpty: false }).map((i) => i.image.id)).toEqual([
      'I1',
    ]);
    expect(buildListing(q, both, { showEmpty: true }).map((i) => i.image.id)).toEqual([
      'I1',
      'I2',
    ]);
  });

  it('marcação com anotação aparece mesmo quando o pai não tem', () => {
    const q = addAnnotation(p, { id: 'A9', markingId: 'M3', layerId: 'L1' });
    const inOnlyL1 = buildListing(
      q,
      both.filter((l) => l.id === 'L1'),
      { showEmpty: false },
    );
    expect(inOnlyL1[0]?.markings.map((m) => m.marking.id)).toEqual(['M1', 'M2', 'M3']);
    const m3 = inOnlyL1[0]?.markings[2];
    expect(m3?.path.map((m) => m.id)).toEqual(['M1', 'M2', 'M3']);
  });

  it('layerSections segue a ordem das camadas dadas', () => {
    const index = annotationsByMarking(p);
    const reversed = [...both].reverse();
    expect(layerSections(index, 'M1', reversed).map((s) => s.layer.id)).toEqual([
      'L2',
      'L1',
    ]);
    expect(layerSections(index, 'M3', both)).toEqual([]);
  });
});
