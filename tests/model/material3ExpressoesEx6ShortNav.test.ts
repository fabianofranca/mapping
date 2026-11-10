// EX6 da etapa "expressões que calculam no formato 4" (#897): a margem do `Centered` da
// short-navigation-bar sai da largura da instância e do número de itens (`$size` e `$rows`), como
// `calculateCenteredContentHorizontalPadding` do Compose (20%, 15%, 10% e 5% da largura com 3, 4, 5
// e 6 itens), e não mais dos 10% fixos de antes; e o item cresce até `largura / itens` quando o
// conteúdo dele é mais largo que a fatia, com a margem encolhendo pela metade do que cresceu
// (`CenteredContentMeasurePolicy`). O resto do desenho fica como as cenas de antes da etapa
// (tests/fixtures/material3-ex6-v1.json) a ≤ 0,5 px por nó.
import { describe, expect, it } from 'vitest';
import { findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, text, typeOf } from '../support/material3Library';
import {
  catalog,
  draw,
  missingNodes,
  oldScenes,
  type Drawing,
  type OldNode,
  type Values,
} from '../support/material3Ex6Fixture';

const entry = findEntry(catalog, 'short-navigation-bar')!;
const ICONS = [
  'Home',
  'Search',
  'Person',
  'Menu',
  'Settings',
  'Favorite',
  'Info',
  'Delete',
];

/** Rótulos curtos (cabem em qualquer fatia do ícone acima): nenhum item cresce. */
function items(n: number, label = (i: number) => `T${i + 1}`) {
  return Array.from({ length: n }, (_, i) => ({
    label: label(i),
    icon: ICONS[i % ICONS.length]!,
    selected: i === 0 ? 'true' : 'false',
  }));
}

/** Desenha a barra com os itens dados, na largura `width` (a da instância). */
function drawBar(
  list: ReturnType<typeof items>,
  width: number,
  extra: Values = {},
  mode: 'light' | 'dark' = 'light',
): Drawing {
  const sized = {
    ...entry,
    component: { ...entry.component!, size: { width, height: 64 } },
  };
  return drawIn(catalog, sized, { items: list, ...extra }, mode);
}

const visible = (d: Drawing): SceneNode[] => [...walk(d.root)].filter((n) => n.visible);
const named = (d: Drawing, name: string) => visible(d).filter((n) => n.name === name);
const rectOf = (d: Drawing, n: SceneNode) => {
  const b = absoluteBoxes(d.root).get(n.id)!;
  return [b.x, b.y, b.width, b.height] as [number, number, number, number];
};

/** A margem de cada lado que o Compose usa, em fração da largura (`ShortNavigationBar.kt` 436 a 511). */
const composePadding = (n: number) => (n > 6 ? 0 : (100 - 10 * (n + 3)) / 2 / 100);

describe('EX6 short-navigation-bar — a margem do Centered pelo número de itens', () => {
  it('a margem é 20%, 15%, 10% e 5% da largura com 3, 4, 5 e 6 itens', () => {
    const expected: [number, number][] = [
      [3, 0.2],
      [4, 0.15],
      [5, 0.1],
      [6, 0.05],
    ];
    for (const [n, fraction] of expected) {
      const d = drawBar(items(n), 412, { arrangement: 'Centered' });
      const margins = named(d, 'margem');
      expect(margins, `${n} itens`).toHaveLength(2);
      for (const m of margins) expect(rectOf(d, m)[2]).toBeCloseTo(412 * fraction, 6);
      expect(composePadding(n)).toBeCloseTo(fraction, 10);
    }
  });

  it('as margens são simétricas e os destinos ocupam o meio, em fatias iguais', () => {
    for (const n of [3, 4, 5, 6]) {
      const d = drawBar(items(n), 412, { arrangement: 'Centered' });
      const [left, right] = named(d, 'margem');
      const pad = 412 * composePadding(n);
      expect(rectOf(d, left!)[0]).toBeCloseTo(0, 6);
      expect(rectOf(d, right!)[0]).toBeCloseTo(412 - pad, 6);
      const slots = named(d, 'destino');
      expect(slots, `${n} itens`).toHaveLength(n);
      const slice = (412 - 2 * pad) / n;
      slots.forEach((s, i) => {
        const [x, , w, h] = rectOf(d, s);
        expect(x).toBeCloseTo(pad + i * slice, 6);
        expect(w).toBeCloseTo(slice, 6);
        expect(h).toBe(64);
      });
    }
  });

  it('a margem segue a largura da instância (o $size), não os 412 do tamanho inicial', () => {
    for (const width of [320, 600, 840]) {
      const d = drawBar(items(4), width, { arrangement: 'Centered' });
      for (const m of named(d, 'margem'))
        expect(rectOf(d, m)[2]).toBeCloseTo(width * 0.15, 6);
      const slots = named(d, 'destino');
      expect(rectOf(d, slots[0]!)[0]).toBeCloseTo(width * 0.15, 6);
      const last = rectOf(d, slots[3]!);
      expect(last[0] + last[2]).toBeCloseTo(width * 0.85, 6);
    }
  });

  it('com 7 itens ou mais a margem é 0, como no Compose (itemsCount > 6), e nunca fica negativa', () => {
    for (const n of [7, 8]) {
      const d = drawBar(items(n), 412, { arrangement: 'Centered' });
      for (const m of named(d, 'margem')) expect(rectOf(d, m)[2]).toBeCloseTo(0, 6);
      expect(rectOf(d, named(d, 'destino')[0]!)[0]).toBeCloseTo(0, 6);
    }
  });

  it('sem itens a barra fica vazia, sem aviso', () => {
    const d = drawBar([], 412, { arrangement: 'Centered' });
    expect(d.warnings).toEqual([]);
    expect(named(d, 'destino')).toEqual([]);
  });

  it('no EqualWeight não há margem e os destinos dividem a largura toda', () => {
    for (const n of [3, 4, 5, 6]) {
      const d = drawBar(items(n), 412, { arrangement: 'EqualWeight' });
      expect(named(d, 'margem')).toEqual([]);
      const slots = named(d, 'destino');
      expect(slots).toHaveLength(n);
      slots.forEach((s, i) => {
        const [x, , w] = rectOf(d, s);
        expect(x).toBeCloseTo((412 / n) * i, 6);
        expect(w).toBeCloseTo(412 / n, 6);
      });
    }
  });
});

