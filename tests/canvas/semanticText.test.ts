import { describe, expect, it } from 'vitest';
import {
  CARD_ROW_HEIGHT,
  SEMANTIC_MIN_HEIGHT,
  SEMANTIC_MIN_WIDTH,
  cardRows,
  cardSections,
  layoutCard,
  semanticMode,
  type CardLabels,
  type CardRow,
} from '../../src/canvas/semanticText';
import {
  addAnnotation,
  getInheritedAnnotations,
  setAnnotationInherit,
  setAnnotationParent,
  type Project,
} from '../../src/model';
import { marking, sampleProject } from '../model/fixtures';

const big = { screenWidth: SEMANTIC_MIN_WIDTH, screenHeight: SEMANTIC_MIN_HEIGHT };
const area = { areaWidth: SEMANTIC_MIN_WIDTH, areaHeight: SEMANTIC_MIN_HEIGHT };

const labels: CardLabels = {
  untitled: (n) => `Anotação ${n}`,
  linkedTo: (owner) => `↳ de ${owner.name ?? '?'}`,
  inheritedFrom: (source) => `↳ herdado de ${source.name ?? '?'}`,
};

function rowsOf(p: Project, markingId: string): CardRow[] {
  const inherited = getInheritedAnnotations(p, markingId).map((annotation) => ({
    annotation,
    source: marking(p, annotation.markingId),
  }));
  const own = p.annotations.filter((a) => a.markingId === markingId);
  const owners = new Map(p.annotations.map((a) => [a.id, a]));
  return cardRows(cardSections(p.layers, own, inherited), owners, labels);
}

describe('zoom semântico: quando aparece', () => {
  it('área grande o bastante: cartão; área pequena: só o cabeçalho com "…"', () => {
    expect(semanticMode({ enabled: true, ...big, ...area })).toBe('full');
    expect(semanticMode({ enabled: true, ...big, areaWidth: 100, areaHeight: 500 })).toBe(
      'header',
    );
    expect(
      semanticMode({ enabled: true, ...big, areaWidth: null, areaHeight: null }),
    ).toBe('header');
  });

  it('só aparece com o tamanho mínimo da marcação na tela', () => {
    const at = (screenWidth: number, screenHeight: number) =>
      semanticMode({ enabled: true, screenWidth, screenHeight, ...area });
    expect(at(SEMANTIC_MIN_WIDTH - 1, 500)).toBe('none');
    expect(at(500, SEMANTIC_MIN_HEIGHT - 1)).toBe('none');
    expect(at(SEMANTIC_MIN_WIDTH, SEMANTIC_MIN_HEIGHT)).toBe('full');
  });

  it('desligado nas configurações, nunca mostra texto', () => {
    expect(semanticMode({ enabled: false, ...big, ...area })).toBe('none');
  });
});

