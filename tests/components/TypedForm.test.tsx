import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecField } from '../../src/model';
import { locale } from '../../src/store/settings';
import { MULTILINE_MIN_LENGTH } from '../../src/ui/FieldEditors';
import { TypedForm } from '../../src/ui/TypedForm';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const fields: SpecField[] = [
  { key: 'nome', type: 'string', required: true, description: 'Nome visível' },
  { key: 'idade', type: 'number' },
  { key: 'estilo', type: 'enum', options: ['a', 'b'] },
  { key: 'destino', type: 'ref', accepts: {} } as SpecField,
  {
    key: 'itens',
    type: 'table',
    rowLabel: 'nome',
    columns: [{ key: 'nome', type: 'string' }],
  },
];

function setup(values: Record<string, unknown> = {}, readOnly = false) {
  const onChange = vi.fn();
  render(
    <TypedForm fields={fields} values={values} onChange={onChange} readOnly={readOnly} />,
  );
  return { onChange, user: userEvent.setup() };
}

describe('TypedForm (sem projeto nem EditorProvider)', () => {
  it('renderiza um controle por tipo de campo', () => {
    setup();
    expect(screen.getByLabelText('nome')).toBeTruthy();
    expect(screen.getByLabelText('idade')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'estilo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /destino/ })).toBeTruthy();
    expect(screen.getByText('Nome visível', { selector: 'small' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Linha' })).toBeTruthy();
  });

  it('texto, número e opção chamam onChange com chave e valor', async () => {
    const { onChange, user } = setup();
    await user.type(screen.getByLabelText('nome'), 'Ana{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('nome', 'Ana');
    await user.type(screen.getByLabelText('idade'), '12,5{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('idade', 12.5);
    await user.click(
      within(screen.getByRole('group', { name: 'estilo' })).getByRole('button', {
        name: 'b',
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith('estilo', 'b');
  });

  it('tabela: adiciona, edita e remove linhas', async () => {
    const { onChange, user } = setup({
      itens: [{ _id: 'r1', nome: 'um' }],
    });
    await user.click(screen.getByRole('button', { name: '+ Linha' }));
    const added = onChange.mock.calls.at(-1) as [string, { _id: string }[]];
    expect(added[0]).toBe('itens');
    expect(added[1]).toHaveLength(2);
    expect(added[1][0]?._id).toBe('r1');

    const cell = screen.getByLabelText('nome (um)');
    await user.clear(cell);
    await user.type(cell, 'dois{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('itens', [{ _id: 'r1', nome: 'dois' }]);

    await user.click(screen.getByRole('button', { name: /Ações da linha/ }));
    await user.click(screen.getByRole('menuitem', { name: /Remover linha/ }));
    expect(onChange).toHaveBeenLastCalledWith('itens', []);
  });

  it('readOnly desabilita os controles e a referência fica desabilitada', () => {
    setup({ itens: [{ _id: 'r1', nome: 'um' }] }, true);
    expect((screen.getByLabelText('nome') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('idade') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('nome (um)') as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: /destino/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('referência sem projeto: desabilitada mesmo editável', () => {
    setup();
    const button = screen.getByRole('button', { name: /destino/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('projeto');
  });
});

describe('TypedForm: texto longo', () => {
  it('a célula de tabela com texto longo continua de uma linha', () => {
    const long = 'y'.repeat(MULTILINE_MIN_LENGTH + 20);
    setup({ itens: [{ _id: 'r1', nome: long }] });
    expect(screen.getByLabelText(/^nome \(/).tagName).toBe('INPUT');
  });
});

describe('TypedForm: coluna ref de uma tabela (sem projeto)', () => {
  it('a célula ref mostra o seletor indisponível, e as outras colunas continuam editáveis', async () => {
    const onChange = vi.fn();
    const withRef: SpecField[] = [
      {
        key: 'alvos',
        label: 'Alvos',
        type: 'table',
        columns: [
          { key: 'nota', type: 'string' },
          { key: 'alvo', label: 'Alvo', type: 'ref', accepts: { free: true } },
        ],
      },
    ];
    render(<TypedForm fields={withRef} values={{}} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Linha' }));
    expect(onChange).toHaveBeenLastCalledWith('alvos', [
      expect.objectContaining({ nota: null, alvo: null }),
    ]);
  });

  it('com a linha na tabela, o botão da célula ref fica desabilitado e explica por quê', () => {
    const withRef: SpecField[] = [
      {
        key: 'alvos',
        type: 'table',
        columns: [{ key: 'alvo', label: 'Alvo', type: 'ref', accepts: { free: true } }],
      },
    ];
    render(
      <TypedForm
        fields={withRef}
        values={{ alvos: [{ _id: 'R1', alvo: null }] }}
        onChange={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: /^Alvo \(Linha 1\): / });
    expect(button).toHaveProperty('disabled', true);
    expect(button.title).toBe('Escolher referência só funciona dentro de um projeto.');
  });
});
