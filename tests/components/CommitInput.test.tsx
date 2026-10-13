import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
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

  // Etapa 8 (8.3), achado F5 (O5 da rodada 3): o Enter tirava o foco do campo (`blur`) e
  // ele caía no `body`. Agora o Enter confirma e o foco fica no campo, com uma gravação só.
  it('Enter grava uma vez e mantém o foco no campo', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.clear(input);
    await user.type(input, 'novo{Enter}');
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('novo');
    expect(document.activeElement).toBe(input);
    // O `change` que o navegador dispara depois (Enter, Tab) não grava de novo.
    fireEvent.change(input);
    await user.tab();
    expect(onCommit).toHaveBeenCalledOnce();
  });

  // Etapa 8 (8.3), F5: Esc num campo reverte e para aí (não fecha o diálogo ou o menu em
  // volta); sem o que reverter, sobe.
  it('Esc com o que reverter consome a tecla; sem o que reverter, ela sobe', async () => {
    const parent = vi.fn();
    render(
      <div onKeyDown={(e) => parent(e.key, e.defaultPrevented)}>
        <CommitInput aria-label="campo" value="atual" onCommit={() => true} />
      </div>,
    );
    const input = screen.getByLabelText<HTMLInputElement>('campo');
    const user = userEvent.setup();
    await user.type(input, 'x');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('atual');
    expect(parent).not.toHaveBeenCalledWith('Escape', expect.anything());
    await user.keyboard('{Escape}');
    expect(parent).toHaveBeenCalledWith('Escape', false);
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