describe('zoom semântico: cartão', () => {
  it('uma seção por camada, nome em destaque, pares e "Anotação N" sem nome', () => {
    const rows = rowsOf(sampleProject(), 'M1');
    expect(rows).toEqual([
      { kind: 'layer', section: 0, text: 'Lataria' },
      { kind: 'title', section: 0, text: 'Amassado', untitled: false, inherited: false },
      { kind: 'entry', section: 0, text: 'tipo: amassado', inherited: false },
      { kind: 'entry', section: 0, text: 'gravidade: média', inherited: false },
      { kind: 'layer', section: 1, text: 'Vidros' },
      { kind: 'title', section: 1, text: 'Anotação 1', untitled: true, inherited: false },
      { kind: 'entry', section: 1, text: 'tipo: trinca', inherited: false },
    ]);
  });

  it('separa as anotações da mesma camada e numera as sem nome dentro dela', () => {
    let p = sampleProject();
    p = addAnnotation(p, { id: 'A5', markingId: 'M4', layerId: 'L2' });
    p = addAnnotation(p, { id: 'A6', markingId: 'M4', layerId: 'L2', name: 'Trinca' });
    expect(rowsOf(p, 'M4').map((r) => ('text' in r ? r.text : r.kind))).toEqual([
      'Vidros',
      'Anotação 1',
      'separator',
      'Anotação 2',
      'separator',
      'Trinca',
    ]);
  });

  it('herdadas: itálico/esmaecidas, com "↳ herdado de"', () => {
    const p = setAnnotationInherit(sampleProject(), 'A1', true);
    const rows = rowsOf(p, 'M2');
    expect(rows).toEqual([
      { kind: 'layer', section: 0, text: 'Lataria' },
      { kind: 'title', section: 0, text: 'Anotação 1', untitled: true, inherited: false },
      { kind: 'separator', section: 0 },
      { kind: 'title', section: 0, text: 'Amassado', untitled: false, inherited: true },
      { kind: 'note', section: 0, text: '↳ herdado de Porta', inherited: true },
      { kind: 'entry', section: 0, text: 'tipo: amassado', inherited: true },
      { kind: 'entry', section: 0, text: 'gravidade: média', inherited: true },
    ]);
  });

  it('vinculadas: "↳ de" abaixo do nome', () => {
    let p = sampleProject();
    p = addAnnotation(p, { id: 'A7', markingId: 'M1', layerId: 'L2', name: 'onClick' });
    p = setAnnotationParent(p, 'A7', 'A1');
    const rows = rowsOf(p, 'M1');
    const i = rows.findIndex((r) => r.kind === 'title' && r.text === 'onClick');
    expect(rows[i + 1]).toEqual({
      kind: 'note',
      section: 1,
      text: '↳ de Amassado',
      inherited: false,
    });
  });

  it('só entram as camadas dadas (as visíveis), na ordem delas', () => {
    const p = sampleProject();
    const own = p.annotations.filter((a) => a.markingId === 'M1');
    const [lataria, vidros] = p.layers;
    const sections = cardSections([vidros!, lataria!], own, []);
    expect(sections.map((s) => s.layer.id)).toEqual(['L2', 'L1']);
    expect(cardSections([vidros!], own, []).map((s) => s.layer.id)).toEqual(['L2']);
  });
});

describe('zoom semântico: layout do cartão', () => {
  const rows = rowsOf(sampleProject(), 'M1');

  it('cabe tudo: sem "…"', () => {
    const layout = layoutCard(rows, 1000);
    expect(layout.truncated).toBe(false);
    expect(layout.rows).toHaveLength(rows.length);
    expect(layout.rows.at(-1)?.kind).toBe('entry');
    // Linhas empilhadas sem sobreposição.
    layout.rows.slice(1).forEach((row, i) => {
      const prev = layout.rows[i]!;
      expect(row.y).toBeGreaterThanOrEqual(prev.y + prev.height);
    });
  });

  it('não cabe: corta e termina com "…", sem passar da altura', () => {
    const max = CARD_ROW_HEIGHT.layer + CARD_ROW_HEIGHT.title + CARD_ROW_HEIGHT.entry + 5;
    const layout = layoutCard(rows, max);
    expect(layout.truncated).toBe(true);
    expect(layout.rows.at(-1)?.kind).toBe('more');
    expect(layout.height).toBeLessThanOrEqual(max);
    expect(layout.rows.map((r) => r.kind)).toEqual(['layer', 'title', 'more']);
  });

  it('não deixa nome de camada nem separador sozinhos antes do "…"', () => {
    const cut = rows.findIndex((r) => r.kind === 'layer' && r.section === 1);
    const upTo = layoutCard(rows.slice(0, cut + 1), 1000).height;
    const layout = layoutCard(rows, upTo);
    expect(layout.rows.map((r) => r.kind)).not.toContain('separator');
    expect(layout.rows.filter((r) => r.kind === 'layer')).toHaveLength(1);
    expect(layout.rows.at(-1)?.kind).toBe('more');
  });

  it('altura mínima demais: cartão vazio (nem só o "…")', () => {
    expect(layoutCard(rows, 5).rows).toEqual([]);
    expect(layoutCard(rows, CARD_ROW_HEIGHT.more + 1).rows).toEqual([]);
  });
});
