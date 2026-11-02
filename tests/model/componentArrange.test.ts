import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  canArrange,
  createMarking,
  loadSpecComponents,
  parseSpecText,
  setFieldValue,
  setMarkingLocked,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';
import { emptyProject, expectValid, marking } from './fixtures';

const catalog = testCatalog();

function add(
  p: Project,
  id: string,
  typeId: string,
  rect: Rect,
  parentId: string | null = null,
  extra: Partial<NewComponentArgs> = {},
  cat: ComponentCatalog = catalog,
  specId = SPEC_ID,
): Project {
  return addComponentMarking(
    p,
    cat,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId,
      specId,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

const box = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
const rectOf = (p: Project, id: string): Rect => marking(p, id).rect;
const arrange = (p: Project, id: string, cat: ComponentCatalog = catalog) =>
  arrangeMarking(p, cat, id, approximateMeasurer);

/** Container `typeId` em `rect` com filhas `text` nos retângulos dados (dentro dele, fora de ordem). */
function withKids(typeId: string, rect: Rect, kids: Rect[], padding?: number): Project {
  let p = add(componentProject(), 'C', typeId, rect, null, { name: 'Linha' });
  if (padding !== undefined) p = setFieldValue(p, 'A_C', 'padding', padding);
  kids.forEach((kid, i) => {
    p = add(p, `T${i + 1}`, 'text', kid, 'C', { name: `T${i + 1}` });
  });
  return p;
}

describe('canArrange e not-arrangeable', () => {
  it('só container row/column com filhas', () => {
    let p = withKids('row', box(100, 100, 300, 100), [box(100, 100, 100, 40)]);
    expect(canArrange(p, catalog, 'C')).toBe(true);
    // Folha, filha comum e inexistente.
    expect(canArrange(p, catalog, 'T1')).toBe(false);
    expect(canArrange(p, catalog, 'nada')).toBe(false);
    // Container sem filhas.
    p = add(p, 'E', 'row', box(500, 500, 300, 100));
    expect(canArrange(p, catalog, 'E')).toBe(false);
    // Container sem layout no slot.
    p = add(p, 'B', 'box', box(500, 300, 300, 100));
    p = add(p, 'BT', 'text', box(500, 300, 100, 40), 'B');
    expect(canArrange(p, catalog, 'B')).toBe(false);
    // Marcação comum.
    p = createMarking(p, { id: 'P', containerId: 'I1', rect: box(0, 0, 50, 50) });
    expect(canArrange(p, catalog, 'P')).toBe(false);
  });

  it('arrangeMarking lança not-arrangeable', () => {
    const p = withKids('box', box(100, 100, 300, 100), [box(100, 100, 100, 40)]);
    expect(() => arrange(p, 'C')).toThrow('not-arrangeable');
    expect(() => arrange(p, 'T1')).toThrow('not-arrangeable');
    expect(() => arrangeMarking(p, catalog, 'C', approximateMeasurer)).toThrow(
      'not-arrangeable',
    );
  });
});

describe('arrangeMarking: linha e coluna', () => {
  it('linha: as filhas se enfileiram pela ordem do array, com o gap', () => {
    const p = withKids('row', box(100, 100, 300, 100), [
      box(150, 150, 100, 40),
      box(300, 120, 100, 40),
    ]);
    const { project, warnings } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(100, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(208, 100, 100, 40));
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 300, 100));
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('o padding do slot desloca o conteúdo', () => {
    const p = withKids(
      'row',
      box(100, 100, 300, 100),
      [box(150, 150, 100, 40), box(300, 120, 100, 40)],
      4,
    );
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(104, 104, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(212, 104, 100, 40));
  });

  it('o espaçamento vem do campo', () => {
    let p = withKids('row', box(100, 100, 300, 100), [
      box(100, 100, 100, 40),
      box(200, 100, 100, 40),
    ]);
    p = setFieldValue(p, 'A_C', 'spacing', 20);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T2').x).toBe(220);
  });

  it('coluna: as filhas se empilham', () => {
    const p = withKids('column', box(50, 50, 300, 300), [
      box(120, 200, 100, 40),
      box(60, 60, 100, 40),
    ]);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(50, 50, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(50, 98, 100, 40));
    expectValid(project);
  });

  it('align stretch estica o eixo cruzado e mantém o principal', () => {
    const p = withKids('rowstretch', box(100, 100, 300, 100), [
      box(120, 120, 100, 40),
      box(250, 130, 80, 30),
    ]);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(100, 100, 100, 100));
    expect(rectOf(project, 'T2')).toEqual(box(208, 100, 80, 100));
  });

  it('justify space-between distribui a folga', () => {
    const p = withKids('rowbetween', box(100, 100, 300, 100), [
      box(120, 120, 100, 40),
      box(250, 130, 100, 40),
    ]);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1').x).toBe(100);
    expect(rectOf(project, 'T2').x).toBe(300);
  });

  it('justify e align center', () => {
    const p = withKids('rowcenter', box(100, 100, 300, 100), [box(120, 120, 100, 40)]);
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(200, 130, 100, 40));
  });

  it('mover uma filha leva os descendentes dela', () => {
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 200), null, {
      name: 'Linha',
    });
    p = add(p, 'B', 'box', box(150, 150, 100, 100), 'C');
    p = add(p, 'BT', 'text', box(160, 160, 80, 30), 'B');
    p = createMarking(p, { id: 'Deep', containerId: 'I1', rect: box(170, 200, 20, 20) });
    expect(marking(p, 'Deep').parentId).toBe('B');
    const { project } = arrange(p, 'C');
    // B vai para o início do slot (100,100): deslocamento (-50,-50).
    expect(rectOf(project, 'B')).toEqual(box(100, 100, 100, 100));
    expect(rectOf(project, 'BT')).toEqual(box(110, 110, 80, 30));
    expect(rectOf(project, 'Deep')).toEqual(box(120, 150, 20, 20));
    expectValid(project);
  });
});

