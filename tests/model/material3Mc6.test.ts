// MC6 (#1034, etapa #898): a biblioteca Material 3 (Compose) quebra em linhas onde o Compose quebra e mede pelo
// conteúdo onde o Compose mede (decisões 21 e 22): o `flow-row` com `wrap`, `lineGap` (`verticalSpacing`),
// `maxPerLine` (`maxItemsInEachRow`) e `maxLines`; os botões do `alert-dialog` com `wrap-reverse` (o
// `AlertDialogFlowRow`: o confirmar fica acima quando não cabe) e a largura do `dropdown-menu` pelo item mais
// largo (`IntrinsicSize.Max`), entre 112 e 280. Os testes foram vistos falhando antes da biblioteca mudar.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  loadSpecComponents,
  type ComponentCatalog,
  type Project,
  type Rect,
} from '../../src/model';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { emptyProject } from './fixtures';
import { SPEC_FILE, files, spec, text } from '../support/material3Library';
import { drawFitted, fittedSize, templateNodes } from '../support/material3Fitted';
import type { Mode, Values } from '../support/material3Fitted';

const MODES: Mode[] = ['light', 'dark'];
/** Como o ajuste arredonda: para cima, sem deixar o ruído de ponto flutuante subir um px. */
const ceilFit = (value: number): number => Math.ceil(value - 1e-6);
type Drawing = ReturnType<typeof drawFitted>['drawing'];

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const boxOf = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`nó ausente: ${name}`);
  return absoluteBoxes(d.root).get(node.id)!;
};

