// Sugestões no campo de texto (SG1, decisão 3): combobox do TextField no modo commit e as
// três superfícies que o ligam (campo dos Detalhes, célula de tabela, formulário do Catálogo).
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecField } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TextField } from '../../src/ui/controls/TextField';
import { SimpleEditor, StringEditor } from '../../src/ui/FieldEditors';
import { TableEditor } from '../../src/ui/TableField';
import { TypedForm } from '../../src/ui/TypedForm';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const LIST = ['String', 'Int', 'MutableList', 'List', 'Unit'];

function setup(
  props: {
    value?: string;
    readOnly?: boolean;
    disabled?: boolean;
    suggestions?: string[];
  } = {},
) {
  const onCommit = vi.fn(() => true);
  render(
    <>
      <TextField
        aria-label="tipo"
        value={props.value ?? ''}
        readOnly={props.readOnly}
        disabled={props.disabled}
        suggestions={'suggestions' in props ? props.suggestions : LIST}
        onCommit={onCommit}
      />
      <button type="button">depois</button>
    </>,
  );
  const input = screen.getByLabelText<HTMLInputElement>('tipo');
  return { input, onCommit, user: userEvent.setup() };
}

function render2(suggestions: string[]) {
  const onCommit = vi.fn(() => true);
  render(
    <TextField
      aria-label="tipo"
      value=""
      suggestions={suggestions}
      onCommit={onCommit}
    />,
  );
  return {
    input: screen.getByLabelText<HTMLInputElement>('tipo'),
    onCommit,
    user: userEvent.setup(),
  };
}

