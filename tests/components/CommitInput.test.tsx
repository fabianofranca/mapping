import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitInput } from '../../src/ui/CommitInput';

afterEach(cleanup);

function setup(onCommit: (text: string) => boolean = () => true, value = 'atual') {
  const view = render(
    <CommitInput aria-label="campo" value={value} onCommit={onCommit} />,
  );
  const input = screen.getByLabelText<HTMLInputElement>('campo');
  return { ...view, input, user: userEvent.setup() };
}

describe('CommitInput', () => {
  it('não grava a cada tecla: só ao confirmar com Enter', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.clear(input);
    await user.type(input, 'novo');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('novo');
  });

  it('grava ao sair do campo', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.type(input, '!');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith('atual!');
  });

  it('não chama onCommit quando o texto não mudou', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.click(input);
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('volta ao valor atual quando onCommit devolve false', async () => {
    const { input, user } = setup(() => false);
    await user.clear(input);
    await user.type(input, 'rejeitado');
    await user.keyboard('{Enter}');
    expect(input.value).toBe('atual');
  });

  it('Esc descarta o rascunho sem gravar', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.type(input, 'xyz');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('atual');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('acompanha o valor externo (ex.: depois de desfazer)', () => {
    const { rerender, input } = setup(() => true, 'a');
    rerender(<CommitInput aria-label="campo" value="b" onCommit={() => true} />);
    expect(input.value).toBe('b');
  });

  it('depois de gravar, voltar ao valor de antes (desfazer, limpar) mostra o valor, não o rascunho', async () => {
    const { rerender, input, user } = setup(() => true, '');
    await user.type(input, 'gravado');
    await user.keyboard('{Enter}');
    rerender(<CommitInput aria-label="campo" value="gravado" onCommit={() => true} />);
    expect(input.value).toBe('gravado');
    rerender(<CommitInput aria-label="campo" value="" onCommit={() => true} />);
    expect(input.value).toBe('');
  });

  it('grava o texto do campo mesmo se o `change` vier antes da renderização', () => {
    const onCommit = vi.fn(() => true);
    const { input } = setup(onCommit, 'a');
    input.value = 'b';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith('b');
  });
});