describe('MC6 flow-row — o Arrumar quebra as filhas em linhas (FlowLayout.kt)', () => {
  const catalog: ComponentCatalog = new Map([
    [
      spec.id,
      loadSpecComponents(spec, SPEC_FILE, spec.version, (path) => {
        const body = text(path);
        return body === '' ? undefined : body;
      }),
    ],
  ]);
  const rect = (x: number, y: number, width: number, height: number): Rect => ({
    x,
    y,
    width,
    height,
  });

  /** O container com um flow-row `F` (360 de largura) e cinco `image` de 100 × 40, desalinhados, dentro dele. */
  function crowd(values: Record<string, number | string> = {}): Project {
    let p = applySpecialization(emptyProject(), spec, {
      newId: (() => {
        let n = 0;
        return () => `LM${++n}`;
      })(),
      packageSpecName: 'material3-compose.spec.json',
    });
    p = addContainer(p, { id: 'I1', file: 'images/tela.png', width: 1000, height: 800 });
    const args = { containerId: 'I1', specId: spec.id } as const;
    p = addComponentMarking(
      p,
      catalog,
      {
        ...args,
        markingId: 'F',
        annotationId: 'A_F',
        parentId: null,
        typeId: 'flow-row',
        rect: rect(100, 100, 360, 300),
        values: { spacing: 8, verticalSpacing: 12, ...values },
      },
      approximateMeasurer,
    );
    for (let i = 1; i <= 5; i++) {
      p = addComponentMarking(
        p,
        catalog,
        {
          ...args,
          markingId: `K${i}`,
          annotationId: `A_K${i}`,
          parentId: 'F',
          typeId: 'image',
          rect: rect(100 + (i - 1) * 10, 100 + (i - 1) * 10, 100, 40),
        },
        approximateMeasurer,
      );
    }
    return p;
  }
  const arranged = (values?: Record<string, number | string>) =>
    arrangeMarking(crowd(values), catalog, 'F', approximateMeasurer);
  const at = (p: Project, id: string): Rect => p.markings.find((m) => m.id === id)!.rect;

  it('cinco filhas de 100 numa largura de 360 dão 3 + 2 linhas, com o spacing e o verticalSpacing', () => {
    const { project, warnings } = arranged();
    expect([1, 2, 3].map((i) => at(project, `K${i}`))).toEqual([
      rect(100, 100, 100, 40),
      rect(208, 100, 100, 40),
      rect(316, 100, 100, 40),
    ]);
    expect([4, 5].map((i) => at(project, `K${i}`))).toEqual([
      rect(100, 152, 100, 40),
      rect(208, 152, 100, 40),
    ]);
    expect(warnings).toEqual([]);
  });

  it('o verticalSpacing é o espaço entre as linhas', () => {
    const { project } = arranged({ verticalSpacing: 30 });
    expect(at(project, 'K4').y).toBe(100 + 40 + 30);
    expect(at(project, 'K1').y).toBe(100);
  });

  it('maxItemsInEachRow 2 dá 2 + 2 + 1', () => {
    const { project } = arranged({ maxItemsInEachRow: 2 });
    expect([1, 2, 3, 4, 5].map((i) => at(project, `K${i}`).y)).toEqual([
      100, 100, 152, 152, 204,
    ]);
    expect([1, 2, 3, 4, 5].map((i) => at(project, `K${i}`).x)).toEqual([
      100, 208, 100, 208, 100,
    ]);
  });

  it('maxLines 2 deixa a quinta filha, além da última linha, onde estava', () => {
    const { project } = arranged({ maxItemsInEachRow: 2, maxLines: 2 });
    expect([1, 2, 3, 4].map((i) => at(project, `K${i}`).y)).toEqual([100, 100, 152, 152]);
    expect(at(project, 'K5')).toEqual(rect(140, 140, 100, 40));
  });

  it('o flow-row é hug na altura e cresce com as linhas (40 + 12 + 40)', () => {
    const { project } = arranged();
    expect(at(project, 'F').height).toBe(92);
    expect(at(project, 'F').width).toBe(360);
  });

  it('o passo R17.34: cinco fab de 56 numa flow-row de 200 × 100 dão 3 + 2 e a altura 124', () => {
    // a mesma peça do roteiro: o fr de 200 × 100 com cinco fab desalinhados dentro dele
    let p = applySpecialization(emptyProject(), spec, {
      newId: (() => {
        let n = 0;
        return () => `LF${++n}`;
      })(),
      packageSpecName: 'material3-compose.spec.json',
    });
    p = addContainer(p, { id: 'I1', file: 'images/tela.png', width: 400, height: 700 });
    const args = { containerId: 'I1', specId: spec.id, parentId: null } as const;
    p = addComponentMarking(
      p,
      catalog,
      {
        ...args,
        markingId: 'F',
        annotationId: 'A_F',
        typeId: 'flow-row',
        rect: rect(10, 540, 200, 100),
        values: { spacing: 8, verticalSpacing: 12 },
      },
      approximateMeasurer,
    );
    for (let n = 1; n <= 5; n++)
      p = addComponentMarking(
        p,
        catalog,
        {
          ...args,
          parentId: 'F',
          markingId: `K${n}`,
          annotationId: `A_K${n}`,
          typeId: 'fab',
          rect: rect(12 + 10 * (n - 1), 542 + 10 * (n - 1), 56, 56),
        },
        approximateMeasurer,
      );
    expect(p.markings.filter((m) => m.parentId === 'F')).toHaveLength(5);
    const { project } = arrangeMarking(p, catalog, 'F', approximateMeasurer);
    expect(
      [1, 2, 3, 4, 5].map((i) => [at(project, `K${i}`).x, at(project, `K${i}`).y]),
    ).toEqual([
      [10, 540],
      [74, 540],
      [138, 540],
      [10, 608],
      [74, 608],
    ]);
    expect(at(project, 'F')).toEqual(rect(10, 540, 200, 124));
  });

  it('a Fidelidade deixa de dizer que o slot é uma row sem quebra', () => {
    const doc = text('docs/flow-row.md');
    expect(doc).not.toMatch(/sem quebra de linha/);
    expect(doc).toMatch(/`wrap`/);
  });
});

