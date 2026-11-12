import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  modelMessage,
  canArrange,
  canFit,
  createMarking,
  fitMarking,
  arrangesByFit,
  loadSpecComponents,
  parseSpecText,
  setContainerDrawingMode,
  setFieldValue,
  setProjectDrawingMode,
  setMarkingLocked,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import {
  COMPONENTS,
  SPEC_ID,
  componentProject,
  testCatalog,
  tokenSlotCatalog,
} from './componentFixtures';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from './fitFixtures';
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
    expect(warnings.map((w) => w.text)).toContain(
      'Linha: conteúdo maior que o container',
    );
    // A terceira passaria de 400: é empurrada para dentro do container, com aviso.
    expect(rectOf(project, 'T3')).toEqual(box(300, 100, 100, 40));
    expect(warnings.map((w) => w.text)).toContain('T3: não cabe em Linha');
    expect(warnings).toContainEqual(
      modelMessage(
        'arrange.outside',
        { label: 'T3', where: 'Linha' },
        'T3: não cabe em Linha',
      ),
    );
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
    expect(warnings.map((w) => w.text)).toContain('Linha: não cabe em I1');
    expect(warnings.map((w) => w.text)).toContain('T2: não cabe em Linha');
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
    expect(warnings.map((w) => w.text)).toContain('Linha: não cabe em Pai');
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
    expect(warnings.some((w) => w.text.includes('não cabe'))).toBe(false);
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

describe('arrangeMarking: gap e padding do slot em $token (#948)', () => {
  const tokenCatalog = tokenSlotCatalog();
  const kids = [box(150, 150, 100, 40), box(150, 300, 100, 40)];

  function tokenProject(typeId: string, rect: Rect, at: Rect[] = kids): Project {
    let p = add(
      componentProject(),
      'C',
      typeId,
      rect,
      null,
      { name: 'Coluna' },
      tokenCatalog,
    );
    at.forEach((kid, i) => {
      p = add(p, `T${i + 1}`, 'text', kid, 'C', { name: `T${i + 1}` }, tokenCatalog);
    });
    return p;
  }

  it('grava as filhas com o gap e o padding do token do primeiro modo', () => {
    const p = tokenProject('column', box(100, 100, 300, 300));
    const { project } = arrange(p, 'C', tokenCatalog);
    expect(rectOf(project, 'T1')).toEqual(box(110, 110, 100, 40));
    expect(rectOf(project, 'T2')).toEqual(box(110, 154, 100, 40));
  });

  it('o modo do projeto e o do container mandam na tabela', () => {
    const base = tokenProject('column', box(100, 100, 300, 300));
    const dark = arrange(setProjectDrawingMode(base, 'dark'), 'C', tokenCatalog).project;
    expect(rectOf(dark, 'T1')).toEqual(box(120, 120, 100, 40));
    expect(rectOf(dark, 'T2')).toEqual(box(120, 172, 100, 40));
    const fixed = arrange(
      setContainerDrawingMode(base, 'I1', 'dark'),
      'C',
      tokenCatalog,
    ).project;
    expect(rectOf(fixed, 'T2')).toEqual(box(120, 172, 100, 40));
  });

  it('o hug do componente acompanha o gap e o padding do token', () => {
    const p = tokenProject('columnhug', box(100, 100, 200, 100), [
      box(110, 110, 100, 40),
      box(110, 150, 100, 40),
    ]);
    const { project } = arrange(p, 'C', tokenCatalog);
    // 10 + 40 + 4 + 40 + 10 de altura; 10 + 100 + 10 de largura.
    expect(rectOf(project, 'C')).toEqual(box(100, 100, 120, 104));
  });
});

const BIG = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'wide',
  name: 'wide',
  size: { width: 100, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [{ type: 'text', text: 'Grande', font: { size: 22, lineHeight: 28 } }],
  },
};

