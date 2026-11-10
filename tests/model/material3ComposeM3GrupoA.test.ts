// M3 da etapa "Material 3 fiel", grupo A: checkbox, radio-button, switch e progress-indicator contra o que
// `Checkbox.kt`, `RadioButton.kt`, `Switch.kt`, `ProgressIndicator.kt` e os arquivos de tokens fixam no commit
// 5113b82a. As cores esperadas saem dos tokens da especialização (light e dark); a geometria, das constantes
// do Compose (dp = px do componente).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, findText, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entryOf = (id: string) => findEntry(catalog, id)!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const both = (id: string, values: Values) => ({
  light: drawIn(catalog, entryOf(id), values, 'light'),
  dark: drawIn(catalog, entryOf(id), values, 'dark'),
});

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Valor do token da especialização no modo (cor ou número). */
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`nó ausente: ${name}`);
  return { node, ...absoluteBoxes(d.root).get(node.id)! };
};
const fillOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.fills ?? []);
const strokeOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.stroke?.paints ?? []);
const iconOf = (d: Drawing, name: string) => {
  const node = named(d, name);
  const path = node && [...walk(node)].find((n): n is PathNode => n.type === 'path');
  return { node, color: path === undefined ? undefined : solid(path.fills) };
};
const label = (d: Drawing): TextNode => findText(d.root)!;

describe('M3 grupo A — checkbox', () => {
  it('caixa de 20 com raio 2 (CheckboxSize e RadiusSize), centrada na área de 48 do toque mínimo', () => {
    const c = both('checkbox', { label: 'Aceito', state: 'checked' }).light;
    const caixa = box(c, 'caixa');
    expect([caixa.width, caixa.height]).toEqual([20, 20]);
    expect('cornerRadius' in caixa.node && caixa.node.cornerRadius).toBe(2);
    // Checkbox(onClick != null): minimumInteractiveComponentSize 48 com a caixa no centro
    const area = box(c, 'área');
    expect([area.width, area.x]).toEqual([48, 0]);
    expect(caixa.x - area.x).toBe(14);
    expect(box(c, 'rótulo').x).toBe(48);
  });

  it('marcada: caixa primary e check on-primary de 2 com ponta quadrada, em light e dark', () => {
    const c = both('checkbox', { state: 'checked' });
    for (const mode of ['light', 'dark'] as const) {
      const d = c[mode];
      expect(fillOf(d, 'caixa')).toBe(tok('primary', mode));
      expect(named(d, 'caixa')?.stroke).toBeUndefined();
      const check = named(d, 'check') as PathNode;
      // drawCheck: (0.2, 0.5) -> (0.4, 0.7) -> (0.8, 0.3) da caixa de 20
      expect(
        check.d
          .replace(/[A-Za-z]/g, ' ')
          .trim()
          .split(/\s+/)
          .map(Number),
      ).toEqual([4, 10, 8, 14, 16, 6]);
      expect(check.fills).toEqual([]);
      expect(solid(check.stroke?.paints ?? [])).toBe(tok('on-primary', mode));
      expect(check.stroke).toMatchObject({ width: 2, cap: 'square', align: 'center' });
      expect(named(d, 'traço')).toBeUndefined();
    }
  });

  it('desmarcada: sem fundo e contorno de 2 por dentro em on-surface-variant; sem check', () => {
    const c = both('checkbox', { state: 'unchecked' });
    for (const mode of ['light', 'dark'] as const) {
      const caixa = named(c[mode], 'caixa')!;
      expect(caixa.fills).toEqual([]);
      expect(strokeOf(c[mode], 'caixa')).toBe(tok('on-surface-variant', mode));
      expect(caixa.stroke).toMatchObject({ width: 2, align: 'inside' });
      expect(named(c[mode], 'check')).toBeUndefined();
      expect(named(c[mode], 'traço')).toBeUndefined();
    }
  });

  it('indeterminada: caixa primary e traço horizontal de 12 (cruz no centro) com ponta quadrada', () => {
    const c = both('checkbox', { state: 'indeterminate' });
    for (const mode of ['light', 'dark'] as const) {
      expect(fillOf(c[mode], 'caixa')).toBe(tok('primary', mode));
      const dash = named(c[mode], 'traço') as PathNode;
      expect(
        dash.d
          .replace(/[A-Za-z]/g, ' ')
          .trim()
          .split(/\s+/)
          .map(Number),
      ).toEqual([4, 10, 16, 10]);
      expect(solid(dash.stroke?.paints ?? [])).toBe(tok('on-primary', mode));
      expect(dash.stroke).toMatchObject({ width: 2, cap: 'square' });
      expect(named(c[mode], 'check')).toBeUndefined();
    }
  });

  it('desabilitado: caixa on-surface a 0,38 (marcada, indeterminada e contorno); o check continua on-primary', () => {
    for (const state of ['checked', 'indeterminate'] as const) {
      const c = both('checkbox', { state, enabled: 'false' });
      for (const mode of ['light', 'dark'] as const) {
        expect(fillOf(c[mode], 'caixa')).toBe(tok('on-surface', mode));
        expect(named(c[mode], 'caixa')?.opacity).toBe(0.38);
        const mark = named(c[mode], state === 'checked' ? 'check' : 'traço')!;
        expect(solid(mark.stroke?.paints ?? [])).toBe(tok('on-primary', mode));
        expect(mark.opacity).toBe(1);
      }
    }
    const off = both('checkbox', { state: 'unchecked', enabled: 'false' });
    for (const mode of ['light', 'dark'] as const) {
      expect(named(off[mode], 'caixa')?.fills).toEqual([]);
      expect(strokeOf(off[mode], 'caixa')).toBe(tok('on-surface', mode));
      expect(named(off[mode], 'caixa')?.opacity).toBe(0.38);
    }
  });

  it('rótulo em body-large pelos tokens e on-surface; sem family', () => {
    const c = both('checkbox', { label: 'Lembrar de mim', state: 'checked' });
    const style = label(c.light).style;
    expect([
      style.fontSize,
      style.lineHeight,
      style.fontWeight,
      style.letterSpacing,
    ]).toEqual([16, 24, 400, 0.5]);
    expect(solid(label(c.light).fills)).toBe(tok('on-surface', 'light'));
    expect(solid(label(c.dark).fills)).toBe(tok('on-surface', 'dark'));
    const off = both('checkbox', { label: 'X', enabled: 'false' });
    expect(label(off.light).opacity).toBe(0.38);
  });
});