const options = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('TextField com sugestões', () => {
  it('digitar uma palavra com correspondência abre a lista filtrada, com ARIA de combobox', async () => {
    const { input, user } = setup();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    await user.type(input, 'li');
    expect(options()).toEqual(['List', 'MutableList']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('listbox', { name: 'Sugestões' });
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(screen.getAllByRole('option').every((o) => o.id !== '')).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('sem correspondência a lista fica fechada', async () => {
    const { user, input } = setup();
    await user.type(input, 'zzz');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('↓/↑ navegam (aria-activedescendant/aria-selected) e Enter escolhe sem gravar', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'List<Mu');
    expect(options()).toEqual(['MutableList']);
    await user.keyboard('{ArrowDown}');
    const option = screen.getByRole('option');
    expect(option.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id);
    await user.keyboard('{Enter}');
    expect(input.value).toBe('List<MutableList');
    expect(input.selectionStart).toBe('List<MutableList'.length);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
    // A confirmação seguinte grava o texto escolhido.
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('List<MutableList');
  });

  it('navega com ↑ e ↓ entre os itens', async () => {
    const { input, user } = setup();
    await user.type(input, 'li');
    // Abre com o primeiro item ativo.
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowUp}{ArrowUp}{Enter}');
    expect(input.value).toBe('MutableList');
  });

  it('troca só a palavra sob o cursor, mantendo o resto do texto', async () => {
    const { input, user } = setup({ value: 'Map<Str, Int>' });
    input.focus();
    input.setSelectionRange(7, 7);
    await user.keyboard('{ArrowDown}');
    expect(options()).toEqual(['String']);
    await user.keyboard('{Enter}');
    expect(input.value).toBe('Map<String, Int>');
    expect(input.selectionStart).toBe('Map<String'.length);
  });

  it('Enter com a lista aberta escolhe o primeiro item e não grava', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'Str');
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Enter}');
    expect(input.value).toBe('String');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('String');
  });

  it('a filtragem volta o ativo ao primeiro item', async () => {
    const { input, user } = setup();
    await user.type(input, 'li{ArrowDown}');
    expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
    await user.type(input, 's');
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('abertura explícita (Ctrl+Espaço, ↓) mostra o item idêntico que a automática fecha', async () => {
    const { input, user } = setup({ value: 'String' });
    await user.click(input);
    await user.keyboard('{End}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{Control>} {/Control}');
    expect(options()).toEqual(['String']);
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Escape}{ArrowDown}');
    expect(options()).toEqual(['String']);
  });

  it('Enter com a lista fechada grava como hoje', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'String?');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('String?');
  });

  it('o item idêntico fica quando há outras correspondências: Enter escolhe sem mudar o texto', async () => {
    const { input, onCommit, user } = render2(['UInt', 'Int']);
    await user.type(input, 'Int');
    expect(options()).toEqual(['Int', 'UInt']);
    await user.keyboard('{Enter}');
    expect(input.value).toBe('Int');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('Int');
  });

  it('clique numa opção escolhe sem tirar o foco nem gravar', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'in');
    await user.click(screen.getByRole('option', { name: 'Int' }));
    expect(input.value).toBe('Int');
    expect(document.activeElement).toBe(input);
    expect(onCommit).not.toHaveBeenCalled();
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith('Int');
  });

  it('Esc fecha sem mudar nada e o Esc seguinte reverte o texto', async () => {
    const { input, user } = setup({ value: 'x<' });
    await user.click(input);
    await user.keyboard('{Escape}');
    await user.keyboard('li');
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('x<li');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('x<');
  });

  it('Esc com a lista aberta não sobe para quem está em volta', async () => {
    const outer = vi.fn();
    const { user } = (() => {
      render(
        <div onKeyDown={outer}>
          <TextField
            aria-label="tipo"
            value=""
            suggestions={LIST}
            onCommit={() => true}
          />
        </div>,
      );
      return { user: userEvent.setup() };
    })();
    const input = screen.getByLabelText('tipo');
    await user.type(input, 'li');
    outer.mockClear();
    await user.keyboard('{Escape}');
    expect(outer).not.toHaveBeenCalled();
  });

  it('Tab fecha e mantém o texto digitado, sem aceitar a sugestão', async () => {
    const { input, onCommit, user } = setup();
    await user.type(input, 'li');
    await user.keyboard('{ArrowDown}{Tab}');
    expect(screen.queryByRole('listbox')).toBeNull();
    // O texto digitado segue (e é o que grava ao sair), não a sugestão ativa.
    expect(onCommit).toHaveBeenCalledWith('li');
  });

  it('clique no campo vazio mostra tudo; Ctrl+Espaço abre com a palavra atual', async () => {
    const { input, user } = setup();
    await user.click(input);
    expect(options()).toEqual(LIST);
    await user.keyboard('{Escape}');
    await user.keyboard('Un');
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>} {/Control}');
    expect(options()).toEqual(['Unit']);
  });

  it('a lista fecha ao sair do campo', async () => {
    const { user, input } = setup();
    await user.type(input, 'li');
    await user.tab();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('somente leitura ou desabilitado: sem lista e sem papel de combobox', async () => {
    const a = setup({ readOnly: true, value: 'x' });
    await a.user.click(a.input);
    await a.user.keyboard('{ArrowDown}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(a.input.getAttribute('role')).toBeNull();
    cleanup();
    const b = setup({ disabled: true });
    await b.user.click(b.input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('sem sugestões (ausente ou vazia) o campo é o de sempre', async () => {
    for (const suggestions of [undefined, []]) {
      const { input, onCommit, user } = setup({ suggestions });
      expect(input.getAttribute('role')).toBeNull();
      await user.type(input, 'li{ArrowDown}');
      expect(screen.queryByRole('listbox')).toBeNull();
      await user.keyboard('{Enter}');
      expect(onCommit).toHaveBeenCalledWith('li');
      cleanup();
    }
  });

  it('aceita itens com texto secundário', async () => {
    render(
      <TextField
        aria-label="tipo"
        value=""
        suggestions={[{ label: 'Usuario', detail: 'Classe' }, 'Int']}
        onCommit={() => true}
      />,
    );
    await userEvent.setup().type(screen.getByLabelText('tipo'), 'usu');
    expect(screen.getByRole('option').textContent).toBe('UsuarioClasse');
  });

  it('o rascunho digitado depois de escolher não se perde ao render', async () => {
    const { input, user } = setup();
    await user.type(input, 'li');
    fireEvent.mouseDown(screen.getByRole('option', { name: 'List' }));
    await user.click(screen.getByRole('option', { name: 'List' }));
    await user.type(input, '?');
    expect(input.value).toBe('List?');
  });
});

describe('sugestões nas superfícies de edição', () => {
  const string: SpecField = {
    key: 'tipo',
    type: 'string',
    suggestions: ['String', 'Int'],
  };

  it('campo dos Detalhes (StringEditor) e editor simples', async () => {
    const onSet = vi.fn(() => ({ ok: true as const }));
    render(
      <StringEditor
        field={string as never}
        value=""
        label="Tipo"
        readOnly={false}
        onSet={onSet as never}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tipo'), 'st');
    expect(options()).toEqual(['String']);
    await user.keyboard('{ArrowDown}{Enter}{Enter}');
    expect(onSet).toHaveBeenCalledWith('String');
    cleanup();
    render(
      <SimpleEditor
        field={string as never}
        value=""
        label="Tipo"
        readOnly
        onSet={onSet as never}
      />,
    );
    await user.click(screen.getByLabelText('Tipo'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('célula de tabela', async () => {
    const onSetCell = vi.fn(() => ({ ok: true as const }));
    render(
      <TableEditor
        field={
          {
            key: 'props',
            type: 'table',
            rowLabel: 'nome',
            columns: [
              { key: 'nome', type: 'string' },
              { key: 'tipo', type: 'string', suggestions: ['String', 'Int'] },
            ],
          } as never
        }
        rows={[{ _id: 'r1', nome: 'a', tipo: '' }]}
        readOnly={false}
        onAddRow={() => true}
        onSetCell={onSetCell as never}
        onMoveRow={() => undefined}
        onRemoveRow={() => undefined}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('combobox')[0] as HTMLElement);
    expect(options()).toEqual(['String', 'Int']);
    // A outra coluna string, sem sugestões, não abre lista.
    await user.keyboard('{Escape}');
    await user.click(screen.getAllByRole('textbox')[0] as HTMLElement);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('formulário do Catálogo (campo e coluna da tabela)', async () => {
    const onChange = vi.fn();
    render(
      <TypedForm
        fields={[
          string,
          {
            key: 'itens',
            type: 'table',
            rowLabel: 'nome',
            columns: [{ key: 'nome', type: 'string', suggestions: ['Alfa'] }],
          } as never,
        ]}
        values={{ itens: [{ _id: 'r1', nome: '' }] }}
        onChange={onChange}
        readOnly={false}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('tipo'), 'in');
    expect(options()).toEqual(['Int', 'String']);
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText(/^nome/i));
    expect(options()).toEqual(['Alfa']);
  });
});
