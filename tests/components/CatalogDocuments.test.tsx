import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import {
  type Catalog,
  type CatalogDocument,
  approximateMeasurer,
  buildCatalog,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { CatalogView } from '../../src/ui/catalog/CatalogView';
import { createCatalogRenderer } from '../../src/ui/catalog/renderer';
import { material3Package } from '../storage/packageFixture';

// Documents group of the Catalog (stage #1901, phase CX5, decision 23).

const files = [...material3Package()].map(([path, content]) =>
  typeof content === 'string' ? { path, text: content } : { path, binary: true },
);
const base: Catalog = buildCatalog(files);

const REPO_URL = 'https://gitlab.empresa.com/grupo/design-docs';
const URL_FILE = `${REPO_URL}/-/blob/main/guides/motion.md`;
const DOCS: readonly CatalogDocument[] = [
  {
    id: 'getting-started',
    name: 'Getting started',
    docText: '# Intro\n\nWelcome text. See [the button](mapping://m3-button).',
    docExternal: null,
  },
  {
    id: 'motion',
    name: 'Motion guide',
    docText: null,
    docExternal: {
      repo: 'design-docs',
      path: 'guides/motion.md',
      repoUrl: REPO_URL,
      url: URL_FILE,
    },
  },
];

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function view(documents: readonly CatalogDocument[]) {
  const user = userEvent.setup();
  render(
    <CatalogView
      catalog={{ ...base, documents }}
      specId="material3"
      version={1}
      layout="split"
      renderer={createCatalogRenderer(
        approximateMeasurer,
        () => 'data:image/png;base64,x',
      )}
    />,
  );
  return { user };
}

const list = () => screen.getByRole('navigation', { name: t('catalog.view.components') });
const docButton = (name: string) =>
  within(list()).getByRole<HTMLButtonElement>('button', { name: new RegExp(`^${name}`) });

describe('Documents group', () => {
  it('sits above the layers and lists the documents by name', () => {
    view(DOCS);
    const group = within(list()).getByRole('region', { name: t('catalog.documents') });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Getting started', 'Motion guide']);
    const firstLayer = base.layers[0];
    const layerSection = within(list()).getByRole('region', { name: firstLayer?.name });
    expect(
      group.compareDocumentPosition(layerSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is filtered by the search box and hidden when nothing matches', async () => {
    const { user } = view(DOCS);
    const search = screen.getByRole('searchbox', { name: t('catalog.view.search') });
    await user.type(search, 'motion');
    const group = within(list()).getByRole('region', { name: t('catalog.documents') });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Motion guide']);
    await user.clear(search);
    await user.type(search, 'button');
    expect(
      within(list()).queryByRole('region', { name: t('catalog.documents') }),
    ).toBeNull();
  });

  it('does not exist without documents', () => {
    view([]);
    expect(
      within(list()).queryByRole('region', { name: t('catalog.documents') }),
    ).toBeNull();
    expect(screen.queryByText(t('catalog.documents'))).toBeNull();
  });
});

describe('document page', () => {
  it('shows name, id and the markdown text; a mapping:// link opens the type page', async () => {
    const { user } = view(DOCS);
    await user.click(docButton('Getting started'));
    const page = screen.getByRole('article', { name: 'Getting started' });
    expect(within(page).getByText('getting-started')).toBeTruthy();
    expect(within(page).getByText(/Welcome text/)).toBeTruthy();
    expect(docButton('Getting started').getAttribute('aria-current')).toBe('true');
    await user.click(within(page).getByRole('link', { name: 'the button' }));
    expect(screen.getByRole('article', { name: 'Button' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Getting started' })).toBeNull();
    expect(docButton('Getting started').getAttribute('aria-current')).toBeNull();
  });

  it('an external document shows the link to the file', async () => {
    const { user } = view(DOCS);
    await user.click(docButton('Motion guide'));
    const page = screen.getByRole('article', { name: 'Motion guide' });
    const links = within(page).getAllByRole('link');
    expect(links.some((a) => a.getAttribute('href') === URL_FILE)).toBe(true);
  });
});
