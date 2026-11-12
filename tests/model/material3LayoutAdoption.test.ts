// L5 (#1101, decisões 24 e 25 da #1078): a Material 3 (Compose) adota o layout novo do motor.
//  - `box`: o slot `none` alinhado pelo `contentAlignment` (o Arrumar põe a filha onde o Compose põe);
//  - `lazy-vertical-grid`: o slot `grid` com `columns`/`minColumnWidth` e os espaçamentos;
//  - `segmented-button`: os segmentos numa grade de colunas iguais (o `IntrinsicSize.Min`);
//  - `row`, `column`, `lazy-column`, `lazy-row` e a grade lazy: o slot com `clip`.
import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  arrangeMarking,
  createDrawingCache,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { drawFitted, fittedSize } from '../support/material3Fitted';
import {
  at,
  catalog,
  clipProject,
  component,
  layoutOf,
  slotOf,
  withButtons,
  type Json,
} from '../support/material3Adoption';

describe('box: o Arrumar põe a filha pelo contentAlignment (o Compose)', () => {
  const arrange = (contentAlignment: string, n = 1) => {
    const p = withButtons(
      'box',
      { x: 20, y: 20, width: 200, height: 160 },
      { contentAlignment, height: 'fixed' },
      n,
    );
    return arrangeMarking(p, catalog, 'C', approximateMeasurer).project;
  };

  /** O retângulo da filha e o do Box (20, 20, 200 × 160): `x` e `y` pelo meio ou pelo fim. */
  const place = (alignment: string) => {
    const r = at(arrange(alignment), 'B1');
    return {
      r,
      center: {
        x: Math.round(20 + (200 - r.width) / 2),
        y: Math.round(20 + (160 - r.height) / 2),
      },
      end: { x: 220 - r.width, y: 180 - r.height },
    };
  };

  it('Center: a filha no meio do Box de 200 × 160', () => {
    const { r, center } = place('Center');
    expect([r.x, r.y]).toEqual([center.x, center.y]);
  });

  it('BottomEnd: no canto de baixo à direita', () => {
    const { r, end } = place('BottomEnd');
    expect([r.x, r.y]).toEqual([end.x, end.y]);
  });

  it('TopCenter e CenterStart usam um eixo cada', () => {
    const top = place('TopCenter');
    expect([top.r.x, top.r.y]).toEqual([top.center.x, 20]);
    const side = place('CenterStart');
    expect([side.r.x, side.r.y]).toEqual([20, side.center.y]);
  });

  it('as filhas continuam sobrepostas, cada uma alinhada sozinha', () => {
    const p = arrange('Center', 2);
    expect(at(p, 'B1')).toEqual(at(p, 'B2'));
  });

  it('TopStart (o padrão) não mexe nas filhas: o none de sempre', () => {
    const p = withButtons(
      'box',
      { x: 20, y: 20, width: 200, height: 160 },
      { contentAlignment: 'TopStart', height: 'fixed' },
      1,
    );
    expect(() => arrangeMarking(p, catalog, 'C', approximateMeasurer)).toThrow();
  });

  it('o slot declara align e justify pelo contentAlignment', () => {
    const layout = layoutOf('box');
    expect(layout.type).toBe('none');
    expect(layout.align).toMatchObject({ $switch: 'contentAlignment' });
    expect(layout.justify).toMatchObject({ $switch: 'contentAlignment' });
  });
});

describe('lazy-vertical-grid: o Arrumar põe as filhas em grade', () => {
  const arrange = (values: NewComponentArgs['values'], n = 5) => {
    const p = withButtons(
      'lazy-vertical-grid',
      { x: 20, y: 20, width: 360, height: 400 },
      values,
      n,
    );
    return arrangeMarking(p, catalog, 'C', approximateMeasurer).project;
  };
  const cells = (p: Project, n = 5) =>
    Array.from({ length: n }, (_, i) => {
      const r = at(p, `B${i + 1}`);
      return [r.x, r.y];
    });

  it('columns 2: 5 filhas em 3 linhas, com horizontalSpacing e verticalSpacing', () => {
    const p = arrange({
      columns: 2,
      minColumnWidth: null,
      horizontalSpacing: 8,
      verticalSpacing: 12,
      contentPadding: 0,
    });
    // Colunas de (360 − 8) / 2 = 176: a segunda começa em 20 + 184; linhas de 40 + 12.
    expect(cells(p)).toEqual([
      [20, 20],
      [204, 20],
      [20, 72],
      [204, 72],
      [20, 124],
    ]);
  });

  it('minColumnWidth 100 (Adaptive): floor((360 + 8) / 108) = 3 colunas', () => {
    const p = arrange({
      columns: 2,
      minColumnWidth: 100,
      horizontalSpacing: 8,
      verticalSpacing: 12,
      contentPadding: 0,
    });
    // Três colunas de (360 − 16) / 3 ≈ 114,7: passo de 122,7.
    expect(cells(p)).toEqual([
      [20, 20],
      [143, 20],
      [265, 20],
      [20, 72],
      [143, 72],
    ]);
  });

  it('o slot é uma grade e o rótulo não resume mais Fixed/Adaptive', () => {
    const layout = layoutOf('lazy-vertical-grid');
    expect(layout.type).toBe('grid');
    expect(layout.gap).toMatchObject({ $field: 'horizontalSpacing' });
    expect(layout.lineGap).toMatchObject({ $field: 'verticalSpacing' });
    const label = JSON.stringify(slotOf('lazy-vertical-grid').label);
    expect(label).not.toMatch(/Fixed|Adaptive/);
  });
});

