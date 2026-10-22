import { describe, expect, it } from 'vitest';
import {
  layerDotsByMarking,
  markingVisibility,
} from '../../src/model';
import { sampleProject } from './fixtures';

// Porta (M1) › Maçaneta (M2) › Fechadura (M3); A1 (M1/L1) e A3 (M2/L1) são próprias.
const p = sampleProject();
const [l1, l2] = p.layers;
const both = p.layers;

describe('bolinhas por camada', () => {
  it('só considera as camadas visíveis', () => {
    const dots = layerDotsByMarking(p, [l2 as NonNullable<typeof l2>]);
    expect(dots.has('M3')).toBe(false);
    expect(dots.get('M1')?.map((d) => d.layer.id)).toEqual(['L2']);
  });
});

describe('modos de exibição', () => {
  const dots = layerDotsByMarking(p, both);

  it('mostrar todas: tudo por inteiro', () => {
    const v = markingVisibility(p, dots, 'all', null);
    expect([...v.values()].every((x) => x === 'full')).toBe(true);
  });

  it('esmaecer: só esmaece quem não tem anotação própria', () => {
    const v = markingVisibility(p, dots, 'dim', null);
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

describe('marcações que desenham um componente', () => {
  it('alwaysShown fica por inteiro em ocultar e esmaecer, e o pai não vira borda', () => {
    const base = sampleProject();
    // Camada ativa sem nenhuma anotação: sem `alwaysShown`, tudo some.
    const none = new Map<string, readonly never[]>();
    expect(markingVisibility(base, none, 'hide', null).get('M3')).toBe('hidden');
    const always = new Set(['M2', 'M3']);
    const hide = markingVisibility(base, none, 'hide', null, always);
    expect(hide.get('M2')).toBe('full');
    expect(hide.get('M3')).toBe('full');
    // Quem não desenha segue a regra de hoje; o ancestral dele (M1) é só borda.
    expect(hide.get('M4')).toBe('hidden');
    expect(hide.get('M1')).toBe('outline');
    const dim = markingVisibility(base, none, 'dim', null, always);
    expect(dim.get('M3')).toBe('full');
    expect(dim.get('M4')).toBe('dim');
  });

  it('sem alwaysShown nada muda', () => {
    const base = sampleProject();
    const none = new Map<string, readonly never[]>();
    expect(markingVisibility(base, none, 'hide', null, new Set())).toEqual(
      markingVisibility(base, none, 'hide', null),
    );
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
