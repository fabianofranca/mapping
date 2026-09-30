import { describe, expect, it } from 'vitest';
import {
  buildListing,
  layerDotsByMarking,
  markingVisibility,
  setAnnotationInherit,
} from '../../src/model';
import { sampleProject } from './fixtures';

// Porta (M1) › Maçaneta (M2) › Fechadura (M3); A1 (M1/L1) herda; A3 (M2/L1) é própria.
const p = setAnnotationInherit(sampleProject(), 'A1', true);
const [l1, l2] = p.layers;
const both = p.layers;

describe('bolinhas por camada', () => {
  it('marca como vazada a camada que chega só por herança', () => {
    const dots = layerDotsByMarking(p, both);
    expect(dots.get('M1')?.map((d) => [d.layer.id, d.inheritedOnly])).toEqual([
      ['L1', false],
      ['L2', false],
    ]);
    // Maçaneta tem anotação própria em L1 (cheia); a herdada da mesma camada não a esvazia.
    expect(dots.get('M2')?.map((d) => [d.layer.id, d.inheritedOnly])).toEqual([
      ['L1', false],
    ]);
    // Fechadura herda de Porta em qualquer profundidade.
    expect(dots.get('M3')?.map((d) => [d.layer.id, d.inheritedOnly])).toEqual([
      ['L1', true],
    ]);
  });

  it('só considera as camadas visíveis', () => {
    const dots = layerDotsByMarking(p, [l2 as NonNullable<typeof l2>]);
    expect(dots.has('M3')).toBe(false);
    expect(dots.get('M1')?.map((d) => d.layer.id)).toEqual(['L2']);
  });

  it('sem herança, a Fechadura não tem indicadores', () => {
    expect(layerDotsByMarking(sampleProject(), both).has('M3')).toBe(false);
  });
});

describe('modos de exibição', () => {
  const dots = layerDotsByMarking(p, both);

  it('mostrar todas: tudo por inteiro', () => {
    const v = markingVisibility(p, dots, 'all', null);
    expect([...v.values()].every((x) => x === 'full')).toBe(true);
  });

  it('esmaecer: só esmaece quem não tem anotação própria nem herdada', () => {
    const v = markingVisibility(p, dots, 'dim', null);
    expect(v.get('M3')).toBe('full'); // herdada
    expect(v.get('M4')).toBe('full'); // própria em L2
    const v1 = markingVisibility(
      sampleProject(),
      layerDotsByMarking(sampleProject(), both),
      'dim',
      null,
    );
    expect(v1.get('M3')).toBe('dim');
  });

  it('ocultar: quem não tem anotação some, e o ancestral de quem aparece fica só com a borda', () => {
    // Só L1: M1 e M2 têm; M3 (filha de M2) e M4 não têm e não são pai de ninguém.
    const base = sampleProject();
    const only = [l1 as NonNullable<typeof l1>];
    const v = markingVisibility(base, layerDotsByMarking(base, only), 'hide', null);
    expect(v.get('M1')).toBe('full');
    expect(v.get('M2')).toBe('full');
    expect(v.get('M3')).toBe('hidden');
    expect(v.get('M4')).toBe('hidden');
  });

  it('ocultar: o pai sem anotação vira borda; a selecionada sempre aparece', () => {
    // Só L2: M1 e M4 têm; M2 (só L1) contém a selecionada M3, então fica como borda.
    const base = sampleProject();
    const only = [l2 as NonNullable<typeof l2>];
    const v = markingVisibility(base, layerDotsByMarking(base, only), 'hide', 'M3');
    expect(v.get('M3')).toBe('full');
    expect(v.get('M2')).toBe('outline');
    expect(v.get('M1')).toBe('full');
    expect(v.get('M4')).toBe('full');
  });

  it('ocultar: o pai sem anotação vira borda quando só um filho tem anotação', () => {
    // Ativa = L2 com A2 só em M1: nenhum pai sem anotação. Sem A2, a cadeia M1 › M2 é borda.
    const base = sampleProject();
    const v = markingVisibility(base, new Map([['M2', []]]), 'hide', null);
    expect(v.get('M2')).toBe('full');
    expect(v.get('M1')).toBe('outline');
    expect(v.get('M3')).toBe('hidden');
    expect(v.get('M4')).toBe('hidden');
  });
});

describe('modos de exibição pela camada ativa', () => {
  it('só a camada ativa decide: anotação em outra camada visível não mantém a marcação', () => {
    const base = sampleProject();
    // Ativa = L2 (Vidros): M1 (A2) e M4 (A4) têm; M2 só tem L1 e some.
    const active = layerDotsByMarking(base, [l2 as NonNullable<typeof l2>]);
    const v = markingVisibility(base, active, 'hide', null);
    expect(v.get('M1')).toBe('full');
    expect(v.get('M4')).toBe('full');
    expect(v.get('M2')).toBe('hidden');
    expect(markingVisibility(base, active, 'dim', null).get('M2')).toBe('dim');
  });
});

describe('lista com herdadas', () => {
  it('mostra as herdadas sob a marcação, com a origem', () => {
    const listing = buildListing(p, both, { showEmpty: false });
    const m3 = listing[0]?.markings.find((m) => m.marking.id === 'M3');
    expect(m3).toBeDefined();
    expect(m3?.sections).toEqual([]);
    expect(
      m3?.inherited.map((s) => [s.layer.id, s.items.map((i) => i.source.id)]),
    ).toEqual([['L1', ['M1']]]);
  });

  it('herdada de um ancestral de qualquer profundidade só aparece nas camadas visíveis', () => {
    const listing = buildListing(p, [l2 as NonNullable<typeof l2>], { showEmpty: false });
    expect(listing[0]?.markings.map((m) => m.marking.id)).toEqual(['M1']);
  });
});
