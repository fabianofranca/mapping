import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_MIN_HEIGHT,
  SEMANTIC_MIN_WIDTH,
  bodyLines,
  semanticMode,
} from '../../src/canvas/semanticText';
import { annotationsByMarking, layerSections } from '../../src/model';
import { sampleProject } from '../model/fixtures';

const big = { screenWidth: SEMANTIC_MIN_WIDTH, screenHeight: SEMANTIC_MIN_HEIGHT };

describe('zoom semântico', () => {
  it('folha mostra tudo; marcação com filhas, só o cabeçalho', () => {
    expect(semanticMode({ enabled: true, ...big, hasChildren: false })).toBe('full');
    expect(semanticMode({ enabled: true, ...big, hasChildren: true })).toBe('header');
  });

  it('só aparece com o tamanho mínimo na tela, avaliado por marcação', () => {
    const small = (screenWidth: number, screenHeight: number) =>
      semanticMode({ enabled: true, screenWidth, screenHeight, hasChildren: false });
    expect(small(SEMANTIC_MIN_WIDTH - 1, 500)).toBe('none');
    expect(small(500, SEMANTIC_MIN_HEIGHT - 1)).toBe('none');
    expect(small(SEMANTIC_MIN_WIDTH, SEMANTIC_MIN_HEIGHT)).toBe('full');
  });

  it('desligado nas configurações, nunca mostra texto', () => {
    expect(semanticMode({ enabled: false, ...big, hasChildren: false })).toBe('none');
  });

  it('linhas: nome (negrito) e pares chave: valor, na cor de cada camada', () => {
    const p = sampleProject();
    const sections = layerSections(annotationsByMarking(p), 'M1', p.layers);
    expect(bodyLines(sections)).toEqual([
      { text: 'Amassado', color: '#E53935', bold: true },
      { text: 'tipo: amassado', color: '#E53935', bold: false },
      { text: 'gravidade: média', color: '#E53935', bold: false },
      { text: 'tipo: trinca', color: '#1E88E5', bold: false },
    ]);
    expect(bodyLines([])).toEqual([]);
  });
});