describe('M3 grupo A — radio-button', () => {
  it('anel de 20 com traço de 2 por dentro e ponto de 10 (raio 6 menos meio traço), centrados na área de 24 (padding 2)', () => {
    const r = both('radio-button', { label: 'Cartão', selected: 'true' });
    const area = box(r.light, 'área');
    // RadioButton(onClick = null) numa Row selecionável: padding 2 + 20 + 2, sem o toque mínimo de 48
    expect([area.width, area.x]).toEqual([24, 0]);
    const ring = box(r.light, 'anel');
    expect([ring.width, ring.height]).toEqual([20, 20]);
    expect(ring.x - area.x).toBe(2);
    expect(ring.node.stroke).toMatchObject({ width: 2, align: 'inside' });
    expect(ring.node.fills).toEqual([]);
    const dot = box(r.light, 'ponto');
    // drawCircle(radius = RadioButtonDotSize / 2 - strokeWidth / 2) = 5
    expect([dot.width, dot.height]).toEqual([10, 10]);
    expect(dot.x + dot.width / 2).toBe(ring.x + ring.width / 2);
    expect(dot.y + dot.height / 2).toBe(ring.y + ring.height / 2);
    expect(box(r.light, 'rótulo').x).toBe(24);
  });

  it('cores pelos tokens: selecionado primary, não selecionado on-surface-variant, em light e dark', () => {
    const on = both('radio-button', { selected: 'true' });
    const off = both('radio-button', { selected: 'false' });
    for (const mode of ['light', 'dark'] as const) {
      expect(strokeOf(on[mode], 'anel')).toBe(tok('primary', mode));
      expect(fillOf(on[mode], 'ponto')).toBe(tok('primary', mode));
      expect(strokeOf(off[mode], 'anel')).toBe(tok('on-surface-variant', mode));
      expect(named(off[mode], 'ponto')).toBeUndefined();
    }
  });

  it('desabilitado: anel e ponto em on-surface a 0,38, selecionado ou não', () => {
    for (const selected of ['true', 'false']) {
      const d = both('radio-button', { selected, enabled: 'false' });
      for (const mode of ['light', 'dark'] as const) {
        expect(strokeOf(d[mode], 'anel')).toBe(tok('on-surface', mode));
        expect(named(d[mode], 'anel')?.opacity).toBe(0.38);
        if (selected === 'true') {
          expect(fillOf(d[mode], 'ponto')).toBe(tok('on-surface', mode));
          expect(named(d[mode], 'ponto')?.opacity).toBe(0.38);
        }
      }
    }
  });
});

