import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Etapa 2.5: o cadeado na Árvore e em Detalhes. A seleção e as anotações seguem livres;
// só mover, redimensionar e excluir são bloqueados.

beforeEach(() => {
  locale.value = 'pt-BR';
  showToolWindow('tree');
});
afterEach(cleanup);

const marking = (p: Project, id: string) => {
  const found = p.markings.find((m) => m.id === id);
  if (!found) throw new Error(id);
  return found;
};

function renderMarkingPanel(
  markingId: string,
  { readOnly = false, setup }: { readOnly?: boolean; setup?: (h: Harness) => void } = {},
) {
  const harness = createHarness(sampleProject(), readOnly);
  setup?.(harness);
  const onDelete = vi.fn();
  renderLive(harness, (p) => {
    const m = p.markings.find((x) => x.id === markingId);
    const image = p.images.find((i) => i.id === m?.imageId);
    if (!m || !image) return null;
    return (
      <MarkingPanel
        project={p}
        marking={m}
        image={image}
        readOnly={readOnly}
        onDelete={onDelete}
        onSelectMarking={() => undefined}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return { harness, onDelete, user: userEvent.setup() };
}

const lockButton = () =>
  screen.getByRole('button', { name: t('lock.markingLock') }) as HTMLButtonElement;

describe('Detalhes da marcação: cadeado', () => {
  it('o botão tranca e destranca, com o estado em aria-pressed e uma entrada de desfazer por clique', async () => {
    const { harness, user } = renderMarkingPanel('M2');
    expect(lockButton().getAttribute('aria-pressed')).toBe('false');
    await user.click(lockButton());
    expect(marking(harness.project(), 'M2').locked).toBe(true);
    expect(lockButton().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(t('lock.markingNotice'))).toBeTruthy();
    await user.click(lockButton());
    expect(marking(harness.project(), 'M2').locked).toBe(false);
    expect(screen.queryByText(t('lock.markingNotice'))).toBeNull();
    harness.store.undo();
    expect(marking(harness.project(), 'M2').locked).toBe(true);
  });

  it('o atalho aparece na dica do botão', () => {
    renderMarkingPanel('M2');
    expect(lockButton().getAttribute('aria-keyshortcuts')).toBe('Alt+L');
  });

  it('trancada: posição, tamanho e Excluir ficam desabilitados; nome e pai seguem editáveis', async () => {
    const { harness, onDelete, user } = renderMarkingPanel('M2', {
      setup: (h) => h.actions.setMarkingLocked('M2', true),
    });
    for (const label of ['X', 'Y', 'Largura', 'Altura']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
    const remove = screen.getByRole('button', { name: t('marking.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(remove.getAttribute('title')).toBe(t('lock.deleteBlocked'));
    await user.click(remove);
    expect(onDelete).not.toHaveBeenCalled();

    const name = screen.getByLabelText(t('marking.name'));
    expect((name as HTMLInputElement).disabled).toBe(false);
    await user.clear(name);
    await user.type(name, 'Outro{Enter}');
    expect(marking(harness.project(), 'M2').name).toBe('Outro');
  });

  it('destrancada, os campos e o Excluir voltam', () => {
    renderMarkingPanel('M2');
    expect((screen.getByLabelText('X') as HTMLInputElement).disabled).toBe(false);
    const remove = screen.getByRole('button', { name: t('marking.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(false);
  });

  it('filha de um pai trancado: campos desabilitados e um aviso com o nome do pai; o cadeado próprio segue livre', async () => {
    const { harness, user } = renderMarkingPanel('M2', {
      setup: (h) => h.actions.setMarkingLocked('M1', true),
    });
    expect(screen.getByText(t('lock.inheritedNotice', { parent: 'Porta' }))).toBeTruthy();
    expect((screen.getByLabelText('Largura') as HTMLInputElement).disabled).toBe(true);
    // Só a geometria trava: excluir a filha segue permitido.
    const remove = screen.getByRole('button', { name: t('marking.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(false);
    expect(lockButton().getAttribute('aria-pressed')).toBe('false');
    await user.click(lockButton());
    expect(marking(harness.project(), 'M2').locked).toBe(true);
  });

  it('pai com um filho trancado: pode redimensionar, não mover nem excluir', () => {
    renderMarkingPanel('M1', { setup: (h) => h.actions.setMarkingLocked('M3', true) });
    expect(screen.getByText(t('lock.childrenNotice'))).toBeTruthy();
    expect((screen.getByLabelText('X') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Y') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Largura') as HTMLInputElement).disabled).toBe(false);
    const remove = screen.getByRole('button', { name: t('marking.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(remove.getAttribute('title')).toBe(t('lock.deleteBlockedInside'));
  });

  it('somente leitura: o cadeado fica desabilitado', () => {
    renderMarkingPanel('M2', { readOnly: true });
    expect(lockButton().disabled).toBe(true);
  });
});

function renderImagePanel(
  imageId: string,
  { readOnly = false, setup }: { readOnly?: boolean; setup?: (h: Harness) => void } = {},
) {
  const harness = createHarness(sampleProject(), readOnly);
  setup?.(harness);
  const onDelete = vi.fn();
  renderLive(harness, (p) => (
    <SelectionPanel
      image={p.images.find((i) => i.id === imageId) ?? null}
      display={undefined}
      readOnly={readOnly}
      busy={false}
      onReplace={() => undefined}
      onDelete={onDelete}
    />
  ));
  return { harness, onDelete, user: userEvent.setup() };
}

describe('Detalhes da imagem: cadeado', () => {
  const imageLock = () =>
    screen.getByRole('button', { name: t('lock.imageLock') }) as HTMLButtonElement;

  it('tranca e destranca a imagem, com aviso e Excluir bloqueado', async () => {
    const { harness, onDelete, user } = renderImagePanel('I2');
    await user.click(imageLock());
    expect(harness.project().images[1]?.locked).toBe(true);
    expect(imageLock().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(t('lock.imageNotice'))).toBeTruthy();
    const remove = screen.getByRole('button', { name: t('image.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    await user.click(remove);
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(imageLock());
    expect(harness.project().images[1]?.locked).toBe(false);
  });

  it('"Trancar todas as marcações desta imagem" é uma entrada só no desfazer', async () => {
    const { harness, user } = renderImagePanel('I1');
    await user.click(screen.getByRole('button', { name: t('lock.lockAll') }));
    const locked = harness.project().markings.filter((m) => m.locked);
    expect(locked.map((m) => m.id)).toEqual(['M1', 'M2', 'M3']);
    expect(harness.store.revision.value).toBe(1);
    // Com todas trancadas, o botão oferece destrancar todas.
    await user.click(screen.getByRole('button', { name: t('lock.unlockAll') }));
    expect(harness.project().markings.some((m) => m.locked)).toBe(false);
    harness.store.undo();
    expect(harness.project().markings.filter((m) => m.locked)).toHaveLength(3);
    harness.store.undo();
    expect(harness.project().markings.some((m) => m.locked)).toBe(false);
  });

  it('imagem sem marcações não mostra "trancar todas"', () => {
    const harness = createHarness(sampleProject());
    harness.actions.removeMarking('M4');
    renderLive(harness, (p) => (
      <SelectionPanel
        image={p.images[1] ?? null}
        display={undefined}
        readOnly={false}
        busy={false}
        onReplace={() => undefined}
        onDelete={() => undefined}
      />
    ));
    expect(screen.queryByRole('button', { name: t('lock.lockAll') })).toBeNull();
  });

  it('com uma marcação trancada, a imagem não pode ser excluída', () => {
    renderImagePanel('I1', { setup: (h) => h.actions.setMarkingLocked('M3', true) });
    const remove = screen.getByRole('button', { name: t('image.delete') });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(remove.getAttribute('title')).toBe(t('lock.deleteBlockedInside'));
  });

  it('somente leitura: os botões de trava ficam desabilitados', () => {
    renderImagePanel('I1', { readOnly: true });
    expect(imageLock().disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: t('lock.lockAll') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

function renderTree(harness: Harness, onSelect = vi.fn()) {
  renderLive(harness, (p) => (
    <MarkingTree project={p} selection={harness.ui.selection.value} onSelect={onSelect} />
  ));
  return { onSelect, user: userEvent.setup() };
}

describe('Árvore: cadeado na linha', () => {
  const treeLock = (name: string) =>
    screen.getByRole('button', {
      name: t('lock.treeLock', { name }),
    }) as HTMLButtonElement;

  it('cada linha de imagem e marcação tem o cadeado, e clicar alterna sem selecionar', async () => {
    const harness = createHarness(sampleProject());
    const { onSelect, user } = renderTree(harness);
    expect(treeLock('Porta').getAttribute('aria-pressed')).toBe('false');
    await user.click(treeLock('Porta'));
    expect(marking(harness.project(), 'M1').locked).toBe(true);
    expect(treeLock('Porta').getAttribute('aria-pressed')).toBe('true');
    expect(treeLock('Porta').className).toContain('tree-lock-on');
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(treeLock('images/lateral.jpg'));
    expect(harness.project().images[0]?.locked).toBe(true);
    await user.click(treeLock('Porta'));
    expect(marking(harness.project(), 'M1').locked).toBe(false);
  });

  it('o descendente de um pai trancado mostra o cadeado esmaecido, sem botão', () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M1', true);
    renderTree(harness);
    expect(
      screen.queryByRole('button', { name: t('lock.treeLock', { name: 'Maçaneta' }) }),
    ).toBeNull();
    const signs = document.querySelectorAll('.tree-lock-inherited');
    // M2 e M3 herdam; M1 tem o botão próprio.
    expect(signs).toHaveLength(2);
    expect(within(signs[0] as HTMLElement).getByText(t('lock.inherited'))).toBeTruthy();
  });

  it('a linha trancada continua selecionável', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.setMarkingLocked('M2', true);
    const { onSelect, user } = renderTree(harness);
    await user.click(screen.getByRole('button', { name: /^Maçaneta/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M2' });
  });

  it('somente leitura: o estado aparece, mas o botão fica desabilitado', () => {
    const harness = createHarness(sampleProject(), true);
    renderTree(harness);
    expect(treeLock('Porta').disabled).toBe(true);
  });

  it('o rótulo do botão traz o nome do item', () => {
    const harness = createHarness(sampleProject());
    renderTree(harness);
    expect(treeLock('Fechadura').title).toBe(t('lock.treeLock', { name: 'Fechadura' }));
  });
});
