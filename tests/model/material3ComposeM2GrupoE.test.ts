// M2, grupo E (card e image): os valores do Compose material3 1.4.0 (commit 5113b82a) no desenho,
// em light e dark. Card: FilledCardTokens, ElevatedCardTokens, OutlinedCardTokens e Card.kt.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { walk } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files, findText, solid } from '../support/material3Library';

const catalog = buildCatalog(files);
const MODES = ['light', 'dark'] as const;

// Cores dos tokens do androidx (ColorLightTokens / ColorDarkTokens), por modo.
const CARD = {
  filled: { fill: { light: '#E6E0E9', dark: '#36343B' }, stroke: null, shadow: false },
  elevated: { fill: { light: '#F7F2FA', dark: '#1D1B20' }, stroke: null, shadow: true },
  outlined: {
    fill: { light: '#FEF7FF', dark: '#141218' },
    stroke: { light: '#CAC4D0', dark: '#49454F' },
    shadow: false,
  },
} as const;
const ON_SURFACE = { light: '#1D1B20', dark: '#E6E0E9' };
const ON_SURFACE_VARIANT = { light: '#49454F', dark: '#CAC4D0' };

const named = (root: SceneNode, name: string): SceneNode | undefined =>
  [...walk(root)].find((n) => n.name === name);

describe('card (Card.kt, FilledCardTokens, ElevatedCardTokens, OutlinedCardTokens)', () => {
  it('raio, cor, contorno, elevação e texto de cada estilo em light e dark', () => {
    const entry = findEntry(catalog, 'card')!;
    for (const style of Object.keys(CARD) as (keyof typeof CARD)[]) {
      for (const mode of MODES) {
        const spec = CARD[style];
        const where = `${style} ${mode}`;
        const root = drawIn(
          catalog,
          entry,
          { title: 'T', subtitle: 'S', supportingText: 'A', style },
          mode,
        ).root;
        if (root.type !== 'frame') throw new Error('raiz não é quadro');
        // ShapeKeyTokens.CornerMedium = 12
        expect(root.cornerRadius, where).toBe(12);
        expect(solid(root.fills), where).toBe(spec.fill[mode]);
        // OutlinedCardTokens.OutlineColor = OutlineVariant, OutlineWidth = 1.dp; os outros não têm contorno
        const strokeColor =
          root.stroke === undefined || root.stroke.width === 0
            ? null
            : (solid(root.stroke.paints) ?? null);
        const visible = strokeColor !== null && !/^rgba\(0, 0, 0, 0\)$/.test(strokeColor);
        if (spec.stroke === null) {
          expect(visible, where).toBe(false);
        } else {
          expect(strokeColor, where).toBe(spec.stroke[mode]);
          expect(root.stroke?.width, where).toBe(1);
        }
        // ElevatedCardTokens.ContainerElevation = Level1 (blur 2, y 1); filled e outlined = Level0 (sem sombra)
        if (spec.shadow) {
          expect(root.effects, where).toHaveLength(1);
          expect(root.effects[0]).toMatchObject({ blur: 2, offset: { x: 0, y: 1 } });
          expect(root.effects[0]?.color).toBe('rgba(0, 0, 0, 0.3)');
        } else {
          expect(root.effects, where).toEqual([]);
        }
        // contentColorFor(container) = OnSurface; o apoio usa OnSurfaceVariant
        const title = named(root, 'título');
        const support = named(root, 'apoio');
        expect(solid(title?.fills ?? []), where).toBe(ON_SURFACE[mode]);
        expect(solid(support?.fills ?? []), where).toBe(ON_SURFACE_VARIANT[mode]);
      }
    }
  });
});

describe('image (Foundation Image, sem token do Material)', () => {
  it('a legenda e o fundo do reservado usam os papéis do tema em light e dark', () => {
    const entry = findEntry(catalog, 'image')!;
    const SURFACE_VARIANT = { light: '#E7E0EC', dark: '#49454F' };
    for (const mode of MODES) {
      const empty = drawIn(catalog, entry, { url: '' }, mode);
      expect(solid(findText(empty.root)?.fills ?? []), mode).toBe(
        ON_SURFACE_VARIANT[mode],
      );
      const withUrl = drawIn(catalog, entry, { url: 'https://example.com/a.jpg' }, mode);
      const images = [...walk(withUrl.root)].filter(
        (n) => n.visible && n.fills.some((p) => p.type === 'image'),
      );
      expect(images.length, mode).toBeGreaterThan(0);
      for (const node of images) {
        const hasBackdrop = node.fills.some((p) => p.type === 'solid');
        expect(hasBackdrop, mode).toBe(true);
        expect(solid(node.fills), mode).toBe(SURFACE_VARIANT[mode]);
      }
    }
  });
});