describe('arrangeMarking: align "baseline" no slot (MC1, decisão 4)', () => {
  /** `row` com `align: "baseline"` no slot e `wide` trocado por um texto de 22/28. */
  function baselineCatalog(): ComponentCatalog {
    const row = JSON.parse(JSON.stringify(COMPONENTS.row)) as {
      formatVersion: number;
      template: { children: { layout: { align: string } }[] };
    };
    row.formatVersion = 4;
    const slot = row.template.children[0];
    if (slot === undefined) throw new Error('sem slot');
    slot.layout.align = 'baseline';
    return testCatalog({ ...COMPONENTS, row, wide: BIG });
  }

  it('textos de 14 e 22 px ficam na mesma linha de base (a menor desce 7 px)', () => {
    const cat = baselineCatalog();
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100), null, {}, cat);
    p = add(p, 'W', 'wide', box(120, 150, 100, 40), 'C', {}, cat);
    p = add(p, 'T', 'text', box(240, 150, 100, 40), 'C', {}, cat);
    const { project } = arrange(p, 'C', cat);
    // linha de base do aproximado: 14/20 → 14,83; 22/28 → 21,59; diferença 6,76 → 7
    expect(rectOf(project, 'W').y).toBe(100);
    expect(rectOf(project, 'T').y).toBe(107);
    expect(rectOf(project, 'W').x).toBe(100);
    expect(rectOf(project, 'T').x).toBe(208);
    expectValid(project);
  });

  it('sem baseline, as filhas ficam no topo (o comportamento de hoje)', () => {
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100));
    p = add(p, 'T1', 'text', box(120, 150, 100, 40), 'C');
    p = add(p, 'T2', 'text', box(240, 150, 100, 40), 'C');
    const { project } = arrange(p, 'C');
    expect(rectOf(project, 'T1').y).toBe(100);
    expect(rectOf(project, 'T2').y).toBe(100);
  });

  it('um componente hug na altura mede o slot pela extensão da linha de base, não pelo filho mais alto', () => {
    const hug = JSON.parse(JSON.stringify(COMPONENTS.rowhug)) as {
      formatVersion: number;
      template: { children: { layout: { align: string } }[] };
    };
    hug.formatVersion = 4;
    const slot = hug.template.children[0];
    if (slot === undefined) throw new Error('sem slot');
    slot.layout.align = 'baseline';
    const cat = testCatalog({ ...COMPONENTS, rowhug: hug, wide: BIG });
    let p = add(componentProject(), 'C', 'rowhug', box(100, 100, 200, 60), null, {}, cat);
    p = add(p, 'W', 'wide', box(100, 100, 100, 40), 'C', {}, cat);
    p = add(p, 'T', 'text', box(200, 100, 100, 40), 'C', {}, cat);
    const { project } = arrange(p, 'C', cat);
    // 21,59 acima da linha de base + 25,17 abaixo (o texto de 14 desce 7): 46,76 → 47, não 40.
    expect(rectOf(project, 'C').height).toBe(47);
  });
});

describe('arrangeMarking: sizing por expressão no componente com slot (MC2, decisão 9)', () => {
  /** `row` com a altura pelo `spacing`: 8 → 64, 16 → 112, 24 → 152, 32 → hug. */
  function sizedCatalog(): ComponentCatalog {
    const row = JSON.parse(JSON.stringify(COMPONENTS.row)) as Record<string, unknown>;
    row.formatVersion = 4;
    row.sizing = {
      height: {
        $switch: 'spacing',
        cases: { '8': 64, '16': 112, '24': 152, '32': 'hug' },
      },
    };
    return testCatalog({ ...COMPONENTS, row });
  }

  function arranged(spacing: number): Rect {
    const cat = sizedCatalog();
    let p = add(componentProject(), 'C', 'row', box(100, 100, 300, 100), null, {}, cat);
    p = setFieldValue(p, 'A_C', 'spacing', spacing);
    p = add(p, 'T1', 'text', box(120, 120, 100, 40), 'C', {}, cat);
    return rectOf(arrange(p, 'C', cat).project, 'C');
  }

  it('o px que a expressão dá vira a altura do container', () => {
    expect(arranged(8).height).toBe(64);
    expect(arranged(16).height).toBe(112);
    expect(arranged(24).height).toBe(152);
    expect(arranged(8)).toMatchObject({ x: 100, y: 100, width: 300 });
  });

  it('hug vindo da expressão mede o conteúdo (o filho de 40 de altura)', () => {
    expect(arranged(32).height).toBe(40);
  });

  it('valor inválido deixa a altura como está e o arrumar segue', () => {
    expect(arranged(99).height).toBe(100);
  });
});

