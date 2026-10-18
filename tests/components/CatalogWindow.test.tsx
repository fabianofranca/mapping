import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { approximateMeasurer } from '../../src/model';
import { locale } from '../../src/store/settings';
import { hideToolWindow } from '../../src/store/toolWindows';
import { CatalogWindow } from '../../src/ui/CatalogWindow';
import { EditorContext } from '../../src/ui/EditorContext';
import { libraryHarness, type LibraryHarness } from './libraryHarness';

// B5: a janela Catálogo dentro do projeto (abas Componentes e Paleta).

// O desenho da página usa o Konva, que o jsdom não roda: o rasterizador é falso.
vi.mock('../../src/ui/catalog/renderer', async (original) => {
  const real = await original<typeof import('../../src/ui/catalog/renderer')>();
  return {
    ...real,
    defaultCatalogRenderer: () =>
      real.createCatalogRenderer(approximateMeasurer, () => 'data:image/png;base64,fake'),
  };
});

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(() => {
  cleanup();
  hideToolWindow('catalog');
});

function renderWindow(harness: LibraryHarness, onOpenSpecs = vi.fn()) {
  render(
    <EditorContext.Provider value={harness.context}>
      <CatalogWindow onOpenSpecs={onOpenSpecs} />
    </EditorContext.Provider>,
  );
  return { user: userEvent.setup(), onOpenSpecs };
}

/** Abre a página do Button (a lista abre a página num diálogo). */
async function openButtonPage(user: ReturnType<typeof userEvent.setup>) {
  const entry = await screen.findByRole('button', { name: /^Button/ });
  await user.click(entry);
  return screen.findByRole('dialog');
}

describe('janela Catálogo', () => {
  it('tem as abas Componentes (padrão) e Paleta', async () => {
    const harness = await libraryHarness();
    const { user } = renderWindow(harness);
    const components = screen.getByRole('tab', { name: t('catalog.window.components') });
    const palette = screen.getByRole('tab', { name: t('catalog.window.palette') });
    expect(components.getAttribute('aria-selected')).toBe('true');
    // Os catálogos são lidos ao abrir a aba: aparecem os componentes do Material 3.
    expect(await screen.findByRole('button', { name: /^Button/ })).toBeTruthy();

    await user.click(palette);
    expect(palette.getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: t('library.addType', { name: 'Button' }),
      }),
    ).toBeTruthy();
  });

  it('Adicionar à tela, na página do componente, cria a marcação com a anotação', async () => {
    const harness = await libraryHarness();
    const { user } = renderWindow(harness);
    const before = harness.project().markings.length;
    const dialog = await openButtonPage(user);
    await user.click(
      within(dialog).getByRole('button', { name: t('catalog.page.addToScreen') }),
    );

    const project = harness.project();
    expect(project.markings).toHaveLength(before + 1);
    const created = project.markings.at(-1);
    expect(created?.imageId).toBe('I1');
    expect(project.annotations.find((a) => a.markingId === created?.id)?.type).toEqual({
      specId: 'material3',
      typeId: 'm3-button',
    });
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: created?.id });
  });

  it('sem tela possível, Adicionar à tela fica desabilitado com a dica', async () => {
    const harness = await libraryHarness();
    harness.canvas.viewportCenter.mockReturnValue({ x: -5000, y: -5000 });
    const { user } = renderWindow(harness);
    const dialog = await openButtonPage(user);
    const add = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: t('catalog.page.addToScreen'),
    });
    expect(add.disabled).toBe(true);
    expect(add.title).toBe(t('library.noScreen'));
  });

  it('somente leitura: Adicionar à tela desabilitado', async () => {
    const harness = await libraryHarness({ readOnly: true });
    const { user } = renderWindow(harness);
    const dialog = await openButtonPage(user);
    const add = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: t('catalog.page.addToScreen'),
    });
    expect(add.disabled).toBe(true);
    expect(add.title).toBe(t('library.readOnly'));
  });

  it('sem pacote aplicado: estado vazio com atalho para as Especializações', async () => {
    const harness = await libraryHarness({ apply: false });
    const { user, onOpenSpecs } = renderWindow(harness);
    expect(screen.getByText(t('library.empty'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t('library.openSpecs') }));
    expect(onOpenSpecs).toHaveBeenCalledOnce();
  });

  it('não lê os catálogos enquanto a aba Componentes não monta', async () => {
    const harness = await libraryHarness();
    expect(harness.context.session.catalogs.entries.peek()).toBeNull();
    const { user } = renderWindow(harness);
    await screen.findByRole('button', { name: /^Button/ });
    expect(harness.context.session.catalogs.entries.peek()).toHaveLength(1);
    await user.click(screen.getByRole('tab', { name: t('catalog.window.palette') }));
  });

  it('invalidar (recarga externa) lê o pacote de novo', async () => {
    const harness = await libraryHarness();
    renderWindow(harness);
    await screen.findByRole('button', { name: /^Button/ });
    const first = harness.context.session.catalogs.entries.peek();
    harness.context.session.catalogs.invalidate();
    await waitFor(() =>
      expect(harness.context.session.catalogs.entries.peek()).not.toBe(first),
    );
    expect(harness.context.session.catalogs.entries.peek()).toHaveLength(1);
  });
});