describe('EX6 short-navigation-bar — o item cresce até largura / itens (CenteredContentMeasurePolicy)', () => {
  const NAMES = ['Início', 'Buscar', 'Perfil'];
  const named3 = items(3, (i) => NAMES[i]!);

  it('ícone ao lado, 3 itens: a pílula (60 + rótulo) é mais larga que a fatia de 82,4 e o item cresce até ela, sem aviso', () => {
    const d = drawBar(named3, 412, { arrangement: 'Centered', iconPosition: 'Start' });
    expect(d.warnings).toEqual([]);
    const slice = (412 * 0.6) / 3;
    const pills = visible(d).filter(
      (n) => n.name === 'indicador' && n.type === 'frame' && rectOf(d, n)[3] === 40,
    );
    const slots = named(d, 'destino').map((s) => rectOf(d, s));
    expect(pills).toHaveLength(3);
    pills.forEach((pill, i) => {
      const width = rectOf(d, pill)[2];
      expect(width, `pílula ${i}`).toBeGreaterThan(slice);
      expect(slots[i]![2], `item ${i}`).toBeCloseTo(width, 6);
    });
    // a margem encolhe pela metade do que os itens cresceram, dos dois lados
    const grown = slots.reduce((sum, s) => sum + (s[2] - slice), 0);
    const [left, right] = named(d, 'margem').map((m) => rectOf(d, m)[2]);
    expect(left).toBeCloseTo(412 * 0.2 - grown / 2, 6);
    expect(right).toBeCloseTo(left!, 6);
    // o grupo continua centrado
    const last = slots[2]!;
    expect(slots[0]![0]).toBeCloseTo(412 - (last[0] + last[2]), 6);
  });

  it('o crescimento para em largura / itens (82,4 → no máximo 137,3 com 3 itens)', () => {
    const long = items(3, () => 'Configurações avançadas do aplicativo');
    const d = drawBar(long, 412, { arrangement: 'Centered', iconPosition: 'Start' });
    for (const s of named(d, 'destino')) expect(rectOf(d, s)[2]).toBeCloseTo(412 / 3, 6);
    for (const m of named(d, 'margem')) expect(rectOf(d, m)[2]).toBeCloseTo(0, 6);
  });

  it('no EqualWeight o item nunca passa da fatia, qualquer que seja o rótulo', () => {
    const long = items(3, () => 'Configurações avançadas do aplicativo');
    const d = drawBar(long, 412, { arrangement: 'EqualWeight', iconPosition: 'Start' });
    for (const s of named(d, 'destino')) expect(rectOf(d, s)[2]).toBeCloseTo(412 / 3, 6);
  });
});

// ---------------------------------------------------------------------------------------------
// Regressão: as cenas de antes, a ≤ 0,5 px por nó
// ---------------------------------------------------------------------------------------------

/** `Centered` com n ≠ 5: a margem mudou de propósito (10% → o do Compose). */
const centeredChanged = (values: Values): boolean =>
  values['arrangement'] === 'Centered' && (values['items'] as unknown[]).length !== 5;

/**
 * `Centered` de 5 itens com o ícone ao lado: a pílula (até 110) é mais larga que a fatia de 65,9, e
 * antes o item ficava na fatia, com a pílula saindo dela; agora ele cresce até `largura / itens`
 * (82,4), como no Compose. É a única diferença fora das margens.
 */
const centeredGrows = (values: Values): boolean =>
  values['arrangement'] === 'Centered' &&
  values['iconPosition'] === 'Start' &&
  (values['items'] as unknown[]).length === 5;