describe('MC6 alert-dialog — os botões quebram como o AlertDialogFlowRow (AlertDialog.kt)', () => {
  const base = {
    style: 'standard',
    title: 'Descartar rascunho?',
    text: 'O rascunho será apagado e não poderá ser recuperado.',
    icon: '',
  };
  const LONG = {
    ...base,
    confirmButton: 'Descartar o rascunho agora',
    dismissButton: 'Cancelar',
  };

  it.each(MODES)(
    'com rótulos longos o confirmar vai para a linha de cima, à direita, sem aviso (%s)',
    (mode) => {
      const { drawing } = drawFitted('alert-dialog', LONG, mode);
      expect(drawing.warnings).toEqual([]);
      const dismiss = boxOf(drawing, 'dispensar');
      const confirm = boxOf(drawing, 'confirmar');
      const row = boxOf(drawing, 'botões');
      // cada botão (40) está centrado no seu quadro `área de toque` de 48; entre as linhas, 12
      expect(dismiss.y - confirm.y).toBe(48 + 12);
      expect(confirm.y).toBe(row.y + 4);
      expect(confirm.x + confirm.width).toBeCloseTo(row.x + row.width, 5);
      expect(dismiss.x + dismiss.width).toBeCloseTo(row.x + row.width, 5);
      expect(row.height).toBe(48 + 12 + 48);
    },
  );

  it('o diálogo com rótulos longos tem a altura das duas linhas de botões', () => {
    const short = fittedSize('alert-dialog', {
      ...base,
      confirmButton: 'Descartar',
      dismissButton: 'Cancelar',
    });
    const long = fittedSize('alert-dialog', LONG);
    expect(long.height - short.height).toBe(48 + 12 + 48 - 48);
    expect(long.messages.map((m) => m.text)).toEqual([]);
  });

  it('cada botão tem o quadro "área de toque" com nome próprio, de 48 no mínimo', () => {
    for (const name of ['dispensar', 'confirmar']) {
      const wrapper = templateNodes('alert-dialog', `área de toque (${name})`);
      expect(wrapper, name).toHaveLength(1);
      expect([wrapper[0]?.height, wrapper[0]?.minHeight]).toEqual(['hug', 48]);
    }
  });

  it('com rótulos curtos os botões continuam na mesma linha, cancelar antes do confirmar', () => {
    const { drawing } = drawFitted('alert-dialog', {
      ...base,
      confirmButton: 'Descartar',
      dismissButton: 'Cancelar',
    });
    const dismiss = boxOf(drawing, 'dispensar');
    const confirm = boxOf(drawing, 'confirmar');
    expect(confirm.y).toBe(dismiss.y);
    expect(dismiss.x + dismiss.width + 8).toBeCloseTo(confirm.x, 5);
  });

  it('o exemplo "Botões em duas linhas" existe e desenha sem aviso', () => {
    const catalog = buildCatalog(files);
    const example = findEntry(catalog, 'alert-dialog')?.examples.find(
      (e) => e.name === 'Botões em duas linhas',
    );
    expect(example).toBeDefined();
    for (const mode of MODES) {
      const { drawing } = drawFitted('alert-dialog', example!.values ?? {}, mode);
      expect(drawing.warnings).toEqual([]);
      expect(boxOf(drawing, 'confirmar').y).toBeLessThan(boxOf(drawing, 'dispensar').y);
    }
  });
});

