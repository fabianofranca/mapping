import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { cadastroProject } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(annotationId: string, project: Project = cadastroProject()) {
  const harness: Harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  const onShowLayer = vi.fn();
  renderLive(harness, (p) =>
    // Como no painel: excluída a anotação, o editor deixa de existir.
    p.annotations.some((a) => a.id === annotationId) ? (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, annotationId)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={onGoToAnnotation}
        onShowLayer={onShowLayer}
        readOnly={harness.store.readOnly.value}
      />
    ) : null,
  );
  return { harness, onGoToAnnotation, onShowLayer, user: userEvent.setup() };
}

describe('AnnotationEditor — anotação livre', () => {
  it('mostra o nome e os pares da anotação', () => {
    setup('AU');
    expect(screen.getByLabelText('Nome da anotação')).toHaveProperty('value', 'User');
    const keys = screen
      .getAllByLabelText('Chave')
      .map((i) => (i as HTMLInputElement).value);
    const values = screen
      .getAllByLabelText('Valor')
      .map((i) => (i as HTMLInputElement).value);
    expect(keys).toEqual(['name', 'age']);
    expect(values).toEqual(['string', 'number']);
  });

  it('renomeia a anotação ao confirmar', async () => {
    const { harness, user } = setup('AU');
    const name = screen.getByLabelText('Nome da anotação');
    await user.clear(name);
    await user.type(name, 'Usuário{Enter}');
    expect(annotationOf(harness.project(), 'AU').name).toBe('Usuário');
  });

  it('edita o valor de um par pelo id da tupla', async () => {
    const { harness, user } = setup('AU');
    const [, second] = screen.getAllByLabelText('Valor');
    if (!second) throw new Error('sem segundo par');
    await user.clear(second);
    await user.type(second, 'integer{Enter}');
    const entries = annotationOf(harness.project(), 'AU').entries;
    expect(entries.map((e) => [e.id, e.key, e.value])).toEqual([
      ['EN', 'name', 'string'],
      ['EA', 'age', 'integer'],
    ]);
  });

  it('adiciona um par novo só depois de ter chave', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: '+ Par' }));
    const keys = screen.getAllByLabelText('Chave');
    expect(keys).toHaveLength(3);
    const key = keys[2];
    if (!key) throw new Error('sem campo novo');
    expect(annotationOf(harness.project(), 'AU').entries).toHaveLength(2);
    await user.type(key, 'email{Enter}');
    const entries = annotationOf(harness.project(), 'AU').entries;
    expect(entries.map((e) => e.key)).toEqual(['name', 'age', 'email']);
  });

  it('chave repetida mostra o erro e não grava', async () => {
    const { harness, user } = setup('AU');
    const [first] = screen.getAllByLabelText('Chave');
    if (!first) throw new Error('sem par');
    await user.clear(first);
    await user.type(first, 'age{Enter}');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'name',
      'age',
    ]);
  });

  it('reordena os pares com os botões', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getAllByRole('button', { name: 'Descer par' })[0]!);
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.id)).toEqual([
      'EA',
      'EN',
    ]);
  });

  it('remove um par sem referências direto, sem confirmação', async () => {
    const { harness, user } = setup('AU');
    // EA tem a referência de AII; remove pelo par novo (sem referências).
    await user.click(screen.getByRole('button', { name: '+ Par' }));
    const key = screen.getAllByLabelText('Chave')[2];
    if (!key) throw new Error('sem campo novo');
    await user.type(key, 'tmp{Enter}');
    const removes = screen.getAllByRole('button', { name: 'Remover par' });
    await user.click(removes[2]!);
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'name',
      'age',
    ]);
  });

  it('remover um par que é alvo de referência pede confirmação', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getAllByRole('button', { name: 'Remover par' })[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Referências vão quebrar')).toBeTruthy();
    // Cancelar mantém o par.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(annotationOf(harness.project(), 'AU').entries).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Remover par' })[0]!);
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: 'Excluir' }));
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.id)).toEqual([
      'EA',
    ]);
  });

  it('mostra quem referencia cada par e vai até a origem', async () => {
    const { onGoToAnnotation, user } = setup('AU');
    const backlink = screen.getAllByRole('button', { name: /^← / })[0];
    if (!backlink) throw new Error('sem backlink');
    await user.click(backlink);
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
    expect(onGoToAnnotation.mock.calls[0]?.[0]).toMatchObject({ id: 'AIN' });
  });

  it('somente leitura desabilita a edição', () => {
    const harness = createHarness(cadastroProject(), true);
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, 'AU')}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly
      />
    ));
    expect(screen.getByLabelText('Nome da anotação')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '+ Par' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('AnnotationEditor — anotação tipada', () => {
  it('mostra os campos do tipo e grava o valor de um campo de texto', async () => {
    const { harness, user } = setup('AB');
    const id = screen.getByLabelText('id');
    expect(id).toHaveProperty('value', 'btn_cadastrar');
    await user.clear(id);
    await user.type(id, 'btn_enviar{Enter}');
    expect(annotationOf(harness.project(), 'AB').values?.['id']).toBe('btn_enviar');
  });

  it('campo obrigatório vazio aparece como pendência', async () => {
    setup('AT');
    expect(screen.getAllByTitle('obrigatório').length).toBeGreaterThan(0);
  });

  it('oferece criar o filho permitido pelo tipo', async () => {
    const { harness, user, onGoToAnnotation } = setup('AB');
    const before = harness.project().annotations.length;
    await user.click(screen.getByRole('button', { name: /^\+ onChange|^\+ onClick/ }));
    expect(harness.project().annotations.length).toBe(before + 1);
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
  });

  it('excluir uma anotação que é alvo de referência pede confirmação', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: 'Excluir anotação' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(harness.project().annotations.some((a) => a.id === 'AU')).toBe(false);
  });
});
