import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Choice,
  IconButton,
  Segmented,
  Select,
  Tabs,
  TextArea,
  TextField,
} from '../../src/ui/controls';

afterEach(cleanup);

describe('Button', () => {
  it('é type="button" por padrão e leva a variante e o tamanho nas classes', () => {
    render(
      <Button variant="danger" size="sm" class="extra">
        Excluir
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Excluir' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toBe('button button-danger button-sm extra');
  });

  it('desabilitado não dispara o clique', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Ok
      </Button>,
    );
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('só com ícone: o rótulo é o nome acessível e vai para a dica com o atalho', () => {
    const { container } = render(
      <IconButton icon="undo" label="Desfazer" shortcut="Ctrl+Z" />,
    );
    const button = screen.getByRole('button', { name: 'Desfazer' });
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Ctrl+Z');
    expect(button.querySelector('svg')).not.toBeNull();
    const tip = container.querySelector('.tooltip');
    expect(tip?.textContent).toContain('Desfazer');
    expect(tip?.querySelector('kbd')?.textContent).toBe('Ctrl+Z');
    // A dica é decorativa: não duplica o nome para leitores de tela.
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
  });

  it('com texto visível, o nome vem do texto; a dica pode ter outro texto', () => {
    const { container } = render(
      <IconButton icon="list" label="Mostrar lista" text="Lista" tooltip="Outra dica" />,
    );
    expect(screen.getByRole('button', { name: 'Lista' })).toBeTruthy();
    expect(container.querySelector('.tooltip')?.textContent).toBe('Outra dica');
  });

  it('alternância usa aria-pressed', () => {
    render(<IconButton icon="text" label="Texto" pressed />);
    expect(
      screen.getByRole('button', { name: 'Texto' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('Esc dispensa a dica sem tirar o foco', async () => {
    const { container } = render(<IconButton icon="undo" label="Desfazer" />);
    const user = userEvent.setup();
    await user.tab();
    const anchor = container.querySelector('.tooltip-anchor');
    expect(anchor?.className).not.toContain('tooltip-dismissed');
    await user.keyboard('{Escape}');
    expect(anchor?.className).toContain('tooltip-dismissed');
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });
});

describe('TextField', () => {
  it('com rótulo, o campo fica dentro do label', () => {
    render(<TextField label="Nome" value="a" onInput={() => undefined} />);
    expect(screen.getByLabelText<HTMLInputElement>('Nome').value).toBe('a');
  });

  it('inválido marca a classe e aria-invalid', () => {
    render(<TextField aria-label="x" value="" invalid onInput={() => undefined} />);
    const input = screen.getByLabelText('x');
    expect(input.className).toContain('input-invalid');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('com onCommit só grava ao confirmar', async () => {
    const onCommit = vi.fn(() => true);
    render(<TextField aria-label="x" value="a" onCommit={onCommit} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('x');
    await user.clear(input);
    await user.type(input, 'b');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('b');
  });

  it('inputRef dá acesso ao <input>', () => {
    const ref: { current: HTMLInputElement | null } = { current: null };
    render(
      <TextField aria-label="x" value="" inputRef={ref} onInput={() => undefined} />,
    );
    expect(ref.current).toBe(screen.getByLabelText('x'));
  });
});

describe('Select', () => {
  it('troca de opção e esconde a seta decorativa dos leitores de tela', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select label="Tema" value="a" onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    await userEvent.setup().selectOptions(screen.getByLabelText('Tema'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(container.querySelector('.select-chevron')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});

describe('Choice', () => {
  it('o rótulo e a dica ficam no mesmo label e o clique no texto marca', async () => {
    const onChange = vi.fn();
    render(
      <Choice
        label="Texto"
        hint="dica"
        onChange={(e) => onChange(e.currentTarget.checked)}
      />,
    );
    const box = screen.getByLabelText<HTMLInputElement>(/Texto/);
    expect(box.type).toBe('checkbox');
    await userEvent.setup().click(screen.getByText('Texto'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('rádio', () => {
    render(<Choice type="radio" name="g" label="Um" />);
    expect(screen.getByRole('radio', { name: 'Um' })).toBeTruthy();
  });
});

describe('Segmented', () => {
  const items = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', disabled: true },
  ];

  it('marca o escolhido com aria-pressed e chama onSelect (inclusive no já escolhido)', async () => {
    const onSelect = vi.fn();
    render(<Segmented items={items} value="a" label="Grupo" onSelect={onSelect} />);
    expect(screen.getByRole('group', { name: 'Grupo' })).toBeTruthy();
    const a = screen.getByRole('button', { name: 'A' });
    expect(a.getAttribute('aria-pressed')).toBe('true');
    await userEvent.setup().click(a);
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('item desabilitado e grupo desabilitado não respondem', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <Segmented items={items} value={null} onSelect={onSelect} />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'B' }));
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<Segmented items={items} value={null} disabled onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'A' }).hasAttribute('disabled')).toBe(true);
  });

  it('item só com ícone tem nome acessível e dica', () => {
    const { container } = render(
      <Segmented
        items={[{ id: 'a', label: 'Navegar', icon: 'pan' }]}
        value="a"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Navegar' })).toBeTruthy();
    expect(container.querySelector('.tooltip')?.textContent).toBe('Navegar');
  });
});

describe('Tabs', () => {
  function Harness({ onChange }: { onChange?: (id: string) => void }) {
    const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
    return (
      <Tabs
        label="Abas"
        value={value}
        onChange={(id) => {
          setValue(id);
          onChange?.(id);
        }}
        tabs={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B', disabled: true },
          { id: 'c', label: 'C' },
        ]}
      />
    );
  }

  it('só a aba escolhida entra na ordem do Tab', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'A' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'C' }).getAttribute('tabindex')).toBe('-1');
  });

  it('setas, Home e End movem o foco e a seleção, pulando abas desabilitadas', () => {
    render(<Harness />);
    const a = screen.getByRole('tab', { name: 'A' });
    const c = screen.getByRole('tab', { name: 'C' });
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(c.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(a.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(a, { key: 'End' });
    expect(c.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(c, { key: 'Home' });
    expect(a.getAttribute('aria-selected')).toBe('true');
  });

  it('clique troca a aba', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'C' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });
});

// Variantes da revisão de propostas (HANDOFF-PROPOSALS 2.2).
describe('variantes da revisão', () => {
  it('Button accept/reject e fantasma', () => {
    render(
      <>
        <Button variant="accept" aria-pressed={true}>
          Aceitar item
        </Button>
        <Button variant="reject">Rejeitar item</Button>
        <Button variant="ghost">Sair</Button>
      </>,
    );
    const accept = screen.getByRole('button', { name: 'Aceitar item' });
    expect(accept.className).toBe('button button-accept');
    expect(accept.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Rejeitar item' }).className).toBe(
      'button button-reject',
    );
    expect(screen.getByRole('button', { name: 'Sair' }).className).toBe(
      'button button-ghost',
    );
  });

  it('IconButton accept/reject compacto e com selo numérico', () => {
    render(
      <>
        <IconButton icon="check" variant="accept" size="sm" label="Aceitar" />
        <IconButton icon="proposal" label="Propostas" badge="2" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Aceitar' }).className).toBe(
      'icon-button icon-button-accept icon-button-sm',
    );
    const proposals = screen.getByRole('button', { name: 'Propostas' });
    expect(proposals.querySelector('.icon-button-badge')?.textContent).toBe('2');
  });

  it('Tabs com contador informativo', () => {
    render(
      <Tabs
        label="Janelas"
        value="a"
        onChange={() => {}}
        tabs={[
          { id: 'a', label: 'Lista', badge: '3' },
          { id: 'b', label: 'Propostas', badge: '1', badgeTone: 'info' },
        ]}
      />,
    );
    expect(
      screen.getByRole('tab', { name: /^Propostas/ }).querySelector('.tab-badge-info'),
    ).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: /^Lista/ }).querySelector('.tab-badge-info'),
    ).toBeNull();
  });

  it('TextArea: várias linhas, grava ao sair do campo', () => {
    const onCommit = vi.fn();
    render(<TextArea aria-label="Nota" value="" onCommit={onCommit} />);
    const area = screen.getByRole('textbox', { name: 'Nota' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.className).toBe('input input-area');
    fireEvent.input(area, { target: { value: 'linha 1\nlinha 2' } });
    fireEvent.blur(area);
    expect(onCommit).toHaveBeenCalledWith('linha 1\nlinha 2');
  });
});