describe('MC6 dropdown-menu — a largura pelo item mais largo, entre 112 e 280 (Menu.kt, IntrinsicSize.Max)', () => {
  const item = (label: string, extra: Record<string, string> = {}) => ({
    text: label,
    leadingIcon: '',
    trailingIcon: '',
    enabled: 'true',
    selected: 'false',
    ...extra,
  });
  const menu = (items: ReturnType<typeof item>[], extra: Values = {}): Values =>
    ({ style: 'menu', expanded: 'true', items, ...extra }) as unknown as Values;
  /** A largura do texto de um item no medidor aproximado (label-large 14/20, peso 500, 0,1 de tracking). */
  const textWidth = (label: string): number =>
    approximateMeasurer(
      label,
      {
        family: 'sans',
        size: 14,
        weight: 500,
        italic: false,
        lineHeight: 20,
        letterSpacing: 0.1,
      },
      undefined,
    ).width;

  it('o sizing.width é hug no menu e fill no campo exposto', () => {
    const entry = findEntry(buildCatalog(files), 'dropdown-menu')!;
    const sizing = entry.component!.sizing as { width: unknown };
    expect(sizing.width).toMatchObject({
      $if: { $eq: ['style', 'exposed'] },
      then: 'fill',
      else: 'hug',
    });
  });

  it('a largura é a do item mais largo mais os 12 de cada lado e o ícone à esquerda', () => {
    const items = [
      item('Editar', { leadingIcon: 'Edit' }),
      item('Compartilhar com a equipe', { leadingIcon: 'Share' }),
    ];
    const fit = fittedSize('dropdown-menu', menu(items));
    expect(fit.width).toBe(
      ceilFit(textWidth('Compartilhar com a equipe') + 12 + 24 + 12 + 12),
    );
    expect(fit.width).toBeGreaterThan(112);
    expect(fit.width).toBeLessThan(280);
  });

  it('a largura do ícone à direita também conta (24 e 12 de afastamento)', () => {
    const items = [item('Salvar', { trailingIcon: 'Check' })];
    const fit = fittedSize('dropdown-menu', menu(items));
    // 12 + texto + 12 + 24 + 12 = 60 + o texto, mas nunca menos que 112
    expect(fit.width).toBe(
      Math.max(112, ceilFit(textWidth('Salvar') + 12 + 12 + 24 + 12)),
    );
  });

  it('nunca fica abaixo de 112 nem passa de 280', () => {
    expect(fittedSize('dropdown-menu', menu([item('Ok')])).width).toBe(112);
    const long = fittedSize(
      'dropdown-menu',
      menu([
        item(
          'Um item com um texto muito mais comprido do que cabe em duzentos e oitenta pixels',
          { leadingIcon: 'Edit' },
        ),
        item('Excluir'),
      ]),
    );
    expect(long.width).toBeLessThanOrEqual(280);
    expect(long.width).toBeGreaterThan(200);
  });

  it.each(MODES)(
    'no tamanho ajustado todos os itens têm a largura do menu e o texto longo cresce na altura, sem aviso (%s)',
    (mode) => {
      const values = menu([
        item('Editar', { leadingIcon: 'Edit' }),
        item(
          'Um item com um texto muito mais comprido do que cabe em duzentos e oitenta pixels',
          { trailingIcon: 'Check' },
        ),
      ]);
      const { drawing, box } = drawFitted('dropdown-menu', values, mode);
      expect(drawing.warnings).toEqual([]);
      const menuBox = boxOf(drawing, 'menu');
      expect(menuBox.width).toBe(box.width);
      const items = [...walk(drawing.root)].filter((n) => n.name === 'item' && n.visible);
      expect(items).toHaveLength(2);
      for (const node of items)
        expect(absoluteBoxes(drawing.root).get(node.id)!.width).toBe(box.width);
      expect(absoluteBoxes(drawing.root).get(items[1]!.id)!.height).toBeGreaterThan(48);
    },
  );

  it('o campo exposto continua com a largura da marcação (fill), sem ajustar a largura', () => {
    const fit = fittedSize('dropdown-menu', {
      style: 'exposed',
      expanded: 'true',
      label: 'País',
      value: 'Brasil',
      items: [
        item('Um texto de item que, sozinho, passaria dos 200 de largura do campo'),
      ],
    } as unknown as Values);
    expect(fit.width).toBe(200);
  });

  it('o exemplo "Itens de larguras diferentes" existe e desenha sem aviso, no size e ajustado', () => {
    const catalog = buildCatalog(files);
    const example = findEntry(catalog, 'dropdown-menu')?.examples.find(
      (e) => e.name === 'Itens de larguras diferentes',
    );
    expect(example).toBeDefined();
    for (const mode of MODES) {
      expect(
        drawFitted('dropdown-menu', example!.values ?? {}, mode).drawing.warnings,
      ).toEqual([]);
    }
  });
});