describe('arrangeMarking: eixo hug junto de eixo em px por expressão (/code-review high da MC2)', () => {
  it('o hug é medido na largura que a expressão dá, não na do retângulo antigo', () => {
    const text = JSON.parse(JSON.stringify(COMPONENTS.text)) as Record<string, unknown>;
    text.formatVersion = 4;
    const label = (text.template as { children: Record<string, unknown>[] }).children[0];
    if (label === undefined) throw new Error('sem texto');
    label.width = 'fill';
    // Largura 200 pela expressão (o campo `kind` vale `a`) e altura do conteúdo.
    text.sizing = { width: { $switch: 'kind', cases: { a: 200 } }, height: 'hug' };
    const cat = testCatalog({ ...COMPONENTS, text });
    let p = add(componentProject(), 'C', 'row', box(100, 100, 400, 100), null, {}, cat);
    p = add(p, 'T1', 'text', box(120, 120, 100, 40), 'C', {}, cat);
    p = setFieldValue(p, 'A_T1', 'label', 'aaaaaaaaaa bbbbbbbbbb');
    p = setFieldValue(p, 'A_T1', 'kind', 'a');
    const out = rectOf(arrange(p, 'C', cat).project, 'T1');
    // 21 caracteres cabem em uma linha a 200 de largura (≈ 162 px): a altura é o piso do minSize (24);
    // medida a 100 de largura (o retângulo antigo) seriam duas linhas (40).
    expect(out.width).toBe(200);
    expect(out.height).toBe(24);
  });
});

