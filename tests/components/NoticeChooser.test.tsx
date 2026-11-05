import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCatalog, type CatalogEntry } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypePicker } from '../../src/ui/TypePicker';
import { CatalogView } from '../../src/ui/catalog/CatalogView';
import { createCatalogRenderer } from '../../src/ui/catalog/renderer';
import { approximateMeasurer } from '../../src/model';
import { EditorContext } from '../../src/ui/EditorContext';
import { LibraryPalette } from '../../src/ui/LibraryPalette';
import { material3Package } from '../storage/packageFixture';
import { libraryHarness } from './libraryHarness';
import { noticeSpec } from './noticeFixtures';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const noticeTypes = () => noticeSpec().layers[0]?.annotationTypes ?? [];

describe('selo na escolha de tipo (TypePicker)', () => {
  it('mostra o selo nos tipos com aviso e some no tipo sem aviso', () => {
    render(<TypePicker types={noticeTypes()} onChoose={vi.fn()} />);
    const option = (name: string) =>
      screen.getByText(name, { selector: 'strong' }).closest('button') as HTMLElement;
    expect(
      within(option('Alert')).getByRole('img', {
        name: /^Aviso Obsoleto: Use variant\./,
      }),
    ).toBeTruthy();
    expect(
      within(option('Gone')).getByRole('img', {
        name: 'Aviso Removido: Saiu do contrato.',
      }),
    ).toBeTruthy();
    expect(within(option('Plain')).queryByRole('img')).toBeNull();
  });

  it('escolher o tipo continua funcionando com aviso', async () => {
    const onChoose = vi.fn();
    render(<TypePicker types={noticeTypes()} onChoose={onChoose} />);
    await userEvent.setup().click(screen.getByText('Gone', { selector: 'strong' }));
    expect(onChoose).toHaveBeenCalledOnce();
  });
});

describe('selo na paleta da Biblioteca', () => {
  it('aparece no tipo com aviso e não nos outros', async () => {
    const harness = await libraryHarness();
    const project = harness.project();
    const patched = {
      ...project,
      specializations: project.specializations.map((s) =>
        s.spec
          ? {
              ...s,
              spec: {
                ...s.spec,
                formatVersion: 10 as const,
                layers: s.spec.layers.map((l) => ({
                  ...l,
                  annotationTypes: l.annotationTypes.map((type) =>
                    type.id === 'm3-button'
                      ? {
                          ...type,
                          notices: [
                            { kind: 'deprecated' as const, message: 'Use Button2.' },
                          ],
                        }
                      : type,
                  ),
                })),
              },
            }
          : s,
      ),
    };
    harness.store.load(patched);
    render(
      <EditorContext.Provider value={harness.context}>
        <LibraryPalette onOpenSpecs={vi.fn()} />
      </EditorContext.Provider>,
    );
    const item = (name: string) =>
      screen
        .getByText(name, { selector: '.library-type-name' })
        .closest('li') as HTMLElement;
    expect(
      within(item('Button')).getByRole('img', { name: 'Aviso Obsoleto: Use Button2.' }),
    ).toBeTruthy();
    expect(within(item('Column')).queryByRole('img', { name: /^Aviso/ })).toBeNull();
  });
});

describe('selo no Catálogo (aba Componentes)', () => {
  it('aparece na entrada com aviso e não nas outras', () => {
    const files = [...material3Package()].map(([path, content]) =>
      typeof content === 'string' ? { path, text: content } : { path, binary: true },
    );
    const base = buildCatalog(files);
    const catalog = {
      ...base,
      layers: base.layers.map((layer) => ({
        ...layer,
        entries: layer.entries.map((e): CatalogEntry =>
          e.type.id === 'm3-button'
            ? {
                ...e,
                type: {
                  ...e.type,
                  notices: [{ kind: 'removed' as const, message: 'Saiu.' }],
                },
              }
            : e,
        ),
      })),
    };
    render(
      <CatalogView
        catalog={catalog}
        specId="material3"
        version={1}
        layout="split"
        renderer={createCatalogRenderer(
          approximateMeasurer,
          () => 'data:image/png;base64,x',
        )}
      />,
    );
    const entry = (id: string) =>
      document.querySelector(`.catalog-entry[data-type-id="${id}"]`) as HTMLElement;
    expect(
      within(entry('m3-button')).getByRole('img', { name: 'Aviso Removido: Saiu.' }),
    ).toBeTruthy();
    expect(within(entry('m3-fab')).queryByRole('img', { name: /^Aviso/ })).toBeNull();
  });
});