describe('arrangeMarking: hug', () => {
  it('o container hug se ajusta ao conteúdo e a posição fica', () => {
    const p = withKids('rowhug', box(100, 100, 200, 60), [
      box(110, 110, 100, 40),
      box(120, 120, 100, 40),
    ]);
    const { project, warnings } = arrange(p, 'C');
    expect(rectOf(project, 'T1')).toEqual(box(100, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(208, 100, 100, 40));
    // 100 + 8 + 100 de largura; a maior altura é 40.
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 208, 40));
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('o padding entra na medida', () => {
    const p = withKids(
      'rowhug',
      box(100, 100, 220, 80),
      [box(110, 110, 100, 40), box(120, 120, 100, 40)],
      10,
    );
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 228, 60));
    expect(rectOf(project, 'T1')).toEqual(box(110, 110, 100, 40));
  });

  it('nunca abaixo do minSize', () => {
    let p = add(componentProject(), 'C', 'rowhug', box(100, 100, 200, 60));
    p = createMarking(p, { id: 'Small', containerId: 'I1', rect: box(105, 105, 10, 10) });
    expect(marking(p, 'Small').parentId).toBe('C');
    const { project } = arrange(p, 'C');
    // minSize 40×20 do componente.
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 40, 20));
    expect(rectOf(project, 'Small')).toEqual(box(100, 100, 10, 10));
  });

  it('eixo fixo não muda: avisa quando o conteúdo não cabe', () => {
    const p = withKids('row', box(100, 100, 300, 100), [
      box(100, 100, 100, 40),
      box(110, 100, 100, 40),
      box(120, 100, 100, 40),
    ]);
    const { project, warnings } = arrange(p, 'C');
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 300, 100));
    expect(warnings).toContain('Linha: conteúdo maior que o container');
    // A terceira passaria de 400: é empurrada para dentro do container, com aviso.
    expect(rectOf(project, 'T3')).toEqual(box(300, 100, 100, 40));
    expect(warnings).toContain('T3: não cabe em Linha');
    expectValid(project);
  });

  it('container que crescia além da imagem é preso, com aviso, e as filhas entram', () => {
    const p = withKids('rowhug', box(900, 100, 100, 60), [
      box(900, 100, 100, 40),
      box(900, 110, 100, 40),
    ]);
    const { project, warnings } = arrange(p, 'C');
    // Largura pedida 208 a partir de 900: preso em 1000.
    expect(rectOf(project, 'C')).toEqual(box(900, 100, 100, 40));
    expect(rectOf(project, 'T1')).toEqual(box(900, 100, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(900, 100, 100, 40));
    expect(warnings).toContain('Linha: não cabe em I1');
    expect(warnings).toContain('T2: não cabe em Linha');
    expectValid(project);
  });

  it('container que crescia além do pai é preso ao pai', () => {
    let p = add(componentProject(), 'Outer', 'box', box(100, 100, 150, 100), null, {
      name: 'Pai',
    });
    p = add(p, 'C', 'rowhug', box(100, 100, 100, 60), 'Outer', { name: 'Linha' });
    // Retângulos diferentes: o pai é derivado da geometria (iguais, a segunda seria filha da primeira).
    p = add(p, 'T1', 'text', box(100, 100, 100, 40), 'C');
    p = add(p, 'T2', 'text', box(100, 110, 100, 40), 'C');
    expect(marking(p, 'T2').parentId).toBe('C');
    const { project, warnings } = arrange(p, 'C');
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 150, 40));
    expect(warnings).toContain('Linha: não cabe em Pai');
    expectValid(project);
  });
});

