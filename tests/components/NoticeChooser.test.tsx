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
  locale.value = 'en-US';
});
afterEach(cleanup);

const noticeTypes = () => noticeSpec().layers[0]?.annotationTypes ?? [];

describe('badge in the type choice (TypePicker)', () => {
  it('shows the badge on types with a notice and disappears on the type without one', () => {
    render(<TypePicker types={noticeTypes()} onChoose={vi.fn()} />);
    const option = (name: string) =>
      screen.getByText(name, { selector: 'strong' }).closest('button') as HTMLElement;
    expect(
      within(option('Alert')).getByRole('img', {
        name: /^Notice Deprecated: Use variant\./,
      }),
    ).toBeTruthy();
    expect(
      within(option('Gone')).getByRole('img', {
        // pt-BR kept: shared fixture data asserted by tests/model, tests/components (message of noticeFixtures)
        name: 'Notice Removed: Saiu do contrato.',
      }),
    ).toBeTruthy();
    expect(within(option('Plain')).queryByRole('img')).toBeNull();
  });

  it('choosing the type still works with a notice', async () => {
    const onChoose = vi.fn();
    render(<TypePicker types={noticeTypes()} onChoose={onChoose} />);
    await userEvent.setup().click(screen.getByText('Gone', { selector: 'strong' }));
    expect(onChoose).toHaveBeenCalledOnce();
  });
});

describe('badge in the Library palette', () => {
  it('appears on the type with a notice and not on the others', async () => {
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
      within(item('Button')).getByRole('img', {
        name: 'Notice Deprecated: Use Button2.',
      }),
    ).toBeTruthy();
    expect(within(item('Column')).queryByRole('img', { name: /^Notice/ })).toBeNull();
  });
});

describe('badge in the Catalog (Components tab)', () => {
  it('appears on the entry with a notice and not on the others', () => {
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
                  notices: [{ kind: 'removed' as const, message: 'Gone.' }],
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
      within(entry('m3-button')).getByRole('img', { name: 'Notice Removed: Gone.' }),
    ).toBeTruthy();
    expect(within(entry('m3-fab')).queryByRole('img', { name: /^Notice/ })).toBeNull();
  });
});