describe('M3 grupo A — switch', () => {
  const geometry = (d: Drawing, name: string) => {
    const track = box(d, 'trilho');
    const part = box(d, name);
    return { x: part.x - track.x, y: part.y - track.y, w: part.width, h: part.height };
  };

  it('trilho 52 x 32 na forma full; alça de 24 ligada (a 4 da borda direita), 16 desligada (a 8 da esquerda), 24 com ícone (a 4)', () => {
    const on = both('switch', { checked: 'true' }).light;
    const track = box(on, 'trilho');
    expect([track.width, track.height]).toEqual([52, 32]);
    expect(
      track.node.type === 'rect' || track.node.type === 'frame'
        ? track.node.cornerRadius
        : 0,
    ).toBeGreaterThanOrEqual(16);
    // thumbPathLength = (SwitchWidth - ThumbDiameter) - ThumbPadding = 24
    expect(geometry(on, 'alça')).toEqual({ x: 24, y: 4, w: 24, h: 24 });
    // minBound = (SwitchHeight - size) / 2
    const off = both('switch', { checked: 'false' }).light;
    expect(geometry(off, 'alça')).toEqual({ x: 8, y: 8, w: 16, h: 16 });
    const icon = both('switch', { checked: 'false', thumbIcon: 'true' }).light;
    expect(geometry(icon, 'alça')).toEqual({ x: 4, y: 4, w: 24, h: 24 });
    // a alça é uma elipse (HandleShape = CornerFull)
    expect(named(on, 'alça')?.type).toBe('ellipse');
  });

  it('ligado: trilho primary sem contorno e alça on-primary; desligado: trilho surface-container-highest com contorno de 2 em outline e alça outline', () => {
    const on = both('switch', { checked: 'true' });
    const off = both('switch', { checked: 'false' });
    for (const mode of ['light', 'dark'] as const) {
      expect(fillOf(on[mode], 'trilho')).toBe(tok('primary', mode));
      expect(named(on[mode], 'contorno')).toBeUndefined();
      expect(fillOf(on[mode], 'alça')).toBe(tok('on-primary', mode));
      expect(fillOf(off[mode], 'trilho')).toBe(tok('surface-container-highest', mode));
      expect(strokeOf(off[mode], 'contorno')).toBe(tok('outline', mode));
      expect(named(off[mode], 'contorno')?.stroke).toMatchObject({
        width: 2,
        align: 'inside',
      });
      expect(fillOf(off[mode], 'alça')).toBe(tok('outline', mode));
    }
  });

  it('ícone da alça: 16, check on-primary-container ligado e close surface-container-highest desligado', () => {
    const on = both('switch', { checked: 'true', thumbIcon: 'true' });
    const off = both('switch', { checked: 'false', thumbIcon: 'true' });
    for (const mode of ['light', 'dark'] as const) {
      expect(iconOf(on[mode], 'check').color).toBe(tok('on-primary-container', mode));
      expect(iconOf(on[mode], 'check').node?.width).toBe(16);
      expect(iconOf(off[mode], 'close').color).toBe(
        tok('surface-container-highest', mode),
      );
      expect(iconOf(off[mode], 'close').node?.height).toBe(16);
    }
    // o ícone fica centrado na alça
    const thumb = box(on.light, 'alça');
    const icon = box(on.light, 'check');
    expect(icon.x + icon.width / 2).toBe(thumb.x + thumb.width / 2);
    expect(icon.y + icon.height / 2).toBe(thumb.y + thumb.height / 2);
    expect(
      iconOf(both('switch', { checked: 'true' }).light, 'check').node,
    ).toBeUndefined();
  });

  it('desabilitado: cores compostas sobre surface (compositeOver) com 0,12 no trilho e no contorno e 0,38 na alça desligada e nos ícones', () => {
    const on = both('switch', { checked: 'true', thumbIcon: 'true', enabled: 'false' });
    const off = both('switch', { checked: 'false', thumbIcon: 'true', enabled: 'false' });
    for (const mode of ['light', 'dark'] as const) {
      // ligado: trilho on-surface a 0,12 sobre surface; alça surface (opacidade 1); ícone on-surface a 0,38
      expect(fillOf(on[mode], 'trilho')).toBe(tok('surface', mode));
      expect(fillOf(on[mode], 'trilho desabilitado')).toBe(tok('on-surface', mode));
      expect(named(on[mode], 'trilho desabilitado')?.opacity).toBe(0.12);
      expect(named(on[mode], 'contorno')).toBeUndefined();
      expect(fillOf(on[mode], 'alça')).toBe(tok('surface', mode));
      expect(named(on[mode], 'alça desabilitada')).toBeUndefined();
      expect(iconOf(on[mode], 'check').color).toBe(tok('on-surface', mode));
      expect(iconOf(on[mode], 'check').node?.opacity).toBe(0.38);
      // desligado: trilho surface-container-highest a 0,12; contorno on-surface a 0,12; alça on-surface a 0,38
      expect(fillOf(off[mode], 'trilho')).toBe(tok('surface', mode));
      expect(fillOf(off[mode], 'trilho desabilitado')).toBe(
        tok('surface-container-highest', mode),
      );
      expect(named(off[mode], 'trilho desabilitado')?.opacity).toBe(0.12);
      expect(strokeOf(off[mode], 'contorno')).toBe(tok('surface', mode));
      expect(strokeOf(off[mode], 'contorno desabilitado')).toBe(tok('on-surface', mode));
      expect(named(off[mode], 'contorno desabilitado')?.opacity).toBe(0.12);
      expect(fillOf(off[mode], 'alça')).toBe(tok('surface', mode));
      expect(fillOf(off[mode], 'alça desabilitada')).toBe(tok('on-surface', mode));
      expect(named(off[mode], 'alça desabilitada')?.opacity).toBe(0.38);
      // ícone desligado: base surface opaca + surface-container-highest a 0,38 por cima
      const closes = [...walk(off[mode].root)].filter((n) => n.name === 'close');
      expect(closes).toHaveLength(2);
      expect(closes.map((n) => n.opacity)).toEqual([1, 0.38]);
      expect(
        closes.map((n) => solid([...walk(n)].find((x) => x.type === 'path')!.fills)),
      ).toEqual([tok('surface', mode), tok('surface-container-highest', mode)]);
    }
  });

  it('rótulo em body-large pelos tokens, antes da chave', () => {
    const d = both('switch', { label: 'Modo avião', checked: 'true' }).light;
    expect([label(d).style.fontSize, label(d).style.letterSpacing]).toEqual([16, 0.5]);
    expect(solid(label(d).fills)).toBe(tok('on-surface', 'light'));
    expect(box(d, 'rótulo').x).toBeLessThan(box(d, 'trilho').x);
    expect(box(d, 'trilho').x + 52).toBe(200);
  });
});

