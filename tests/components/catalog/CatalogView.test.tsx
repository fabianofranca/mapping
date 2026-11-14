import { signal } from '@preact/signals';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../src/i18n';
import {
  type Catalog,
  type CatalogEntry,
  approximateMeasurer,
  buildCatalog,
  fittedSize,
  modelMessage,
  type Project,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { CatalogView, resolveCatalogLink } from '../../../src/ui/catalog/CatalogView';
import { createCatalogRenderer } from '../../../src/ui/catalog/renderer';
import { emptyProject } from '../../model/fixtures';
import { material3Package, material3Spec } from '../../storage/packageFixture';

// B5: presentation of the Catalog (list, page, gallery, playground) over Material 3.

const files = [...material3Package()].map(([path, content]) =>
  typeof content === 'string' ? { path, text: content } : { path, binary: true },
);
const base = buildCatalog(files);

let counter = 0;
const rasterize = vi.fn(() => `data:image/png;base64,fake${counter++}`);
function renderer() {
  return createCatalogRenderer(approximateMeasurer, rasterize);
}

beforeEach(() => {
  locale.value = 'en-US';
  rasterize.mockClear();
});
afterEach(cleanup);

/** Swaps fields of an entry (the catalog is plain data). */
function patched(
  catalog: Catalog,
  typeId: string,
  patch: Partial<CatalogEntry>,
): Catalog {
  return {
    ...catalog,
    layers: catalog.layers.map((layer) => ({
      ...layer,
      entries: layer.entries.map((e) => (e.type.id === typeId ? { ...e, ...patch } : e)),
    })),
  };
}

function view(
  props: Partial<Parameters<typeof CatalogView>[0]> = {},
  catalog: Catalog = base,
) {
  const user = userEvent.setup();
  const utils = render(
    <CatalogView
      catalog={catalog}
      specId="material3"
      version={1}
      layout="split"
      renderer={renderer()}
      {...props}
    />,
  );
  return { user, ...utils };
}

const entryButton = (name: string) =>
  screen.getByRole<HTMLButtonElement>('button', { name: new RegExp(`^${name}`) });

describe('list', () => {
  it('lists the 15 components per layer, with the container icon and without size', () => {
    view();
    const list = screen.getByRole('navigation', { name: t('catalog.view.components') });
    expect(within(list).getAllByRole('button').length).toBe(15);
    const column = entryButton('Column');
    expect(
      within(column).getByRole('img', { name: t('library.container') }),
    ).toBeTruthy();
    expect(column.querySelector('.badge')).toBeNull();
    expect(column.getAttribute('aria-label') ?? column.textContent).toContain(
      t('library.container'),
    );
    expect(within(column).queryByText('380 × 200')).toBeNull();
    expect(list.textContent).not.toMatch(/\d+ × \d+/);
    const button = entryButton('Button');
    expect(
      within(button).queryByRole('img', { name: t('library.container') }),
    ).toBeNull();
  });

  it('text search filters and warns when nothing matches', async () => {
    const { user } = view();
    const search = screen.getByRole('searchbox', { name: t('catalog.view.search') });
    await user.type(search, 'card');
    const list = screen.getByRole('navigation', { name: t('catalog.view.components') });
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining('Card')]);
    await user.clear(search);
    await user.type(search, 'zzzz');
    expect(screen.getByText(t('catalog.view.noMatch'))).toBeTruthy();
  });

  it('choosing an item opens its page (the first one comes open in the split)', async () => {
    const { user } = view();
    expect(screen.getByRole('article', { name: 'Top app bar' })).toBeTruthy();
    await user.click(entryButton('Chip'));
    expect(screen.getByRole('article', { name: 'Chip' })).toBeTruthy();
    expect(entryButton('Chip').getAttribute('aria-current')).toBe('true');
  });

  it('arrows move the focus between the items', async () => {
    const { user } = view();
    const buttons = within(
      screen.getByRole('navigation', { name: t('catalog.view.components') }),
    ).getAllByRole('button');
    buttons[0]?.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(buttons[1]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('initialTypeId opens the type page', () => {
    view({ initialTypeId: 'm3-fab' });
    expect(screen.getByRole('article', { name: 'FAB' })).toBeTruthy();
  });
});

describe('page', () => {
  it('the title of a container carries the container icon, without a pill', () => {
    view({ initialTypeId: 'm3-column' });
    const page = screen.getByRole('article', { name: 'Column' });
    expect(within(page).getByRole('img', { name: t('library.container') })).toBeTruthy();
    expect(page.querySelector('.catalog-page-title .badge')).toBeNull();
    view({ initialTypeId: 'm3-fab' });
    const fab = screen.getByRole('article', { name: 'FAB' });
    expect(within(fab).queryByRole('img', { name: t('library.container') })).toBeNull();
  });

  it('shows the properties table generated from the fields', () => {
    view({ initialTypeId: 'm3-button' });
    const section = screen.getByRole('region', { name: t('catalog.page.properties') });
    const table = within(section).getByRole('table');
    const row = within(table).getByText('variant').closest('tr') as HTMLElement;
    expect(within(row).getByText(t('catalog.page.type.enum'))).toBeTruthy();
    expect(row.textContent).toContain('filled');
    expect(within(table).getByText('label')).toBeTruthy();
  });

  it('table columns appear nested', () => {
    const catalog = patched(base, 'm3-card', {
      fields: [
        {
          key: 'rows',
          label: 'Rows',
          type: 'table',
          required: true,
          columns: [{ key: 'cell', label: 'Cell', type: 'string', required: false }],
        },
      ],
    });
    view({ initialTypeId: 'm3-card' }, catalog);
    const cell = screen.getByText('cell').closest('tr') as HTMLElement;
    expect(cell.getAttribute('data-depth')).toBe('1');
  });

  it('shows the document in markdown', () => {
    view({ initialTypeId: 'm3-button' });
    const section = screen.getByRole('region', { name: t('catalog.page.document') });
    expect(section.querySelector('.markdown')).toBeTruthy();
  });

  it('with no document, shows the message', () => {
    view({ initialTypeId: 'm3-button' }, patched(base, 'm3-button', { docText: null }));
    expect(screen.getByText(t('catalog.page.noDoc'))).toBeTruthy();
  });

  it('a markdown image does not become <img>', () => {
    const catalog = patched(base, 'm3-button', {
      docText: '![x](https://example.com/a.png)\n\n<img src="x">',
    });
    view({ initialTypeId: 'm3-button' }, catalog);
    const section = screen.getByRole('region', { name: t('catalog.page.document') });
    expect(section.querySelector('img')).toBeNull();
  });

  it('warns when the component did not load', () => {
    const catalog = patched(base, 'm3-button', {
      component: null,
      componentProblem: modelMessage(
        'catalog.fileMissing',
        { path: 'x.json' },
        'missing file (x.json)',
      ),
      previewValues: null,
    });
    view({ initialTypeId: 'm3-button' }, catalog);
    expect(
      screen.getByText(
        t('catalog.page.componentProblem', { problem: 'missing file (x.json)' }),
      ),
    ).toBeTruthy();
    expect(screen.getByText(t('catalog.playground.noComponent'))).toBeTruthy();
  });

  it('in en-US the problem of a missing component comes out in English (#945)', () => {
    locale.value = 'en-US';
    const component = base.layers
      .flatMap((l) => l.entries)
      .find((e) => e.type.id === 'm3-button')?.type.component;
    expect(component).toBeTruthy();
    const missing = files.filter((f) => !f.path.endsWith(String(component)));
    expect(missing.length).toBe(files.length - 1);
    view({ initialTypeId: 'm3-button' }, buildCatalog(missing));
    const page = screen.getByText(/The component did not load/);
    expect(page.textContent).toMatch(/missing file/);
    // pt-BR kept: asserts that no Portuguese text leaks into en-US
    expect(page.textContent).not.toMatch(/arquivo ausente/);
  });

  // pt-BR kept: locale switching test (starts in pt-BR, switches to en-US and back)
  it('switching the language with the page open switches the missing component notice, without remounting the view (#1256, R8.3) (pt-BR)', async () => {
    locale.value = 'pt-BR';
    const component = base.layers
      .flatMap((l) => l.entries)
      .find((e) => e.type.id === 'm3-button')?.type.component;
    expect(component).toBeTruthy();
    const missing = files.filter((f) => !f.path.endsWith(String(component)));
    view({ initialTypeId: 'm3-button' }, buildCatalog(missing));
    const alert = (): string =>
      document.querySelector('.catalog-page .field-error[role="alert"]')?.textContent ??
      '';
    // pt-BR kept: the Portuguese notice is the object of the test
    expect(alert()).toBe(
      `O componente não carregou: arquivo ausente (${String(component)})`,
    );

    locale.value = 'en-US';
    await waitFor(() =>
      expect(alert()).toBe(
        `The component did not load: missing file (${String(component)})`,
      ),
    );
    // pt-BR kept: asserts that no Portuguese text leaks into en-US
    expect(alert()).not.toMatch(/arquivo ausente|não carregou/);

    locale.value = 'pt-BR';
    // pt-BR kept: switching back to pt-BR
    await waitFor(() => expect(alert()).toMatch(/^O componente não carregou/));
  });

  it('sources appear grouped by system', () => {
    view({ initialTypeId: 'm3-button' });
    const section = screen.getByRole('region', { name: t('catalog.page.sources') });
    expect(within(section).getAllByRole('heading', { level: 4 }).length).toBeGreaterThan(
      0,
    );
  });
});

describe('code', () => {
  const code = [
    {
      platform: { id: 'android', name: 'Android', language: 'Kotlin' },
      symbol: 'MyButton',
      path: 'app/ui/MyButton.kt',
      params: { onClick: 'lambda' },
      values: { variant: { filled: 'Filled' } },
      notes: 'Uses the default theme.',
    },
  ];

  it('with no project the path is plain text', () => {
    view({ initialTypeId: 'm3-button' }, patched(base, 'm3-button', { code }));
    const section = screen.getByRole('region', { name: t('catalog.page.code') });
    expect(within(section).getByText('MyButton')).toBeTruthy();
    expect(within(section).getByText('app/ui/MyButton.kt').closest('a')).toBeNull();
    expect(within(section).getByText('Uses the default theme.')).toBeTruthy();
    expect(within(section).getByText('onClick')).toBeTruthy();
  });

  it.each(['pt-BR', 'en-US'] as const)(
    'the arrow between the parameter and the value comes from t() and stays out of the reading (%s)',
    (lang) => {
      locale.value = lang;
      view({ initialTypeId: 'm3-button' }, patched(base, 'm3-button', { code }));
      const section = screen.getByRole('region', { name: t('catalog.page.code') });
      const term = within(section).getByText('onClick').closest('dt');
      const arrow = term?.querySelector('span[aria-hidden="true"]');
      expect(arrow?.textContent).toBe(t('catalog.page.codeParamsArrow'));
      expect(arrow?.textContent).toBe('→');
    },
  );

  // CL1 / D5: the code notes are inline Markdown, like the Document: no literal backticks.
  it('the notes render the inline Markdown (code), without stray backticks', () => {
    const noted = [
      {
        ...code[0]!,
        notes: '`handler` binds to the screen and `content = { Text(<label>) }`.',
      },
    ];
    view({ initialTypeId: 'm3-button' }, patched(base, 'm3-button', { code: noted }));
    const section = screen.getByRole('region', { name: t('catalog.page.code') });
    expect(section.textContent).not.toContain('`');
    expect(within(section).getByText('handler').tagName).toBe('CODE');
    expect(within(section).getByText('content = { Text(<label>) }')).toBeTruthy();
  });

  /** Project with the `material3` specialization declaring `android` with this `repo`. */
  function projectWithRepo(repo: { url: string; urlTemplate?: string }): Project {
    const spec = {
      ...material3Spec(),
      formatVersion: 5 as const,
      platforms: [{ id: 'android', name: 'Android', repo }],
    };
    return {
      ...emptyProject(),
      specializations: [
        { id: 'material3', version: 1, file: 'specs/material3.json', spec },
      ],
    };
  }

  it('with a project whose specialization declares the urlTemplate in the repo, the path becomes a link', () => {
    const project = projectWithRepo({
      url: 'https://git.example/repo',
      urlTemplate: 'https://git.example/repo/{path}',
    });
    view({ initialTypeId: 'm3-button', project }, patched(base, 'm3-button', { code }));
    const section = screen.getByRole('region', { name: t('catalog.page.code') });
    const link = within(section).getByText('app/ui/MyButton.kt').closest('a');
    expect(link?.getAttribute('href')).toBe(
      'https://git.example/repo/app/ui/MyButton.kt',
    );
  });

  it('repo without urlTemplate (or only the local clone in the project) makes no link', () => {
    const project = {
      ...projectWithRepo({ url: 'https://git.example/repo' }),
      platformRepos: { android: { localPath: '../..' } },
    };
    view({ initialTypeId: 'm3-button', project }, patched(base, 'm3-button', { code }));
    const section = screen.getByRole('region', { name: t('catalog.page.code') });
    expect(within(section).getByText('app/ui/MyButton.kt').closest('a')).toBeNull();
  });

  const withVariants = [
    {
      ...code[0]!,
      variants: {
        field: 'variant',
        fieldLabel: 'Variant',
        cases: [
          { value: 'outlined', symbol: 'MyOutlinedButton', path: 'app/ui/MyOutlined.kt' },
          { value: 'text', symbol: 'MyTextButton' },
        ],
      },
    },
  ];

  it('with variants, the base stays and the value → symbol table appears below', () => {
    view(
      { initialTypeId: 'm3-button' },
      patched(base, 'm3-button', { code: withVariants }),
    );
    const section = screen.getByRole('region', { name: t('catalog.page.code') });
    expect(within(section).getByText('MyButton')).toBeTruthy();
    const table = within(section).getByRole('table', {
      name: t('catalog.page.codeVariants', { field: 'Variant' }),
    });
    expect(
      within(table)
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual([
      `${t('catalog.page.variantValue')}${t('catalog.page.variantSymbol')}`,
      'outlinedMyOutlinedButton app/ui/MyOutlined.kt',
      'textMyTextButton',
    ]);
    // With no project, the case path is plain text.
    expect(within(table).getByText('app/ui/MyOutlined.kt').closest('a')).toBeNull();
  });

  it('the case path becomes a link through the specialization repo', () => {
    const project = projectWithRepo({
      url: 'https://git.example/repo',
      urlTemplate: 'https://git.example/repo/{path}',
    });
    view(
      { initialTypeId: 'm3-button', project },
      patched(base, 'm3-button', { code: withVariants }),
    );
    const section = screen.getByRole('region', { name: t('catalog.page.code') });
    const link = within(section).getByText('app/ui/MyOutlined.kt').closest('a');
    expect(link?.getAttribute('href')).toBe(
      'https://git.example/repo/app/ui/MyOutlined.kt',
    );
  });

  it('the new texts exist in English', () => {
    locale.value = 'en-US';
    view(
      { initialTypeId: 'm3-button' },
      patched(base, 'm3-button', { code: withVariants }),
    );
    expect(screen.getByRole('table', { name: 'Variants (Variant)' })).toBeTruthy();
    expect(screen.getByText('Symbol')).toBeTruthy();
  });
});

describe('gallery', () => {
  it('generates one static image per example plus the preview, with the name as alt', () => {
    view({ initialTypeId: 'm3-button' });
    const gallery = screen.getByRole('region', { name: t('catalog.gallery.title') });
    const images = within(gallery).getAllByRole('img');
    expect(images).toHaveLength(4);
    expect(
      images.every((img) => img.getAttribute('src')?.startsWith('data:image/png')),
    ).toBe(true);
    expect(images[0]?.getAttribute('alt')).toBe(t('catalog.gallery.preview'));
    const entry = base.layers[0]?.entries.find((e) => e.type.id === 'm3-button');
    expect(images[1]?.getAttribute('alt')).toBe(entry?.examples[0]?.name);
  });

  describe('drawing warnings', () => {
    // The test rasterizer warns as `renderSceneToDataUrl` does after drawing.
    const warning = { code: 'unknown-node', params: { type: 'STICKY' } } as const;
    const warningRenderer = () =>
      createCatalogRenderer(approximateMeasurer, (_root, options) => {
        options.onWarnings?.([warning]);
        return 'data:image/png;base64,fake';
      });

    it('come out in the app language: in en-US there is no Portuguese text', () => {
      view({ initialTypeId: 'm3-button', renderer: warningRenderer() });
      const gallery = screen.getByRole('region', { name: t('catalog.gallery.title') });
      const text = gallery.textContent ?? '';
      expect(text).toContain('Node not drawn (STICKY): only its box is shown');
      // pt-BR kept: asserts that no Portuguese text leaks into en-US
      expect(text).not.toContain('nó não desenhado');
      // pt-BR kept: asserts that no Portuguese text leaks into en-US
      expect(text).not.toContain('Nó não desenhado');
    });

    // pt-BR kept: the object is the Portuguese text of the warning
    it('in pt-BR they come out in Portuguese', () => {
      locale.value = 'pt-BR';
      view({ initialTypeId: 'm3-button', renderer: warningRenderer() });
      const gallery = screen.getByRole('region', { name: t('catalog.gallery.title') });
      expect(gallery.textContent).toContain('Nó não desenhado (STICKY): só a caixa');
    });
  });

  it('uses the cache: reopening the same page does not rasterize again', async () => {
    const engine = renderer();
    const { user } = view({ initialTypeId: 'm3-button', renderer: engine });
    const galleryCalls = () => rasterize.mock.calls.length;
    await user.click(entryButton('Chip'));
    await user.click(entryButton('Button'));
    const after = galleryCalls();
    await user.click(entryButton('Chip'));
    await user.click(entryButton('Button'));
    // The playground rasterizes again; the gallery does not: at most 2 more calls (one per page).
    expect(galleryCalls() - after).toBeLessThanOrEqual(2);
  });

  it('a remote image that finishes loading (images epoch) rasterizes the gallery again', () => {
    const imagesEpoch = signal(0);
    const engine = createCatalogRenderer(approximateMeasurer, rasterize, imagesEpoch);
    view({ initialTypeId: 'm3-button', renderer: engine });
    const gallery = () =>
      screen.getByRole('region', { name: t('catalog.gallery.title') });
    const srcs = () =>
      within(gallery())
        .getAllByRole('img')
        .map((i) => i.getAttribute('src'));
    const before = srcs();
    const calls = rasterize.mock.calls.length;
    act(() => {
      imagesEpoch.value += 1;
    });
    const after = srcs();
    expect(rasterize.mock.calls.length).toBeGreaterThan(calls);
    expect(after).not.toEqual(before);
  });

  it('an example that does not draw shows the reason', () => {
    const catalog = patched(base, 'm3-button', {
      examples: [{ name: 'Broken', mode: 'system', system: 'none', file: 'x.json' }],
    });
    view({ initialTypeId: 'm3-button' }, catalog);
    expect(screen.getByText(t('catalog.gallery.unavailable'))).toBeTruthy();
    expect(screen.getByText('Broken')).toBeTruthy();
  });
});

describe('playground', () => {
  const stage = () => screen.getByRole('region', { name: t('catalog.playground.title') });

  it('editing a field redraws', async () => {
    const { user } = view({ initialTypeId: 'm3-button' });
    await waitFor(() => expect(within(stage()).getByRole('img')).toBeTruthy());
    const before = within(stage()).getByRole('img').getAttribute('src');
    const label = within(stage()).getByRole<HTMLInputElement>('textbox', {
      name: /label/i,
    });
    await user.clear(label);
    await user.type(label, 'New text{Enter}');
    await waitFor(() =>
      expect(within(stage()).getByRole('img').getAttribute('src')).not.toBe(before),
    );
  });

  const buttonEntry = () => {
    const entry = base.layers
      .flatMap((l) => l.entries)
      .find((e) => e.type.id === 'm3-button');
    if (entry === undefined) throw new Error('no button');
    return entry;
  };
  const widthField = () =>
    within(stage()).getByLabelText<HTMLInputElement>(t('catalog.playground.width'));
  const heightField = () =>
    within(stage()).getByLabelText<HTMLInputElement>(t('catalog.playground.height'));
  const autoWidthOf = (label: string) =>
    String(
      fittedSize(
        buttonEntry(),
        { ...buttonEntry().previewValues, label },
        approximateMeasurer,
      ).width,
    );

  it('the width starts automatic and follows the text', async () => {
    const { user } = view({ initialTypeId: 'm3-button' });
    expect(widthField().value).toBe(autoWidthOf('Label'));
    expect(heightField().value).toBe('40');
    expect(within(stage()).getByText(t('catalog.playground.autoWidth'))).toBeTruthy();
    const label = within(stage()).getByRole<HTMLInputElement>('textbox', {
      name: /label/i,
    });
    await user.clear(label);
    await user.type(label, 'Confirm purchase{Enter}');
    await waitFor(() => expect(widthField().value).toBe(autoWidthOf('Confirm purchase')));
    expect(Number(widthField().value)).toBeGreaterThan(120);
    expect(heightField().value).toBe('40');
    await waitFor(() =>
      expect(within(stage()).queryByText(/content larger than the box/)).toBeNull(),
    );
  });

  it('typing a width makes it manual and limited', async () => {
    const { user } = view({ initialTypeId: 'm3-button' });
    await user.clear(widthField());
    await user.type(widthField(), '9999{Enter}');
    await waitFor(() => expect(widthField().value).toBe('240'));
    expect(within(stage()).queryByText(t('catalog.playground.autoWidth'))).toBeNull();
    await user.clear(widthField());
    await user.type(widthField(), '1{Enter}');
    await waitFor(() =>
      expect(widthField().value).toBe(String(buttonEntry().component?.minSize?.width)),
    );
    await user.clear(widthField());
    await user.type(widthField(), '200{Enter}');
    await waitFor(() => expect(widthField().value).toBe('200'));
    const label = within(stage()).getByRole<HTMLInputElement>('textbox', {
      name: /label/i,
    });
    await user.clear(label);
    await user.type(label, 'Confirm purchase{Enter}');
    await waitFor(() => expect(label.value).toBe('Confirm purchase'));
    expect(widthField().value).toBe('200');
  });

  it('Restore values goes back to the initial and to automatic', async () => {
    const { user } = view({ initialTypeId: 'm3-button' });
    const label = within(stage()).getByRole<HTMLInputElement>('textbox', {
      name: /label/i,
    });
    await user.clear(label);
    await user.type(label, 'Confirm purchase{Enter}');
    await user.clear(widthField());
    await user.type(widthField(), '200{Enter}');
    await waitFor(() => expect(widthField().value).toBe('200'));
    await user.click(
      within(stage()).getByRole('button', { name: t('catalog.playground.reset') }),
    );
    await waitFor(() => expect(widthField().value).toBe(autoWidthOf('Label')));
    expect(label.value).toBe('Label');
    expect(within(stage()).getByText(t('catalog.playground.autoWidth'))).toBeTruthy();
  });
});

describe('navigation', () => {
  it('opening another component takes the scroll to the top (full screen)', async () => {
    const { user, container } = view({ initialTypeId: 'm3-button' });
    const detail = container.querySelector<HTMLElement>('.catalog-detail');
    if (detail === null) throw new Error('no detail');
    detail.scrollTop = 500;
    await user.click(entryButton('Chip'));
    await waitFor(() => expect(detail.scrollTop).toBe(0));
  });

  it('opening another component takes the scroll to the top (dialog)', async () => {
    const catalog = patched(base, 'm3-card', {
      docText: '[go](mapping://material3/m3-chip)',
    });
    const { user } = view({ layout: 'list' }, catalog);
    await user.click(entryButton('Card'));
    const dialog = await screen.findByRole('dialog');
    const body = dialog.querySelector<HTMLElement>('.dialog-body');
    if (body === null) throw new Error('no body');
    body.scrollTop = 500;
    await user.click(within(dialog).getByRole('link', { name: 'go' }));
    await waitFor(() => expect(body.scrollTop).toBe(0));
    expect(within(dialog).getByRole('article', { name: 'Chip' })).toBeTruthy();
  });

  it('an unknown destination warns in a status region inside the scrolling area', async () => {
    const markdown = '[broken](mapping://material3/does-not-exist)';
    const catalog = patched(base, 'm3-button', { docText: markdown });
    const { user, container } = view({ initialTypeId: 'm3-button' }, catalog);
    await user.click(screen.getByRole('link', { name: 'broken' }));
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('mapping://material3/does-not-exist');
    expect(notice.classList.contains('catalog-notice')).toBe(true);
    expect(container.querySelector('.catalog-detail')?.contains(notice)).toBe(true);
  });
});

describe('layout list', () => {
  it('only the list; choosing opens the page in a dialog', async () => {
    const { user } = view({ layout: 'list' });
    expect(screen.queryByRole('article')).toBeNull();
    await user.click(entryButton('Card'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('article', { name: 'Card' })).toBeTruthy();
    await user.click(
      within(dialog).getByRole('button', { name: t('catalog.view.close') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Add to screen', () => {
  it('calls the callback with the type id', async () => {
    const onAddToScreen = vi.fn();
    const { user } = view({ initialTypeId: 'm3-button', onAddToScreen });
    await user.click(screen.getByRole('button', { name: t('catalog.page.addToScreen') }));
    expect(onAddToScreen).toHaveBeenCalledWith('m3-button');
  });

  it('disabled shows the reason in the title', () => {
    view({
      initialTypeId: 'm3-button',
      onAddToScreen: vi.fn(),
      addDisabledReason: 'Select a screen',
    });
    const button = screen.getByRole<HTMLButtonElement>('button', {
      name: t('catalog.page.addToScreen'),
    });
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Select a screen');
  });

  it('with no callback there is no button', () => {
    view({ initialTypeId: 'm3-button' });
    expect(
      screen.queryByRole('button', { name: t('catalog.page.addToScreen') }),
    ).toBeNull();
  });
});

describe('links mapping://', () => {
  it('resolves specId/typeId, only typeId and rejects the rest', () => {
    expect(resolveCatalogLink(base, 'material3', 'mapping://material3/m3-card')).toBe(
      'm3-card',
    );
    expect(resolveCatalogLink(base, 'material3', 'mapping://m3-card')).toBe('m3-card');
    expect(resolveCatalogLink(base, 'material3', 'mapping://other/m3-card')).toBeNull();
    expect(
      resolveCatalogLink(base, 'material3', 'mapping://material3/does-not-exist'),
    ).toBeNull();
  });

  it('clicking a link navigates; an unknown destination warns without navigating', async () => {
    const catalog = patched(base, 'm3-button', {
      docText: '[card](mapping://material3/m3-card) and [ghost](mapping://material3/xx)',
    });
    const { user } = view({ initialTypeId: 'm3-button' }, catalog);
    await user.click(screen.getByRole('link', { name: 'ghost' }));
    expect(screen.getByRole('status').textContent).toContain('mapping://material3/xx');
    expect(screen.getByRole('article', { name: 'Button' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'card' }));
    expect(screen.getByRole('article', { name: 'Card' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('validation', () => {
  it('with no problems shows the valid package message', () => {
    const clean: Catalog = {
      ...base,
      report: { ...base.report, issues: [], errors: [], warnings: [] },
    };
    view({}, clean);
    const summary = screen.getByRole('region', { name: t('catalog.view.validation') });
    expect(summary.textContent).toContain(t('catalog.view.valid'));
  });

  it('a long list of warnings starts collapsed and expands', async () => {
    // The repository package has few warnings: here the list is long on purpose.
    const warnings = Array.from({ length: 8 }, (_, i) => ({
      file: 'material3.spec.json',
      path: `layers[0].annotationTypes[${i}]`,
      message: `test warning ${i}`,
      severity: 'warning' as const,
    }));
    const long: Catalog = {
      ...base,
      report: { ...base.report, issues: warnings, errors: [], warnings },
    };
    const { user } = view({}, long);
    const summary = screen.getByRole('region', { name: t('catalog.view.validation') });
    expect(within(summary).queryByRole('group')).toBeNull();
    await user.click(
      within(summary).getByRole('button', { name: t('catalog.view.showIssues') }),
    );
    expect(
      within(summary).getByRole('group', { name: t('library.issues') }),
    ).toBeTruthy();
  });

  it('a package with errors warns, lists the problems and still navigates', async () => {
    const broken = new Map(files.map((f) => [f.path, f]));
    broken.set('components/m3-button.json', {
      path: 'components/m3-button.json',
      text: '{ not json',
    });
    const catalog = buildCatalog([...broken.values()]);
    expect(catalog.report.errors.length).toBeGreaterThan(0);
    const { user } = view({}, catalog);
    const summary = screen.getByRole('region', { name: t('catalog.view.validation') });
    expect(within(summary).getByText(t('catalog.view.hasErrors'))).toBeTruthy();
    await user.click(
      within(summary).getByRole('button', { name: t('catalog.view.showIssues') }),
    );
    expect(
      within(summary).getByRole('group', { name: t('library.issues') }),
    ).toBeTruthy();
    await user.click(entryButton('Card'));
    expect(screen.getByRole('article', { name: 'Card' })).toBeTruthy();
    fireEvent.click(
      within(summary).getByRole('button', { name: t('catalog.view.hideIssues') }),
    );
    expect(
      within(summary).queryByRole('group', { name: t('library.issues') }),
    ).toBeNull();
  });

  it('a package with no readable specialization renders empty without throwing', () => {
    view({}, buildCatalog([{ path: 'x.json', text: '{}' }]));
    expect(screen.getByText(t('catalog.view.empty'))).toBeTruthy();
  });
});
