// Modo do desenho (etapa "componentes fiéis", CF6): o do projeto, o que o container fixa e o
// efetivo. Funções puras do modelo.
import { describe, expect, it } from 'vitest';
import {
  drawingModesOf,
  effectiveDrawingMode,
  setContainerDrawingMode,
  setProjectDrawingMode,
  undeclaredDrawingMode,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

function projectWithContainer(): { p: Project; containerId: string } {
  const p = sampleProject();
  const containerId = p.containers[0]!.id;
  return { p, containerId };
}

describe('modo do desenho', () => {
  it('setProjectDrawingMode fixa, troca e remove (null)', () => {
    const { p } = projectWithContainer();
    const dark = setProjectDrawingMode(p, 'dark');
    expect(dark.drawingMode).toBe('dark');
    expect(setProjectDrawingMode(dark, 'light').drawingMode).toBe('light');
    const cleared = setProjectDrawingMode(dark, null);
    expect(cleared.drawingMode).toBeUndefined();
    expect('drawingMode' in cleared).toBe(false);
    // Igual ao que já estava: devolve o mesmo projeto.
    expect(setProjectDrawingMode(dark, 'dark')).toBe(dark);
    expect(setProjectDrawingMode(p, null)).toBe(p);
  });

  it('recusa modo vazio ou fora do padrão', () => {
    const { p } = projectWithContainer();
    expect(() => setProjectDrawingMode(p, '')).toThrow();
    expect(() => setProjectDrawingMode(p, 'Dark Mode')).toThrow();
  });

  it('setContainerDrawingMode fixa e volta a seguir o projeto com null', () => {
    const { p, containerId } = projectWithContainer();
    const fixed = setContainerDrawingMode(p, containerId, 'light');
    expect(fixed.containers[0]!.drawingMode).toBe('light');
    const follow = setContainerDrawingMode(fixed, containerId, null);
    expect(follow.containers[0]!.drawingMode ?? null).toBeNull();
    expect(setContainerDrawingMode(p, containerId, null)).toBe(p);
    expect(() => setContainerDrawingMode(p, 'nao-existe', 'dark')).toThrow();
  });

  it('modo efetivo: o do container, senão o do projeto, senão undefined (primeiro modo)', () => {
    const { p, containerId } = projectWithContainer();
    expect(effectiveDrawingMode(p, containerId)).toBeUndefined();
    const dark = setProjectDrawingMode(p, 'dark');
    expect(effectiveDrawingMode(dark, containerId)).toBe('dark');
    const fixed = setContainerDrawingMode(dark, containerId, 'light');
    expect(effectiveDrawingMode(fixed, containerId)).toBe('light');
    // Marcação do canvas (sem container) segue o projeto.
    expect(effectiveDrawingMode(fixed, null)).toBe('dark');
  });

  it('drawingModesOf junta os modos das especializações, sem repetir', () => {
    expect(
      drawingModesOf([
        { modes: ['light', 'dark'] },
        { modes: ['dark', 'solar'] },
        undefined,
      ]),
    ).toEqual(['light', 'dark', 'solar']);
    expect(drawingModesOf([])).toEqual([]);
  });

  it('undeclaredDrawingMode: modo gravado que nenhuma especialização declara', () => {
    const { p, containerId } = projectWithContainer();
    const declared = ['light', 'dark'];
    expect(undeclaredDrawingMode(setProjectDrawingMode(p, 'dark'), declared)).toEqual([]);
    expect(undeclaredDrawingMode(setProjectDrawingMode(p, 'solar'), declared)).toEqual([
      'solar',
    ]);
    const both = setContainerDrawingMode(
      setProjectDrawingMode(p, 'solar'),
      containerId,
      'neon',
    );
    expect(undeclaredDrawingMode(both, declared)).toEqual(['solar', 'neon']);
  });
});
