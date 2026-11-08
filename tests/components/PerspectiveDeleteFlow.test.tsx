import 'fake-indexeddb/auto';
import { cleanup, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { cadastroProject } from '../model/specFixtures';
import { renderLive } from './harness';
import { createLocalHarness } from './perspectiveUiHarness';

// Etapa #764, AP1 (decisão 1): a confirmação de apagar, aberta pelo Gerenciar perspectivas, volta
// ao Gerenciar ao fechar, e o foco vai ao Apagar da mesma linha (Cancelar/Esc) ou da que ficou no
// lugar (Apagar).

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function Host() {
  const dialogs = useEditorDialogs();
  return (
    <>
      <button type="button" onClick={() => dialogs.show({ kind: 'managePerspectives' })}>
        abrir-gerenciar
      </button>
      <EditorDialogs dialogs={dialogs} />
    </>
  );
}

async function setup(names: string[]) {
  const harness = await createLocalHarness(cadastroProject());
  for (const name of names) {
    const r = harness.context.session.perspectiveActions.createPerspective({
      name,
      startFrom: 'empty',
      local: false,
    });
    if (!r.ok) throw new Error('perspectiva não criada');
  }
  renderLive(harness, () => <Host />);
  const user = userEvent.setup();
  await user.click(screen.getByText('abrir-gerenciar'));
  return { harness, user };
}

const deleteButton = (name: string) =>
  screen.getByRole('button', {
    name: t('perspective.manage.delete', { name }),
    hidden: true,
  });
const manageTitle = () =>
  screen.queryByText(t('perspective.manage.title'), { selector: 'h2' });
const names = (h: Awaited<ReturnType<typeof setup>>['harness']) =>
  h.project().perspectives.map((p) => p.name);

describe('apagar perspectiva pelo Gerenciar', () => {
  it('Cancelar volta ao Gerenciar com o foco no Apagar da mesma linha', async () => {
    const { user } = await setup(['A', 'B', 'C']);
    await user.click(deleteButton('B'));
    expect(manageTitle()).toBeNull();
    await user.click(
      screen.getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    expect(manageTitle()).not.toBeNull();
    await Promise.resolve();
    expect(document.activeElement).toBe(deleteButton('B'));
  });

  it('Esc volta ao Gerenciar com o foco no Apagar da mesma linha', async () => {
    const { user } = await setup(['A', 'B']);
    await user.click(deleteButton('A'));
    document
      .querySelector('dialog')
      ?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await Promise.resolve();
    expect(manageTitle()).not.toBeNull();
    expect(document.activeElement).toBe(deleteButton('A'));
  });

  it('Apagar volta ao Gerenciar sem a perspectiva e com o foco no Apagar da linha de baixo', async () => {
    const { harness, user } = await setup(['A', 'B', 'C']);
    await user.click(deleteButton('B'));
    await user.click(
      screen.getByRole('button', { name: t('perspective.delete.confirm'), hidden: true }),
    );
    await Promise.resolve();
    expect(names(harness)).toEqual(['A', 'C']);
    expect(manageTitle()).not.toBeNull();
    expect(document.activeElement).toBe(deleteButton('C'));
  });

  it('Apagar a última linha leva o foco ao Apagar da de cima', async () => {
    const { user } = await setup(['A', 'B']);
    await user.click(deleteButton('B'));
    await user.click(
      screen.getByRole('button', { name: t('perspective.delete.confirm'), hidden: true }),
    );
    await Promise.resolve();
    expect(document.activeElement).toBe(deleteButton('A'));
  });

  it('Apagar a única perspectiva leva o foco ao Fechar do Gerenciar', async () => {
    const { user } = await setup(['A']);
    await user.click(deleteButton('A'));
    await user.click(
      screen.getByRole('button', { name: t('perspective.delete.confirm'), hidden: true }),
    );
    await Promise.resolve();
    const close = screen.getByRole('button', { name: t('common.close'), hidden: true });
    expect(document.activeElement).toBe(close);
  });

  it('Fechar o Gerenciar devolve o foco ao botão que o abriu', async () => {
    const { user } = await setup(['A']);
    await user.click(deleteButton('A'));
    await user.click(
      screen.getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    await user.click(
      screen.getByRole('button', { name: t('common.close'), hidden: true }),
    );
    await Promise.resolve();
    expect(manageTitle()).toBeNull();
    expect(document.activeElement).toBe(screen.getByText('abrir-gerenciar'));
  });
});
