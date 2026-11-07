// A anotação inteira como alvo do `ref` (etapa #679, CF3): o seletor do campo e da célula, o valor,
// a linha "Referenciada por" e o apagamento do alvo. O modelo (CF1) já resolve e valida.
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTableRow,
  removeAnnotation,
  setFieldValue,
  typeOfAnnotation,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { ListView } from '../../src/ui/ListView';
import { EditorContext } from '../../src/ui/EditorContext';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { TypedField } from '../../src/ui/TypedFields';
import { world } from '../model/refAnnotationFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

/** Um campo da lista AL (o `ref` `item`, `mix`… ou a tabela `itens`). */
function setupField(key: string, project: Project = world()) {
  const harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, 'AL');
    const field = typeOfAnnotation(p, annotation)?.type.fields.find((f) => f.key === key);
    if (!field) throw new Error(`campo ${key} não existe`);
    return (
      <TypedField
        field={field}
        project={p}
        annotation={annotation}
        readOnly={false}
        onGoToAnnotation={onGoToAnnotation}
      />
    );
  });
  return { harness, onGoToAnnotation, user: userEvent.setup() };
}

function setupEditor(id: string, project: Project) {
  const harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  renderLive(harness, (p) =>
    p.annotations.some((a) => a.id === id) ? (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, id)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={onGoToAnnotation}
        onShowLayer={vi.fn()}
        readOnly={false}
      />
    ) : null,
  );
  return { harness, onGoToAnnotation, user: userEvent.setup() };
}

const options = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('option')
    .map((o) => o.textContent ?? '');