describe('segmented-button: segmentos de largura igual pelo mais largo', () => {
  const options = (...labels: string[]) =>
    labels.map((label, i) => ({ label, icon: '', selected: i === 0 ? 'true' : 'false' }));

  /** As larguras dos nós `segmento` do desenho. */
  const widths = (values: Json, mode: 'light' | 'dark' = 'light') => {
    const { drawing, box } = drawFitted('segmented-button', values, mode);
    const boxes = absoluteBoxes(drawing.root);
    const cells = [...walk(drawing.root)].filter((n) => n.name === 'segmento');
    return {
      box,
      widths: cells.map((n) => boxes.get(n.id)!.width),
      heights: cells.map((n) => boxes.get(n.id)!.height),
    };
  };

  it('"A" e "Configurações avançadas": os dois segmentos medem o mesmo (o mais largo) (#898)', () => {
    const values = { options: options('A', 'Configurações avançadas') };
    const fitted = fittedSize('segmented-button', values);
    const { box, widths: w } = widths(values);
    expect(w).toHaveLength(2);
    expect(Math.abs((w[0] as number) - (w[1] as number))).toBeLessThanOrEqual(1);
    // O tamanho ajustado é duas vezes o segmento mais largo; o "A" não encolhe para o rótulo dele.
    expect(Math.abs(fitted.width - 2 * (w[0] as number))).toBeLessThanOrEqual(2);
    expect(box.width).toBe(fitted.width);
    expect(w[0]).toBeGreaterThan(150);
  });

  it('com a caixa de 328, os três segmentos dividem a largura por igual', () => {
    const { widths: w, heights: h } = widths({
      options: options('Dia', 'Semana', 'Mês'),
    });
    expect(Math.max(...w) - Math.min(...w)).toBeLessThanOrEqual(1);
    // Os segmentos têm a altura da linha (40), e não só a do conteúdo.
    expect(h).toEqual([40, 40, 40]);
  });

  it('em light e dark o desenho é o mesmo (só as cores mudam)', () => {
    const values = { options: options('A', 'Configurações avançadas') };
    expect(widths(values, 'dark').widths).toEqual(widths(values, 'light').widths);
  });

  it('os segmentos são uma grade com uma coluna por opção', () => {
    const repeat = (component('segmented-button').template as Json).children as Json[];
    const grid = repeat.find((c) => c.type === 'repeat') as Json;
    expect(grid.layout).toMatchObject({ type: 'grid', columns: { $rows: 'options' } });
    expect(grid.direction).toBeUndefined();
  });
});

describe('o slot dos contêineres com rolagem e dos fluxos corta o que passa (clip)', () => {
  it.each(['lazy-column', 'lazy-row', 'lazy-vertical-grid', 'row', 'column'])(
    '%s: slot com clip true',
    (id) => {
      expect(slotOf(id).clip).toBe(true);
    },
  );

  it('box e flow-row não cortam (o Compose não corta)', () => {
    expect(slotOf('box').clip).toBeUndefined();
    expect(slotOf('flow-row').clip).toBeUndefined();
  });

  it('na app: o desenho da filha leva a caixa do slot da mãe como recorte', () => {
    const drawings = createDrawingCache()(clipProject(), catalog, approximateMeasurer, 0);
    expect(drawings.get('K')?.clip).toMatchObject({
      x: 20,
      y: 20,
      width: 140,
      height: 70,
    });
  });
});
