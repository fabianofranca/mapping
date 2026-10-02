import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { typeOfAnnotation, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypedField } from '../../src/ui/TypedFields';
import { cadastroProject } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

/** Renderiza um campo (`fieldKey`) da anotação tipada `annotationId`. */
function setup(
  annotationId: string,
  fieldKey: string,
  project: Project = cadastroProject(),
) {
  const harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, annotationId);
    const field = typeOfAnnotation(p, annotation)?.type.fields.find(
      (f) => f.key === fieldKey,
    );
    if (!field) throw new Error(`campo ${fieldKey} não existe`);
    return (
      <TypedField
        field={field}
        project={p}
        annotation={annotation}
        actions={harness.actions}
        readOnly={false}
        onGoToAnnotation={onGoToAnnotation}
      />
    );
  });
  return { harness, onGoToAnnotation, user: userEvent.setup() };
}

const valueOf = (h: { project(): Project }, id: string, key: string) =>
  annotationOf(h.project(), id).values?.[key];

describe('TypedFields — campos simples', () => {
  it('número: aceita vírgula decimal e rejeita texto', async () => {
    const { harness, user } = setup('AII', 'maxLength');
    const before = valueOf(harness, 'AII', 'maxLength');
    const input = screen.getByLabelText('maxLength');
    await user.type(input, 'abc{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('número');
    expect(valueOf(harness, 'AII', 'maxLength')).toEqual(before);

    await user.clear(input);
    await user.type(input, '12,5{Enter}');
    expect(valueOf(harness, 'AII', 'maxLength')).toBe(12.5);
  });

  it('opções (poucas): botões segmentados; tocar de novo na escolhida limpa', async () => {
    const { harness, user } = setup('AB', 'estilo');
    const group = screen.getByRole('group', { name: 'estilo' });
    const secondary = within(group).getByRole('button', { name: 'secondary' });
    await user.click(secondary);
    expect(valueOf(harness, 'AB', 'estilo')).toBe('secondary');
    expect(secondary.getAttribute('aria-pressed')).toBe('true');
    await user.click(secondary);
    expect(valueOf(harness, 'AB', 'estilo')).toBeNull();
  });

  it('opções (muitas): lista de seleção', async () => {
    const { harness, user } = setup('AIE', 'tipo');
    const select = screen.getByLabelText('tipo');
    expect(select).toHaveProperty('value', 'email');
    await user.selectOptions(select, 'phone');
    expect(valueOf(harness, 'AIE', 'tipo')).toBe('phone');
  });
});

describe('TypedFields — referência (ref)', () => {
  it('mostra o alvo atual e os botões', () => {
    setup('AIN', 'dado');
    expect(screen.getByText(/^→ /).textContent).toContain('name');
    expect(screen.getByRole('button', { name: 'Escolher' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Limpar' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.getByRole('button', { name: 'Ir para o alvo' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('Ir para o alvo navega até a anotação apontada', async () => {
    const { onGoToAnnotation, user } = setup('AIN', 'dado');
    await user.click(screen.getByRole('button', { name: 'Ir para o alvo' }));
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
    expect(onGoToAnnotation.mock.calls[0]?.[0]).toMatchObject({ id: 'AU' });
  });

  it('Limpar remove a referência', async () => {
    const { harness, user } = setup('AIN', 'dado');
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(valueOf(harness, 'AIN', 'dado')).toBeNull();
    expect(screen.getByText('Nenhum alvo escolhido.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Limpar' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('o seletor lista só os alvos aceitos (tupla livre e linha do tipo com a tag)', async () => {
    const { user } = setup('AIN', 'dado');
    await user.click(screen.getByRole('button', { name: 'Escolher' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Escolher alvo de "dado"')).toBeTruthy();
    const options = within(dialog)
      .getAllByRole('button', { pressed: false })
      .map((b) => b.textContent);
    const current = within(dialog).getAllByRole('button', { pressed: true });
    expect(current).toHaveLength(1);
    // Tuplas livres de User e a linha `email` da classe Contato.
    expect(options.join('|')).toContain('age');
    expect(options.join('|')).toContain('email');
    // Nada de campos que não aceitam referência (o `id` do próprio input).
    expect(options.join('|')).not.toContain('input_nome');
  });

  it('escolher no seletor grava a referência e fecha o diálogo', async () => {
    const { harness, user } = setup('AIN', 'dado');
    await user.click(screen.getByRole('button', { name: 'Escolher' }));
    const dialog = await screen.findByRole('dialog');
    const age = within(dialog)
      .getAllByRole('button', { pressed: false })
      .find((b) => b.textContent?.includes('age'));
    if (!age) throw new Error('alvo age não listado');
    await user.click(age);
    expect(valueOf(harness, 'AIN', 'dado')).toEqual({
      annotationId: 'AU',
      entryId: 'EA',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a busca filtra os alvos', async () => {
    const { user } = setup('AIN', 'dado');
    await user.click(screen.getByRole('button', { name: 'Escolher' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('searchbox'), 'zzz');
    expect(within(dialog).getByText('Nenhum alvo encontrado para a busca.')).toBeTruthy();
    await user.clear(within(dialog).getByRole('searchbox'));
    await user.type(within(dialog).getByRole('searchbox'), 'email');
    const shown = within(dialog).getAllByRole('button', { pressed: false });
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((b) => /email/i.test(b.textContent ?? ''))).toBe(true);
  });

  it('referência para um alvo que não existe mais aparece como quebrada', () => {
    const base = cadastroProject();
    const broken: Project = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'AIN'
          ? { ...a, values: { ...a.values, dado: { annotationId: 'AU', entryId: 'X' } } }
          : a,
      ),
    };
    setup('AIN', 'dado', broken);
    expect(screen.getByText('→ (referência quebrada)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ir para o alvo' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('TypedFields — tabela', () => {
  it('mostra as linhas e permite editar uma célula', async () => {
    const { harness, user } = setup('AC', 'atributos');
    expect(screen.getByText('email')).toBeTruthy(); // nome da linha (rowLabel)
    const cell = screen.getByLabelText('exemplo (email)');
    await user.clear(cell);
    await user.type(cell, 'novo@exemplo.com{Enter}');
    const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
    expect(JSON.stringify(rows)).toContain('novo@exemplo.com');
  });

  it('adiciona e reordena linhas', async () => {
    const { harness, user } = setup('AC', 'atributos');
    await user.click(screen.getByRole('button', { name: '+ Linha' }));
    const count = () => {
      const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
      return Array.isArray(rows) ? rows.length : 0;
    };
    expect(count()).toBe(2);
    await user.click(screen.getAllByRole('button', { name: /^Descer linha/ })[0]!);
    const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
    expect((rows as { _id: string }[]).map((r) => r._id)[1]).toBe('R1');
  });

  it('remover uma linha que é alvo de referência pede confirmação', async () => {
    const { harness, user } = setup('AC', 'atributos');
    await user.click(screen.getByRole('button', { name: /^Remover linha/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Referências vão quebrar')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
    expect(Array.isArray(rows) ? rows.length : 0).toBe(0);
  });

  it('mostra quem referencia a linha', () => {
    setup('AC', 'atributos');
    expect(screen.getByRole('button', { name: /^← Input input_email/ })).toBeTruthy();
  });
});