describe('fitMarking (MC3, decisão 14 da #898)', () => {
  const fcat = fitCatalog();
  const addFit = (
    p: Project,
    id: string,
    typeId: string,
    rect: Rect,
    parentId: string | null = null,
    extra: Partial<NewComponentArgs> = {},
  ): Project => add(p, id, typeId, rect, parentId, extra, fcat, FIT_SPEC_ID);
  const fit = (p: Project, id: string) => fitMarking(p, fcat, id, approximateMeasurer);
  /** Um botão `typeId` em (100, 100), com o rótulo dado, no tamanho de criação (120 × 40). */
  const withLabel = (typeId: string, label: string, rect = box(100, 100, 120, 40)) =>
    setFieldValue(addFit(fitProject(), 'B', typeId, rect), 'A_B', 'label', label);

  it('botão com rótulo longo cresce na altura; a posição e a largura ficam', () => {
    const p = withLabel('fit-button', LONG_LABEL);
    const fitted = fit(p, 'B');
    const rect = rectOf(fitted, 'B');
    expect(rect).toMatchObject({ x: 100, y: 100, width: 120 });
    // Quatro linhas de 20 mais o padding de 8 em cima e embaixo, inteiro para cima.
    expect(rect.height).toBeGreaterThanOrEqual(76);
    expect((rect.height - 16) % 20).toBe(0);
    expectValid(fitted);
  });

  it('rótulo que cabe (abaixo do minSize): nada muda, o mesmo Project', () => {
    const p = withLabel('fit-button', 'Ok');
    expect(fit(p, 'B')).toBe(p);
    // Depois de ajustado, ajustar de novo também não muda nada.
    const grown = withLabel('fit-button', LONG_LABEL);
    const once = fit(grown, 'B');
    expect(fit(once, 'B')).toBe(once);
  });

  it('o rótulo que encolhe leva a altura de volta (nunca abaixo do minSize)', () => {
    const grown = fit(withLabel('fit-button', LONG_LABEL), 'B');
    const shortened = setFieldValue(grown, 'A_B', 'label', 'Ok');
    expect(rectOf(fit(shortened, 'B'), 'B')).toMatchObject({ width: 120, height: 40 });
  });

  it('os dois eixos hug: a largura também é medida', () => {
    const p = withLabel('fit-hug', 'Ok');
    const rect = rectOf(fit(p, 'B'), 'B');
    expect(rect).toMatchObject({ x: 100, y: 100 });
    // "Ok" não passa do padding (16): o mínimo do componente (48 × 40) vale.
    expect(rect).toMatchObject({ width: 48, height: 40 });
  });

  it('CL2 (R13.13): hug nos dois eixos perto da borda mede a altura para a largura que sobra', () => {
    // A imagem tem 1000 de largura: de x = 900 sobram 100 px, e o rótulo longo quebra em linhas.
    const p = withLabel('fit-hug', LONG_LABEL, box(900, 100, 100, 40));
    const rect = rectOf(fit(p, 'B'), 'B');
    expect(rect).toMatchObject({ x: 900, y: 100, width: 100 });
    expect(rect.height).toBeGreaterThan(40);
    // Sem limite (x = 100), a largura fica livre: uma linha, altura do minSize.
    const free = rectOf(
      fit(withLabel('fit-hug', 'Ok', box(100, 100, 100, 40)), 'B'),
      'B',
    );
    expect(free).toMatchObject({ x: 100, y: 100, width: 48, height: 40 });
    // O Arrumar da mesma marcação (arrangesByFit) dá o mesmo caminho.
    expect(arrangesByFit(p, fcat, 'B')).toBe(true);
  });

  it('eixo fill, ausente ou esticado pelo stretch do pai não muda', () => {
    let p = addFit(fitProject(), 'R', 'fit-row-stretch', box(100, 100, 400, 100));
    p = addFit(p, 'B', 'fit-hug', box(100, 100, 120, 100), 'R');
    p = setFieldValue(p, 'A_B', 'label', LONG_LABEL);
    const rect = rectOf(fit(p, 'B'), 'B');
    // A altura é do `stretch` da linha (100) e não cresce com o rótulo; a largura (hug) muda.
    expect(rect.height).toBe(100);
    expect(rect.width).not.toBe(120);
    // Na linha que não estica, a altura também acompanha.
    let q = addFit(fitProject(), 'R', 'fit-row-start', box(100, 100, 400, 100));
    q = addFit(q, 'B', 'fit-button', box(100, 100, 120, 40), 'R');
    q = setFieldValue(q, 'A_B', 'label', LONG_LABEL);
    expect(rectOf(fit(q, 'B'), 'B').height).toBeGreaterThan(40);
  });

  it('L4: sizing max-content ajusta para a largura sem quebra, min-content para a palavra mais larga', () => {
    const max = rectOf(fit(withLabel('fit-max', LONG_LABEL), 'B'), 'B');
    // 52 caracteres de 7,7 px mais o padding de 8 dos dois lados, inteiro para cima; uma linha só.
    expect(max).toMatchObject({ x: 100, y: 100, width: 417, height: 40 });
    const min = rectOf(fit(withLabel('fit-min', LONG_LABEL), 'B'), 'B');
    // "bastante" (8 caracteres) é a palavra mais larga: 61,6 + 16, inteiro para cima.
    expect(min.width).toBe(78);
    expect(min.height).toBeGreaterThan(40);
    expect(arrangesByFit(withLabel('fit-max', LONG_LABEL), fcat, 'B')).toBe(true);
  });

  it('o maxHeight da raiz limita o ajuste', () => {
    const p = withLabel('fit-capped', LONG_LABEL);
    expect(rectOf(fit(p, 'B'), 'B').height).toBe(60);
  });

  it('o sizing por expressão vale o px, nunca abaixo do minSize', () => {
    const tall = setFieldValue(withLabel('fit-px', 'Ok'), 'A_B', 'tall', 'sim');
    expect(rectOf(fit(tall, 'B'), 'B').height).toBe(80);
    // Sem o campo a expressão dá 30, abaixo do mínimo (40): a marcação já está nele.
    const short = withLabel('fit-px', 'Ok');
    expect(fit(short, 'B')).toBe(short);
  });

  it('não passa da imagem: o excesso é cortado', () => {
    const p = withLabel('fit-button', LONG_LABEL, box(100, 740, 120, 40));
    expect(rectOf(fit(p, 'B'), 'B')).toMatchObject({ y: 740, height: 60 });
  });

  it('geometria travada falha com locked (e nada muda se já está no tamanho)', () => {
    const p = setMarkingLocked(withLabel('fit-button', LONG_LABEL), 'B', true);
    expect(() => fit(p, 'B')).toThrow('locked');
    const same = setMarkingLocked(withLabel('fit-button', 'Ok'), 'B', true);
    expect(fit(same, 'B')).toBe(same);
  });

  it('componente sem eixo ajustável, marcação sem componente e container com filhas: not-fittable', () => {
    const plain = addFit(fitProject(), 'B', 'fit-plain', box(100, 100, 120, 40));
    expect(() => fit(plain, 'B')).toThrow('not-fittable');
    const filled = addFit(fitProject(), 'B', 'fit-fill', box(100, 100, 120, 40));
    expect(() => fit(filled, 'B')).toThrow('not-fittable');
    const bare = createMarking(fitProject(), {
      id: 'P',
      containerId: 'I1',
      rect: box(10, 10, 50, 50),
    });
    expect(() => fit(bare, 'P')).toThrow('not-fittable');
    let row = addFit(fitProject(), 'R', 'fit-row-start', box(100, 100, 400, 100));
    row = addFit(row, 'B', 'fit-button', box(100, 100, 120, 40), 'R');
    expect(() => fit(row, 'R')).toThrow('not-fittable');
    expect(() => fit(plain, 'nada')).toThrow('not-found');
  });

  it('componente com filhas no slot, mesmo com layout none, não se ajusta (achado do /code-review)', () => {
    let p = addFit(fitProject(), 'R', 'fit-row-none', box(100, 100, 400, 100));
    p = addFit(p, 'B', 'fit-button', box(110, 110, 120, 40), 'R');
    expect(canFit(p, fcat, 'R')).toBe(false);
    expect(() => fit(p, 'R')).toThrow('not-fittable');
  });

  it('canFit: só o componente sem slot com eixo ajustável', () => {
    const p = addFit(fitProject(), 'B', 'fit-button', box(100, 100, 120, 40));
    expect(canFit(p, fcat, 'B')).toBe(true);
    const plain = addFit(fitProject(), 'B', 'fit-plain', box(100, 100, 120, 40));
    expect(canFit(plain, fcat, 'B')).toBe(false);
    expect(canFit(p, fcat, 'nada')).toBe(false);
    let row = addFit(fitProject(), 'R', 'fit-row-start', box(100, 100, 400, 100));
    row = addFit(row, 'B', 'fit-button', box(100, 100, 120, 40), 'R');
    expect(canFit(row, fcat, 'R')).toBe(false);
  });

  it('assenta ao fim: a marcação que passou a caber dentro vira filha', () => {
    let p = withLabel('fit-button', LONG_LABEL);
    p = createMarking(p, { id: 'S', containerId: 'I1', rect: box(110, 145, 20, 10) });
    expect(marking(p, 'S').parentId).toBeNull();
    expect(marking(fit(p, 'B'), 'S').parentId).toBe('B');
  });

  it('as prévias de gesto não assentam (settle: false)', () => {
    let p = withLabel('fit-button', LONG_LABEL);
    p = createMarking(p, { id: 'S', containerId: 'I1', rect: box(110, 145, 20, 10) });
    const result = fitMarking(p, fcat, 'B', approximateMeasurer, { settle: false });
    expect(marking(result, 'S').parentId).toBeNull();
  });
});

