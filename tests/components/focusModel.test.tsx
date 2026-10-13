import { render } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { t } from '../../src/i18n';
import { typeOfAnnotation } from '../../src/model';
import { Dialog } from '../../src/ui/Dialog';
import { RefPicker, type RefFieldDef } from '../../src/ui/RefPicker';
import { cadastroProject } from '../model/specFixtures';
import { annotationOf } from './harness';

// Etapa 8 (8.3), achado F1: o `Dialog` (e o `RefPicker`) abria e registrava o retorno do
// foco num `useEffect`, que roda no quadro seguinte. Quem renderiza fora de `act` (o
// `user-event` com outra versão do `@testing-library/dom`) podia clicar num botão do
// diálogo e desmontá-lo antes do efeito: sem cleanup registrado, nenhum retorno, e o foco
// caía no `body` (o flake de foco). Aqui o `render` do Preact roda sem `act`, de forma
// determinística: o diálogo que entra no DOM já está aberto, com o foco dentro e com o
// retorno registrado, mesmo que saia antes do próximo quadro.

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

/** Deixa a renderização agendada e as microtarefas rodarem (sem chegar ao próximo quadro). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Controles do fluxo: abrir o modal e confirmar (o que tira o modal e quem o abriu). */
interface Flow {
  open(): void;
  confirm(): void;
}

/**
 * "Abrir" abre o modal; a confirmação tira o modal e o próprio "Abrir" (como a linha
 * excluída pelo diálogo). O retorno explícito é "Alvo".
 */
function Vanishing({
  flow,
  modal,
}: {
  readonly flow: { current: Flow | null };
  readonly modal: (confirm: () => void, target: () => HTMLElement | null) => preact.VNode;
}) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const confirm = () => {
    setGone(true);
    setOpen(false);
  };
  flow.current = { open: () => setOpen(true), confirm };
  return (
    <div>
      {!gone && <button data-opener="">Abrir</button>}
      <button data-target="">Alvo</button>
      {open && modal(confirm, () => host.querySelector<HTMLElement>('[data-target]'))}
    </div>
  );
}

async function openThenConfirmBeforeNextFrame(
  modal: (confirm: () => void, target: () => HTMLElement | null) => preact.VNode,
) {
  const flow: { current: Flow | null } = { current: null };
  render(<Vanishing flow={flow} modal={modal} />, host);
  host.querySelector<HTMLElement>('[data-opener]')?.focus();
  flow.current?.open();
  await settle();
  const dialog = host.querySelector('dialog');
  if (!dialog) throw new Error('o modal não entrou no DOM');
  const state = {
    open: dialog.open,
    focusInside: dialog.contains(document.activeElement),
  };
  // A confirmação chega antes do próximo quadro (o clique do teste, o Enter rápido).
  flow.current?.confirm();
  await settle();
  return state;
}

describe('Dialog fora de act (F1)', () => {
  const modal = (confirm: () => void, target: () => HTMLElement | null) => (
    <Dialog
      title="Confirmar"
      onCancel={() => undefined}
      returnFocus={target}
      actions={<button onClick={confirm}>Excluir</button>}
    >
      <p>Texto</p>
    </Dialog>
  );

  it('no DOM, já está aberto e com o foco dentro', { repeats: 19 }, async () => {
    const state = await openThenConfirmBeforeNextFrame(modal);
    expect(state).toEqual({ open: true, focusInside: true });
  });

  it(
    'confirmado antes do próximo quadro, o foco vai ao alvo e não ao body',
    { repeats: 19 },
    async () => {
      await openThenConfirmBeforeNextFrame(modal);
      expect(document.activeElement).toBe(host.querySelector('[data-target]'));
    },
  );
});

describe('RefPicker fora de act (F1)', () => {
  const project = cadastroProject();
  const annotation = annotationOf(project, 'AIN');
  const field = typeOfAnnotation(project, annotation)?.type.fields.find(
    (f) => f.key === 'dado',
  ) as RefFieldDef;
  const modal = (confirm: () => void, target: () => HTMLElement | null) => (
    <RefPicker
      project={project}
      annotation={annotation}
      field={field}
      returnFocus={target}
      onClose={() => undefined}
      onPick={confirm}
    />
  );

  it('no DOM, já está aberto e com o foco na busca', { repeats: 19 }, async () => {
    const state = await openThenConfirmBeforeNextFrame(modal);
    expect(state).toEqual({ open: true, focusInside: true });
  });

  it(
    'escolhido antes do próximo quadro, o foco vai ao alvo e não ao body',
    { repeats: 19 },
    async () => {
      await openThenConfirmBeforeNextFrame(modal);
      expect(document.activeElement).toBe(host.querySelector('[data-target]'));
    },
  );
});

// Etapa 8 (8.3), achado F7 (resíduo 7 da auditoria, 8.7): o fechar do seletor é um
// `IconButton` da biblioteca de controles, com nome acessível, e fecha o seletor.
describe('RefPicker: botão de fechar (F7)', () => {
  it('tem o nome acessível "Fechar" e chama onClose', async () => {
    const project = cadastroProject();
    const annotation = annotationOf(project, 'AIN');
    const field = typeOfAnnotation(project, annotation)?.type.fields.find(
      (f) => f.key === 'dado',
    ) as RefFieldDef;
    const onClose = vi.fn();
    render(
      <RefPicker
        project={project}
        annotation={annotation}
        field={field}
        onClose={onClose}
        onPick={() => undefined}
      />,
      host,
    );
    await settle();
    const close = within(host).getByRole('button', { name: t('common.close') });
    expect(close.classList.contains('icon-button')).toBe(true);
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