describe('arrangeMarking: no canvas e assentar', () => {
  /** Linha hug no canvas (containerId nulo), longe da imagem I1 (que ocupa 0–1000 × 0–800). */
  function onCanvas(): Project {
    let p = add(componentProject(), 'C', 'rowhug', box(3000, 100, 100, 60), null, {
      name: 'Linha',
      containerId: null,
    });
    p = add(p, 'T1', 'text', box(3000, 100, 100, 40), 'C', { containerId: null });
    p = add(p, 'T2', 'text', box(3000, 110, 100, 40), 'C', { containerId: null });
    return p;
  }

  it('a raiz do canvas não tem limite: cresce além de qualquer borda, sem aviso de "não cabe"', () => {
    const p = onCanvas();
    expect(marking(p, 'C').containerId).toBeNull();
    expect(marking(p, 'T2').parentId).toBe('C');
    const { project, warnings } = arrange(p, 'C');
    // 2 × 100 + gap 8, a partir de x = 3000; a mesma largura que o teste dentro da imagem pediria.
    expect(rectOf(project, 'C')).toEqual(box(3000, 100, 208, 40));
    expect(warnings.some((w) => w.includes('não cabe'))).toBe(false);
    expectValid(project);
  });

  it('as filhas continuam filhas da linha depois de arrumar (o pai é refeito pela geometria)', () => {
    const { project } = arrange(onCanvas(), 'C');
    expect(marking(project, 'T1').parentId).toBe('C');
    expect(marking(project, 'T2').parentId).toBe('C');
    expect(rectOf(project, 'T2')).toEqual(box(3108, 100, 100, 40));
  });

  it('settle: false (prévia) arruma igual, sem assentar', () => {
    const preview = arrangeMarking(onCanvas(), catalog, 'C', approximateMeasurer, {
      settle: false,
    });
    expect(rectOf(preview.project, 'C')).toEqual(box(3000, 100, 208, 40));
  });
});