describe('seletor de ref com accepts.annotations', () => {
  it('campo: lista as anotações aceitas com o rótulo e o tipo, sem a própria e sem tipos não aceitos', async () => {
    const { user } = setupField('item');
    await user.click(screen.getByRole('button', { name: /^Escolher: Item/i }));
    const dialog = await screen.findByRole('dialog');
    const texts = options(dialog);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toMatch(/^Cliente.*Modelo$/);
    expect(texts[1]).toMatch(/^Modelo.*Modelo$/);
    expect(texts[2]).toMatch(/^Avulso.*Avulso$/);
    // Nenhum alvo é "livre", a própria lista (AL) e o modelo de outra especialização (AX) não entram.
    expect(texts.join('|')).not.toMatch(/livre|Lista|Alheio/);
    expect(within(dialog).getByText('aceita: Modelo e Avulso')).toBeTruthy();
  });

  it('escolher grava { annotationId } numa entrada de desfazer', async () => {
    const { harness, user } = setupField('item');
    await user.click(screen.getByRole('button', { name: /^Escolher: Item/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('option', { name: /Avulso/ }));
    expect(annotationOf(harness.project(), 'AL').values?.item).toEqual({
      annotationId: 'AV',
    });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // O valor mostra o rótulo do alvo.
    expect(
      screen.getByRole('button', { name: /^Avulso .*: item/i }).textContent,
    ).toContain('Avulso');
    expect(harness.store.undo()).toBe(true);
    expect(annotationOf(harness.project(), 'AL').values?.item).toBeUndefined();
  });

  it('o filtro por tipo mostra só os alvos do tipo; as abas são Todos e um por tipo', async () => {
    const { user } = setupField('item');
    await user.click(screen.getByRole('button', { name: /^Escolher: Item/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Todos', 'Modelo', 'Avulso']);
    await user.click(within(dialog).getByRole('tab', { name: 'Avulso' }));
    expect(options(dialog)).toHaveLength(1);
    expect(options(dialog)[0]).toMatch(/^Avulso/);
    await user.click(within(dialog).getByRole('tab', { name: 'Modelo' }));
    expect(options(dialog)).toHaveLength(2);
  });

  it('com etiquetas e anotações, o filtro de etiqueta não pega a anotação e o de tipo sim', async () => {
    const { user } = setupField('mix');
    await user.click(screen.getByRole('button', { name: /^Escolher: Mix/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Todos', 'data-field', 'Modelo']);
    await user.click(within(dialog).getByRole('tab', { name: 'data-field' }));
    expect(options(dialog).join('|')).not.toMatch(/^Cliente(?!\.)|\|Modelo/);
    expect(options(dialog)).toHaveLength(2);
    await user.click(within(dialog).getByRole('tab', { name: 'Modelo' }));
    expect(options(dialog)).toHaveLength(2);
    expect(options(dialog).join('|')).not.toContain('Cliente.');
  });

  it('célula da tabela: o mesmo seletor, e escolher grava { annotationId } na célula', async () => {
    const { harness, user } = setupField(
      'itens',
      addTableRow(world(), 'AL', 'itens', 'L1'),
    );
    await user.click(screen.getByRole('button', { name: /^Escolher: Alvo/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('picker-compact');
    expect(options(dialog)).toHaveLength(3);
    await user.click(within(dialog).getByRole('option', { name: /Avulso/ }));
    const rows = annotationOf(harness.project(), 'AL').values?.itens as Record<
      string,
      unknown
    >[];
    expect(rows[0]?.alvo).toEqual({ annotationId: 'AV' });
  });

  it('alvo apagado: o valor mostra "(referência quebrada)" e a pendência', () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'item', { annotationId: 'AV' });
    p = removeAnnotation(p, 'AV');
    setupEditor('AL', p);
    const button = screen.getByRole('button', { name: /^Referência quebrada: item/i });
    expect(button.textContent).toContain('(referência quebrada)');
    expect(button.className).toContain('is-broken');
  });
});

describe('linha "Referenciada por"', () => {
  const pointing = () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'item', { annotationId: 'AM' });
    return setFieldValue(p, 'AL2', 'item', { annotationId: 'AM' });
  };

  it('aparece no alvo com cada origem (tipo · rótulo) e a marcação, num botão que a seleciona', async () => {
    const { onGoToAnnotation, user } = setupEditor('AM', pointing());
    const heading = screen.getByText('Referenciada por');
    const row = heading.closest('.annotation-referenced') as HTMLElement;
    expect(row).toBeTruthy();
    const buttons = within(row).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toContain('Lista');
    expect(buttons[0]?.getAttribute('aria-label') ?? buttons[0]?.title).toMatch(/Lista/);
    await user.click(buttons[1]!);
    expect(onGoToAnnotation).toHaveBeenCalledWith(expect.objectContaining({ id: 'AL2' }));
  });

  it('o grupo tem nome acessível', () => {
    setupEditor('AM', pointing());
    expect(screen.getByRole('group', { name: 'Referenciada por' })).toBeTruthy();
  });

  it('não aparece sem referência à anotação inteira', () => {
    setupEditor('AM', world());
    expect(screen.queryByText('Referenciada por')).toBeNull();
  });

  it('não aparece para referência de campo ou de linha (essas ficam onde estão)', () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'mix', { annotationId: 'AM', key: 'campos', rowId: 'R1' });
    setupEditor('AM', p);
    expect(screen.queryByText('Referenciada por')).toBeNull();
  });

  it('a origem que aponta duas vezes aparece uma só', () => {
    let p = pointing();
    p = setFieldValue(p, 'AL', 'mix', { annotationId: 'AM' });
    setupEditor('AM', p);
    const row = screen.getByText('Referenciada por').closest('.annotation-referenced');
    expect(within(row as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });
});

describe('Lista', () => {
  it('a coluna de conteúdo mostra o rótulo do alvo da anotação inteira', () => {
    const harness = createHarness(
      setFieldValue(world(), 'AL', 'item', { annotationId: 'AM' }),
    );
    render(
      <EditorContext.Provider value={harness.context}>
        <ListView onSelect={vi.fn()} />
      </EditorContext.Provider>,
    );
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('Lista'));
    expect(row?.textContent).toContain('Cliente');
    expect(row?.textContent).not.toContain('annotationId');
  });
});