describe('M3 grupo A — progress-indicator', () => {
  // CircularIndicatorDiameter 40, traço 4 (TrackThickness), gap 4 + traço 4 (ponta redonda), começa às 12h
  const D = 40;
  const R = (D - 4) / 2;
  const GAP_SWEEP = (8 / (Math.PI * D)) * 360;
  const at = (deg: number) => [
    D / 2 + R * Math.cos((deg * Math.PI) / 180),
    D / 2 + R * Math.sin((deg * Math.PI) / 180),
  ];
  /** Lê `M x y A rx ry 0 large sweep x y` (um arco) do `d`. */
  const parseArc = (d: string) => {
    const n = d
      .replace(/[A-Za-z]/g, ' ')
      .trim()
      .split(/\s+/)
      .map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    return {
      start: [n[0], n[1]],
      radius: [n[2], n[3]],
      large: n[5],
      sweep: n[6],
      end: [n[7], n[8]],
    };
  };
  const expectPoint = (got: number[], want: number[]) => {
    expect(got[0]).toBeCloseTo(want[0]!, 1);
    expect(got[1]).toBeCloseTo(want[1]!, 1);
  };

  it('circular determinado: 40 x 40, traço de 4 com ponta redonda, indicador primary a partir das 12h e trilho secondary-container', () => {
    const p = both('progress-indicator', { shape: 'circular', progress: 0.6 });
    for (const mode of ['light', 'dark'] as const) {
      const d = p[mode];
      const circular = box(d, 'circular');
      expect([circular.width, circular.height]).toEqual([40, 40]);
      const indicator = named(d, 'indicador') as PathNode;
      const track = named(d, 'trilho arco') as PathNode;
      expect(solid(indicator.stroke?.paints ?? [])).toBe(tok('primary', mode));
      expect(solid(track.stroke?.paints ?? [])).toBe(tok('secondary-container', mode));
      for (const arc of [indicator, track]) {
        expect(arc.stroke).toMatchObject({ width: 4, cap: 'round', align: 'center' });
        expect(arc.fills).toEqual([]);
      }
      // desenhado ao centro do traço: raio (40 - 4) / 2
      expect(parseArc(indicator.d).radius).toEqual([R, R]);
    }
  });

  it.each([0.01, 0.1, 0.25, 0.5, 0.6, 0.75, 0.9, 0.99])(
    'circular a %s: o arco do indicador vai de 270 a 270 + 360 x progresso e o do trilho começa depois do gap',
    (progress) => {
      const d = drawIn(
        catalog,
        entryOf('progress-indicator'),
        { shape: 'circular', progress },
        'light',
      );
      const sweep = progress * 360;
      const gap = Math.min(sweep, GAP_SWEEP);
      const ind = parseArc((named(d, 'indicador') as PathNode).d);
      expectPoint(ind.start, at(270));
      expectPoint(ind.end, at(270 + sweep));
      expect(ind.large).toBe(sweep > 180 ? 1 : 0);
      expect(ind.sweep).toBe(1);
      // trilho: começa em 270 + sweep + gap e cobre 360 - sweep - 2 gap
      const trackSweep = 360 - sweep - gap * 2;
      // EX6: o trilho é o arco desenhado a partir das 12h e girado (`rotation`) em volta do centro
      const trackNode = named(d, 'trilho arco') as PathNode;
      const trk = parseArc(trackNode.d);
      const turn = ((trackNode.rotation ?? 0) * Math.PI) / 180;
      const rotated = (pt: number[]) => [
        D / 2 + (pt[0]! - D / 2) * Math.cos(turn) - (pt[1]! - D / 2) * Math.sin(turn),
        D / 2 + (pt[0]! - D / 2) * Math.sin(turn) + (pt[1]! - D / 2) * Math.cos(turn),
      ];
      expectPoint(rotated(trk.start), at(270 + sweep + gap));
      expectPoint(rotated(trk.end), at(270 + sweep + gap + trackSweep));
      expect(trk.large).toBe(Math.abs(trackSweep) > 180 ? 1 : 0);
      expect(trk.sweep).toBe(trackSweep >= 0 ? 1 : 0);
    },
  );

  it('circular em 0 e em 1: só o trilho inteiro, ou só o anel do indicador', () => {
    const zero = both('progress-indicator', { shape: 'circular', progress: 0 });
    const full = both('progress-indicator', { shape: 'circular', progress: 1 });
    for (const mode of ['light', 'dark'] as const) {
      const ring = named(zero[mode], 'trilho completo')!;
      expect(ring.type).toBe('ellipse');
      expect(strokeOf(zero[mode], 'trilho completo')).toBe(
        tok('secondary-container', mode),
      );
      expect(named(zero[mode], 'indicador')).toBeUndefined();
      expect(named(zero[mode], 'trilho arco')).toBeUndefined();
      expect(strokeOf(full[mode], 'anel completo')).toBe(tok('primary', mode));
      expect(named(full[mode], 'anel completo')?.stroke).toMatchObject({
        width: 4,
        align: 'inside',
      });
      expect(named(full[mode], 'indicador')).toBeUndefined();
    }
  });

  it('circular indeterminado: só o arco primary, sem trilho (circularIndeterminateTrackColor é transparente)', () => {
    const p = both('progress-indicator', { shape: 'circular' });
    for (const mode of ['light', 'dark'] as const) {
      const arc = named(p[mode], 'indicador indeterminado') as PathNode;
      expect(solid(arc.stroke?.paints ?? [])).toBe(tok('primary', mode));
      expect(arc.stroke).toMatchObject({ width: 4, cap: 'round' });
      expect(named(p[mode], 'trilho arco')).toBeUndefined();
      expect(named(p[mode], 'trilho completo')).toBeUndefined();
      // a meio caminho da animação: (0,1 + 0,87) / 2 de volta
      const a = parseArc(arc.d);
      expectPoint(a.start, at(270));
      expectPoint(a.end, at(270 + ((0.1 + 0.87) / 2) * 360));
    }
  });

  const linear = (progress?: number, mode: Mode = 'light') =>
    drawIn(
      catalog,
      entryOf('progress-indicator'),
      progress === undefined ? { shape: 'linear' } : { shape: 'linear', progress },
      mode,
    );
  const W = 240;
  const edges = (d: Drawing, name: string) => {
    const b = box(d, name);
    return [b.x, b.x + b.width];
  };

  it('linear determinado: altura 4, ponta redonda (+2), gap de 4 até o trilho e parada de 4 no fim', () => {
    for (const mode of ['light', 'dark'] as const) {
      const d = linear(0.3, mode);
      const bar = box(d, 'barra');
      expect(bar.height).toBe(4);
      // drawLinearIndicator: a ponta redonda passa meio traço do fim da barra
      expect(edges(d, 'barra')).toEqual([0, 0.3 * W + 2]);
      expect(bar.node.type === 'rect' && bar.node.cornerRadius).toBeGreaterThanOrEqual(2);
      // gap = LinearIndicatorTrackGapSize 4 entre as pontas redondas
      const gap = edges(d, 'faixa')[0]! - edges(d, 'barra')[1]!;
      expect(gap).toBe(4);
      expect(edges(d, 'faixa')[1]).toBe(W);
      expect(fillOf(d, 'barra')).toBe(tok('primary', mode));
      expect(fillOf(d, 'faixa')).toBe(tok('secondary-container', mode));
      // parada (StopSize 4), circular, no fim do trilho, em primary
      const stop = box(d, 'parada');
      expect([stop.width, stop.height, stop.x + stop.width]).toEqual([4, 4, W]);
      expect(stop.node.type).toBe('ellipse');
      expect(fillOf(d, 'parada')).toBe(tok('primary', mode));
    }
  });

  it('linear em 0 e em 1: só o trilho inteiro (com a parada) ou só a barra cheia', () => {
    const zero = linear(0);
    expect(named(zero, 'barra')).toBeUndefined();
    expect(edges(zero, 'faixa total')).toEqual([0, W]);
    expect(named(zero, 'faixa')).toBeUndefined();
    expect(box(zero, 'parada').x + 4).toBe(W);
    const full = linear(1);
    expect(named(full, 'trilho')).toBeUndefined();
    // a ponta passa 2 do fim; a raiz recorta em 240
    expect(edges(full, 'barra')[0]).toBe(0);
    expect(edges(full, 'barra')[1]).toBeGreaterThanOrEqual(W);
  });

  it('linear indeterminado: uma barra entre 30% e 70% com trilho dos dois lados e gap de 4', () => {
    const d = linear();
    expect(named(d, 'barra')).toBeUndefined();
    const bar = edges(d, 'barra indeterminada');
    expect(bar).toEqual([0.3 * W - 2, 0.7 * W + 2]);
    expect(edges(d, 'faixa antes')[0]).toBe(0);
    expect(bar[0]! - edges(d, 'faixa antes')[1]!).toBe(4);
    expect(edges(d, 'faixa')[0]! - bar[1]!).toBe(4);
    expect(edges(d, 'faixa')[1]).toBe(W);
    expect(fillOf(d, 'faixa antes')).toBe(tok('secondary-container', 'light'));
    expect(fillOf(d, 'barra indeterminada')).toBe(tok('primary', 'light'));
  });

  it('progresso entre os centésimos (0,655) desenha o arco exato, sem aviso (EX6: sem tabela)', () => {
    const d = drawIn(
      catalog,
      entryOf('progress-indicator'),
      { shape: 'circular', progress: 0.655 },
      'light',
    );
    expect(d.warnings).toEqual([]);
    const ind = parseArc((named(d, 'indicador') as PathNode).d);
    expectPoint(ind.end, at(270 + 0.655 * 360));
    expect(named(d, 'indicador indeterminado')).toBeUndefined();
  });

  it('cada centésimo de 0 a 1 desenha sem aviso', () => {
    for (const shape of ['circular', 'linear']) {
      for (let i = 0; i <= 100; i++) {
        const progress = i / 100;
        for (const mode of ['light', 'dark'] as const) {
          const d = drawIn(
            catalog,
            entryOf('progress-indicator'),
            { shape, progress },
            mode,
          );
          expect(d.warnings, `${shape} ${progress}`).toEqual([]);
        }
      }
    }
  });
});

describe('M3 grupo A — todos os estados desenham sem aviso', () => {
  it.each(['light', 'dark'] as const)('em %s', (mode) => {
    for (const state of ['unchecked', 'checked', 'indeterminate']) {
      for (const enabled of ['true', 'false']) {
        const d = drawIn(
          catalog,
          entryOf('checkbox'),
          { label: 'Caixa', state, enabled },
          mode,
        );
        expect(d.warnings, `checkbox ${state} ${enabled}`).toEqual([]);
      }
    }
    for (const selected of ['true', 'false']) {
      for (const enabled of ['true', 'false']) {
        const d = drawIn(
          catalog,
          entryOf('radio-button'),
          { label: 'Opção', selected, enabled },
          mode,
        );
        expect(d.warnings, `radio ${selected} ${enabled}`).toEqual([]);
      }
    }
    for (const checked of ['true', 'false']) {
      for (const enabled of ['true', 'false']) {
        for (const thumbIcon of ['true', 'false']) {
          const d = drawIn(
            catalog,
            entryOf('switch'),
            { label: 'Chave', checked, enabled, thumbIcon },
            mode,
          );
          expect(d.warnings, `switch ${checked} ${enabled} ${thumbIcon}`).toEqual([]);
        }
      }
    }
  });
});