describe('arrangeMarking: aninhados', () => {
  /** Coluna hug › [linha hug › [T1, T2], T3]. */
  function nested(): Project {
    let p = add(componentProject(), 'Outer', 'columnhug', box(50, 50, 200, 200));
    p = add(p, 'Inner', 'rowhug', box(80, 80, 160, 60), 'Outer');
    p = add(p, 'T1', 'text', box(90, 85, 100, 40), 'Inner');
    p = add(p, 'T2', 'text', box(180, 90, 60, 30), 'Inner');
    p = add(p, 'T3', 'text', box(100, 180, 100, 40), 'Outer');
    return p;
  }

  it('o mais fundo primeiro: o interno ajusta ao conteúdo e o externo, ao interno', () => {
    const { project, warnings } = arrange(nested(), 'Outer');
    expect(rectOf(project, 'T1')).toEqual(box(50, 50, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(158, 50, 60, 30));
    expect(rectOf(project, 'Inner')).toEqual(box(50, 50, 168, 40));
    expect(rectOf(project, 'T3')).toEqual(box(50, 98, 100, 40));
    // largura = a maior (168), altura = 40 + 8 + 40.
    expect(rectOf(project, 'Outer')).toEqual(box(50, 50, 168, 88));
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('o container escolhido pode ser o interno: só a subárvore dele muda', () => {
    const p = nested();
    const { project } = arrange(p, 'Inner');
    expect(rectOf(project, 'Inner')).toEqual(box(80, 80, 168, 40));
    expect(rectOf(project, 'T1')).toEqual(box(80, 80, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(188, 80, 60, 30));
    expect(rectOf(project, 'Outer')).toEqual(rectOf(p, 'Outer'));
    expect(rectOf(project, 'T3')).toEqual(rectOf(p, 'T3'));
    expectValid(project);
  });

  it('o stretch do pai vence o hug do filho no eixo cruzado', () => {
    let p = add(componentProject(), 'Col', 'columnstretch', box(50, 50, 300, 300));
    p = add(p, 'Row', 'rowhug', box(50, 50, 150, 50), 'Col');
    p = add(p, 'T1', 'text', box(50, 50, 100, 40), 'Row');
    const { project } = arrange(p, 'Col');
    // A linha ocupa a largura da coluna (stretch) e abraça a altura do conteúdo.
    expect(rectOf(project, 'Row')).toEqual(box(50, 50, 300, 40));
    expect(rectOf(project, 'T1')).toEqual(box(50, 50, 100, 40));
    // A coluna é fill na largura e hug na altura.
    expect(rectOf(project, 'Col')).toEqual(box(50, 50, 300, 40));
    expectValid(project);
    // Estável: arrumar de novo não muda nada.
    expect(arrange(project, 'Col').project).toBe(project);
  });
});

describe('arrangeMarking: trava, idempotência e histórico', () => {
  it('container trancado: lança locked quando algo mudaria', () => {
    const p = withKids('row', box(100, 100, 300, 100), [box(150, 150, 100, 40)]);
    expect(() => arrange(setMarkingLocked(p, 'C', true), 'C')).toThrow('locked');
  });

  it('filha trancada que mudaria: lança locked; a que já está no lugar passa', () => {
    const p = withKids('row', box(100, 100, 300, 100), [box(150, 150, 100, 40)]);
    expect(() => arrange(setMarkingLocked(p, 'T1', true), 'C')).toThrow('locked');
    const placed = withKids('row', box(100, 100, 300, 100), [box(100, 100, 100, 40)]);
    const locked = setMarkingLocked(placed, 'T1', true);
    expect(arrange(locked, 'C').project).toBe(locked);
  });

  it('nada mudou: o mesmo objeto, mesmo com o container trancado', () => {
    const p = withKids('row', box(100, 100, 300, 100), [
      box(100, 100, 100, 40),
      box(208, 100, 100, 40),
    ]);
    const result = arrange(p, 'C');
    expect(result.project).toBe(p);
    expect(result.warnings).toEqual([]);
    const locked = setMarkingLocked(p, 'C', true);
    expect(arrange(locked, 'C').project).toBe(locked);
  });

  it('idempotente: arrumar o resultado de novo devolve o mesmo projeto', () => {
    const cases: Project[] = [
      withKids('row', box(100, 100, 300, 100), [
        box(150, 150, 100, 40),
        box(300, 120, 100, 40),
      ]),
      withKids('rowstretch', box(100, 100, 300, 100), [
        box(120, 120, 100, 40),
        box(250, 130, 80, 30),
      ]),
      withKids('rowbetween', box(100, 100, 300, 100), [
        box(120, 120, 100, 40),
        box(250, 130, 100, 40),
      ]),
      withKids('rowhug', box(100, 100, 200, 60), [
        box(110, 110, 100, 40),
        box(120, 120, 100, 40),
      ]),
      withKids('column', box(50, 50, 300, 300), [
        box(120, 200, 100, 40),
        box(60, 60, 100, 40),
      ]),
    ];
    for (const p of cases) {
      const first = arrange(p, 'C');
      expect(first.project).not.toBe(p);
      const again = arrange(first.project, 'C');
      expect(again.project).toBe(first.project);
      expect(again.warnings).toEqual(first.warnings);
    }
  });

  it('não altera o projeto de entrada nem marcações fora da subárvore', () => {
    let p = withKids('row', box(100, 100, 300, 100), [box(150, 150, 100, 40)]);
    p = add(p, 'Other', 'text', box(600, 600, 100, 40));
    const before = JSON.stringify(p);
    const { project } = arrange(p, 'C');
    expect(JSON.stringify(p)).toBe(before);
    expect(marking(project, 'Other')).toBe(marking(p, 'Other'));
  });
});

// --- Material 3 real ---------------------------------------------------------------------------------

describe('arrangeMarking: Material 3', () => {
  const root = join(process.cwd(), 'tests/fixtures/material3');
  const specText = readFileSync(join(root, 'material3.spec.json'), 'utf8');
  const parsed = parseSpecText(specText);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const spec = parsed.spec;
  const m3Catalog: ComponentCatalog = new Map([
    [
      spec.id,
      loadSpecComponents(
        spec,
        'specs/material3/material3.spec.json',
        spec.version,
        (path) => readFileSync(join(root, path.replace('specs/material3/', '')), 'utf8'),
      ),
    ],
  ]);

  function m3Project(): Project {
    let p = applySpecialization(emptyProject(), spec, {
      newId: (() => {
        let n = 0;
        return () => `ML${++n}`;
      })(),
      packageSpecName: 'material3.spec.json',
    });
    p = {
      ...p,
      containers: [
        {
          id: 'I1',
          name: null,
          file: 'images/tela.png',
          width: 800,
          height: 1000,
          placement: { x: 0, y: 0, scale: 1 },
          parentId: null,
          markingColor: null,
          locked: false,
          source: null,
          background: null,
        },
      ],
    };
    return p;
  }

  const m3 = (
    p: Project,
    id: string,
    typeId: string,
    rect: Rect,
    parentId: string | null,
    values?: NewComponentArgs['values'],
  ) => add(p, id, typeId, rect, parentId, values ? { values } : {}, m3Catalog, spec.id);

  it('Row com chips: os chips se enfileiram e a linha abraça a altura', () => {
    let p = m3Project();
    p = m3(p, 'Row', 'm3-row', box(20, 20, 380, 48), null);
    p = m3(p, 'C1', 'm3-chip', box(30, 30, 96, 32), 'Row', { label: 'Um' });
    p = m3(p, 'C2', 'm3-chip', box(200, 25, 96, 32), 'Row', { label: 'Dois' });
    p = m3(p, 'C3', 'm3-chip', box(100, 35, 96, 32), 'Row', { label: 'Três' });
    expect(canArrange(p, m3Catalog, 'Row')).toBe(true);
    const { project, warnings } = arrange(p, 'Row', m3Catalog);
    // Os chips são `hug` na largura: cada um ocupa o texto mais o padding (nunca abaixo de 40).
    expect(rectOf(project, 'C1')).toEqual(box(20, 20, 48, 32));
    expect(rectOf(project, 'C2')).toEqual(box(76, 20, 63, 32));
    expect(rectOf(project, 'C3')).toEqual(box(147, 20, 63, 32));
    // largura fill (fica), altura hug: a dos chips.
    expect(rectOf(project, 'Row')).toEqual(box(20, 20, 380, 32));
    expect(warnings).toEqual([]);
    expectValid(project);
    expect(arrange(project, 'Row', m3Catalog).project).toBe(project);
  });

  /** Row com três chips de 96 de largura (como nascem), o do meio com `label`. */
  function chipRow(label: string, otherLabel = 'Um'): Project {
    let p = m3Project();
    p = m3(p, 'Row', 'm3-row', box(20, 20, 380, 48), null);
    p = m3(p, 'C1', 'm3-chip', box(20, 20, 96, 32), 'Row', { label: otherLabel });
    p = m3(p, 'C2', 'm3-chip', box(124, 20, 96, 32), 'Row', { label });
    p = m3(p, 'C3', 'm3-chip', box(228, 20, 96, 32), 'Row', { label: otherLabel });
    return p;
  }

  it('chip hug: trocar o texto e arrumar ajusta a largura (caso "Wi-Fi")', () => {
    const arranged = arrange(chipRow('Um'), 'Row', m3Catalog).project;
    const edited = setFieldValue(arranged, 'A_C2', 'label', 'Wi-Fi');
    const { project, warnings } = arrange(edited, 'Row', m3Catalog);
    expect(project).not.toBe(edited);
    const wifi = rectOf(project, 'C2');
    expect(wifi.width).toBeGreaterThan(48);
    expect(wifi.width).toBeLessThan(96);
    expect(wifi.height).toBe(32);
    // As vizinhas seguem coladas (gap 8).
    expect(rectOf(project, 'C3').x).toBe(wifi.x + wifi.width + 8);
    expect(warnings).toEqual([]);
    expectValid(project);
    expect(arrange(project, 'Row', m3Catalog).project).toBe(project);
  });

  it('chip hug: texto curto encolhe sem passar do minSize, texto longo cresce', () => {
    const short = arrange(chipRow('A', 'A'), 'Row', m3Catalog).project;
    expect(rectOf(short, 'C2').width).toBe(40);
    const long = arrange(
      chipRow('Texto bem comprido de um chip'),
      'Row',
      m3Catalog,
    ).project;
    expect(rectOf(long, 'C2').width).toBeGreaterThan(96);
    expect(rectOf(long, 'C2').width).toBeGreaterThan(rectOf(long, 'C1').width);
    expect(arrange(long, 'Row', m3Catalog).project).toBe(long);
  });

  it('filha hug com a geometria travada: Arrumar falha com locked', () => {
    const p = setMarkingLocked(chipRow('Um'), 'C2', true);
    expect(() => arrange(p, 'Row', m3Catalog)).toThrow('locked');
  });

  /** Coluna hug › cartão (altura hug) › botão: o texto de apoio do cartão decide a altura. */
  function cardScreen(body: string): Project {
    let p = m3Project();
    p = m3(p, 'Col', 'm3-column', box(20, 100, 360, 400), null);
    p = m3(p, 'Card', 'm3-card', box(20, 100, 360, 300), 'Col', {
      headline: 'Título',
      subhead: 'Sub',
      body,
    });
    p = m3(p, 'Ok', 'm3-button', box(40, 120, 80, 40), 'Card', { label: 'OK' });
    return p;
  }

  const SHORT = 'Texto curto.';
  const LONG =
    'Um texto de apoio bem mais longo, que precisa quebrar em várias linhas dentro do cartão para ' +
    'empurrar a altura dele e a da coluna para baixo, e junto com elas o que vem depois.';

  it('texto de apoio hug dentro de coluna hug: a altura do cartão e da coluna acompanham o texto', () => {
    const short = arrange(cardScreen(SHORT), 'Col', m3Catalog);
    const long = arrange(cardScreen(LONG), 'Col', m3Catalog);
    expect(short.warnings).toEqual([]);
    expect(long.warnings).toEqual([]);
    for (const { project } of [short, long]) {
      expectValid(project);
      const card = rectOf(project, 'Card');
      const col = rectOf(project, 'Col');
      const ok = rectOf(project, 'Ok');
      // a coluna é só o cartão (padding 0) e o cartão não muda de lugar nem de largura
      expect(col).toEqual({ ...card, width: col.width });
      expect(card).toMatchObject({ x: 20, y: 100, width: 360 });
      // o botão fica no canto inferior direito do cartão (padding 16, justify end)
      expect(ok.y + ok.height).toBe(card.y + card.height - 16);
      expect(ok.x + ok.width).toBe(card.x + card.width - 16);
    }
    const delta =
      rectOf(long.project, 'Card').height - rectOf(short.project, 'Card').height;
    // padding 16 + título 24 + subtítulo 20 + apoio (uma linha de 20) + botão 40 + três gaps de 8
    expect(rectOf(short.project, 'Card').height).toBe(160);
    expect(delta).toBeGreaterThan(40);
    expect(delta % 20).toBe(0);
    expect(rectOf(long.project, 'Col').height - rectOf(short.project, 'Col').height).toBe(
      delta,
    );
    // idempotente
    expect(arrange(short.project, 'Col', m3Catalog).project).toBe(short.project);
    expect(arrange(long.project, 'Col', m3Catalog).project).toBe(long.project);
  });
});