describe('EX6 short-navigation-bar — regressão contra as cenas de antes', () => {
  it('os 6 exemplos (claro e escuro): tudo igual, exceto o Centered de 3 itens', () => {
    const scenes = oldScenes('short-navigation-bar-');
    expect(scenes).toHaveLength(12);
    let compared = 0;
    for (const s of scenes) {
      if (centeredChanged(s.values)) continue;
      expect(missingNodes(draw(s.id, s.values, s.mode), s.nodes), s.key).toEqual([]);
      compared++;
    }
    // ex1 e ex2 (Centered, 3 itens) saem, nos dois modos
    expect(compared).toBe(8);
  });

  it('3 a 6 itens, EqualWeight e Centered de 5 itens: tudo igual (fora o ícone ao lado com crescimento)', () => {
    const scenes = oldScenes('snb-');
    expect(scenes).toHaveLength(32);
    let compared = 0;
    for (const s of scenes) {
      if (centeredChanged(s.values) || centeredGrows(s.values)) continue;
      expect(missingNodes(draw(s.id, s.values, s.mode), s.nodes), s.key).toEqual([]);
      compared++;
    }
    // 32 cenas menos o Centered de 3, 4 e 6 itens (12) e o Centered de 5 com o ícone ao lado (2)
    expect(compared).toBe(18);
  });

  it('nas cenas que mudaram (Centered de 3, 4 e 6 itens com o ícone acima), o de antes deslocado para a margem nova', () => {
    // com o ícone acima nenhum item cresce: tudo o que muda é a margem e a fatia
    const changed = oldScenes('snb-').filter(
      (o) => centeredChanged(o.values) && o.values['iconPosition'] === 'Top',
    );
    expect(changed).toHaveLength(6);
    const width = 412;
    for (const s of changed) {
      const n = (s.values['items'] as unknown[]).length;
      const oldPad = width * 0.1;
      const newPad = width * composePadding(n);
      const oldSlice = (width - 2 * oldPad) / n;
      const newSlice = (width - 2 * newPad) / n;
      const remapped = s.nodes.map((o): OldNode => {
        const [x, y, w, h] = o.r as [number, number, number, number];
        if (o.n === 'short navigation bar') return o;
        if (o.n === 'margem')
          return { ...o, r: [x === 0 ? 0 : width - newPad, y, newPad, h] };
        if (o.n === 'destinos') return { ...o, r: [newPad, y, width - 2 * newPad, h] };
        // o resto está dentro de uma fatia, centrado nela: o centro acompanha a fatia nova
        const slot = Math.min(n - 1, Math.floor((x + w / 2 - oldPad) / oldSlice));
        if (o.n === 'destino')
          return { ...o, r: [newPad + slot * newSlice, y, newSlice, h] };
        const shift =
          newPad +
          slot * newSlice +
          newSlice / 2 -
          (oldPad + slot * oldSlice + oldSlice / 2);
        return { ...o, r: [x + shift, y, w, h] };
      });
      expect(missingNodes(draw(s.id, s.values, s.mode), remapped), s.key).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Sem tabelas
// ---------------------------------------------------------------------------------------------

/**
 * Cada `$switch` com mais de 12 casos (menos o do nome do ícone, o de 164 casos que traduz o nome
 * do Compose para o id do conjunto: não é conta) e cada `$eq` sobre um campo `number` do tipo.
 */
function offenders(id: 'short-navigation-bar') {
  const numberFields = new Set(
    typeOf(id)
      .fields.filter((f) => f.type === 'number')
      .map((f) => f.key),
  );
  const found: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, `${path}[${i}]`));
    if (typeof value !== 'object' || value === null) return;
    const obj = value as Record<string, unknown>;
    const cases = obj['cases'];
    if ('$switch' in obj && typeof cases === 'object' && cases !== null) {
      const count = Object.keys(cases).length;
      if (count > 12 && obj['$switch'] !== 'icon')
        found.push(`${path}: $switch de ${count} casos`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq sobre o campo number ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 short-navigation-bar — sem tabelas enumeradas', () => {
  it('não há $switch com mais de 12 casos (fora o do nome do ícone) nem $eq sobre campo number', () => {
    expect(offenders('short-navigation-bar')).toEqual([]);
  });

  it('a fatia do destino é uma conta de $size e $rows, sem lista de casos', () => {
    const component = JSON.parse(text('components/short-navigation-bar.json')) as {
      template: { children: { name: string; template?: Record<string, unknown> }[] };
    };
    const slot = component.template.children.find(
      (c) => c.name === 'destinos',
    )!.template!;
    for (const key of ['minWidth', 'maxWidth']) {
      const json = JSON.stringify(slot[key]);
      expect(json, key).toContain('"$size":"width"');
      expect(json, key).toContain('"$rows":"items"');
      expect(json, key).not.toContain('$switch');
    }
    expect(JSON.stringify(slot['minWidth'])).toContain('0.05');
  });
});