describe('arrangeMarking: wrap no slot (MC4, decisão 12)', () => {
  /** O container `row` (ou `rowhug`) com o slot em `wrap`, mais as chaves dadas, na formatVersion 4. */
  function wrapCatalog(
    layout: Record<string, unknown>,
    id: 'row' | 'rowhug' = 'row',
  ): ComponentCatalog {
    const base = JSON.parse(JSON.stringify(COMPONENTS[id])) as {
      formatVersion: number;
      template: { children: { layout: Record<string, unknown> }[] };
    };
    base.formatVersion = 4;
    const slot = base.template.children[0];
    if (slot === undefined) throw new Error('sem slot');
    slot.layout = { ...slot.layout, wrap: 'wrap', lineGap: 12, ...layout };
    return testCatalog({ ...COMPONENTS, [id]: base });
  }

  /** Cinco filhas `text` de 100 × 40 empilhadas (sem se tocar) no container 320 × 300. */
  function crowd(cat: ComponentCatalog, id: 'row' | 'rowhug' = 'row'): Project {
    let p = add(componentProject(), 'C', id, box(100, 100, 320, 300), null, {}, cat);
    for (let i = 1; i <= 5; i++)
      p = add(p, `T${i}`, 'text', box(100, 100 + (i - 1) * 45, 100, 40), 'C', {}, cat);
    return p;
  }

  it('Arrumar põe as filhas em linhas: 3 + 2, com o gap e o lineGap', () => {
    const cat = wrapCatalog({});
    const { project, warnings } = arrange(crowd(cat), 'C', cat);
    expect([1, 2, 3].map((i) => rectOf(project, `T${i}`))).toEqual([
      box(100, 100, 100, 40),
      box(208, 100, 100, 40),
      box(316, 100, 100, 40),
    ]);
    expect([4, 5].map((i) => rectOf(project, `T${i}`))).toEqual([
      box(100, 152, 100, 40),
      box(208, 152, 100, 40),
    ]);
    expect(warnings).toEqual([]);
    expectValid(project);
  });

  it('wrap-reverse: a linha nova fica acima', () => {
    const cat = wrapCatalog({ wrap: 'wrap-reverse' });
    const { project } = arrange(crowd(cat), 'C', cat);
    expect(rectOf(project, 'T1').y).toBe(152);
    expect(rectOf(project, 'T4').y).toBe(100);
  });

  it('justify space-between e reverse valem em cada linha', () => {
    const between = wrapCatalog({ justify: 'space-between' });
    const a = arrange(crowd(between), 'C', between).project;
    expect([1, 2, 3].map((i) => rectOf(a, `T${i}`).x)).toEqual([100, 210, 320]);
    expect([4, 5].map((i) => rectOf(a, `T${i}`).x)).toEqual([100, 320]);
    const reversed = wrapCatalog({ reverse: true });
    const b = arrange(crowd(reversed), 'C', reversed).project;
    expect([1, 2, 3].map((i) => rectOf(b, `T${i}`).x)).toEqual([320, 212, 104]);
    expect([4, 5].map((i) => rectOf(b, `T${i}`).x)).toEqual([320, 212]);
  });

  it('maxPerLine 2 e maxLines 2: a quinta filha, além da última linha, fica onde estava', () => {
    const cat = wrapCatalog({ maxPerLine: 2, maxLines: 2 });
    const { project } = arrange(crowd(cat), 'C', cat);
    expect([1, 2, 3, 4].map((i) => rectOf(project, `T${i}`).y)).toEqual([
      100, 100, 152, 152,
    ]);
    expect(rectOf(project, 'T5')).toEqual(box(100, 280, 100, 40));
  });

  it('um componente hug na altura cresce com as linhas (a soma das linhas com o lineGap)', () => {
    const cat = wrapCatalog({}, 'rowhug');
    const { project } = arrange(crowd(cat, 'rowhug'), 'C', cat);
    expect(rectOf(project, 'C').height).toBe(40 + 12 + 40);
    expect(rectOf(project, 'T5').y).toBe(152);
  });

  it('as linhas que não cabem na altura do container avisam "conteúdo maior que o container"', () => {
    const cat = wrapCatalog({ lineGap: 300 });
    const { warnings } = arrange(crowd(cat), 'C', cat);
    expect(warnings.map((w) => w.text)).toContain(
      'Tipo row: conteúdo maior que o container',
    );
  });
});
