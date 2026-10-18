import {
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
  type Project,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { CatalogView, resolveCatalogLink } from '../../../src/ui/catalog/CatalogView';
import { createCatalogRenderer } from '../../../src/ui/catalog/renderer';
import { emptyProject } from '../../model/fixtures';
import { material3Package } from '../../storage/packageFixture';

// B5: apresentação do Catálogo (lista, página, galeria, playground) sobre o Material 3.

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
  locale.value = 'pt-BR';
  rasterize.mockClear();
});
afterEach(cleanup);

/** Troca campos de uma entrada (o catálogo é de dados simples). */
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

describe('lista', () => {
  it('lista os 15 componentes por camada, com selo de container e tamanho', () => {
    view();
    const list = screen.getByRole('navigation', { name: t('catalog.view.components') });
    expect(within(list).getAllByRole('button').length).toBe(15);
    const column = entryButton('Column');
    expect(within(column).getByText(t('library.container'))).toBeTruthy();
    expect(within(column).getByText('380 × 200')).toBeTruthy();
  });

  it('busca por texto filtra e avisa quando nada bate', async () => {
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

  it('escolher um item abre a página dele (o primeiro vem aberto no split)', async () => {
    const { user } = view();
    expect(screen.getByRole('article', { name: 'Top app bar' })).toBeTruthy();
    await user.click(entryButton('Chip'));
    expect(screen.getByRole('article', { name: 'Chip' })).toBeTruthy();
    expect(entryButton('Chip').getAttribute('aria-current')).toBe('true');
  });

  it('setas movem o foco entre os itens', async () => {
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

  it('initialTypeId abre a página do tipo', () => {
    view({ initialTypeId: 'm3-fab' });
    expect(screen.getByRole('article', { name: 'FAB' })).toBeTruthy();
  });
});

describe('página', () => {
  it('mostra a tabela de propriedades gerada dos campos', () => {
    view({ initialTypeId: 'm3-button' });
    const section = screen.getByRole('region', { name: t('catalog.page.properties') });
    const table = within(section).getByRole('table');
    const row = within(table).getByText('variant').closest('tr') as HTMLElement;
    expect(within(row).getByText(t('catalog.page.type.enum'))).toBeTruthy();
    expect(row.textContent).toContain('filled');
    expect(within(table).getByText('label')).toBeTruthy();
  });

  it('colunas de tabela aparecem aninhadas', () => {
    const catalog = patched(base, 'm3-card', {
      fields: [
        {
          key: 'rows',
          label: 'Linhas',
          type: 'table',
          required: true,
          columns: [{ key: 'cell', label: 'Célula', type: 'string', required: false }],
        },
      ],
    });
    view({ initialTypeId: 'm3-card' }, catalog);
    const cell = screen.getByText('cell').closest('tr') as HTMLElement;
    expect(cell.getAttribute('data-depth')).toBe('1');
  });

  it('mostra o documento em markdown', () => {
    view({ initialTypeId: 'm3-button' });
    const section = screen.getByRole('region', { name: t('catalog.page.document') });
    expect(section.querySelector('.markdown')).toBeTruthy();
  });

  it('sem documento, mostra a mensagem', () => {
    view({ initialTypeId: 'm3-button' }, patched(base, 'm3-button', { docText: null }));
    expect(screen.getByText(t('catalog.page.noDoc'))).toBeTruthy();
  });

  it('imagem do markdown não vira <img>', () => {
    const catalog = patched(base, 'm3-button', {
      docText: '![x](https://example.com/a.png)\n\n<img src="x">',
    });
    view({ initialTypeId: 'm3-button' }, catalog);
    const section = screen.getByRole('region', { name: t('catalog.page.document') });
    expect(section.querySelector('img')).toBeNull();
  });

  it('avisa quando o componente não carregou', () => {
    const catalog = patched(base, 'm3-button', {
      component: null,
      componentProblem: 'arquivo ausente (x.json)',
      previewValues: null,
    });
    view({ initialTypeId: 'm3-button' }, catalog);
    expect(
      screen.getByText(
        t('catalog.page.componentProblem', { problem: 'arquivo ausente (x.json)' }),
      ),
    ).toBeTruthy();
    expect(screen.getByText(t('catalog.playground.noComponent'))).toBeTruthy();
  });

  it('origens aparecem agrupadas por sistema', () => {
    view({ initialTypeId: 'm3-button' });
    const section = screen.getByRole('region', { name: t('catalog.page.sources') });
    expect(within(section).getAllByRole('heading', { level: 4 }).length).toBeGreaterThan(
      0,
    );
  });
});

describe('código', () => {
  const code = [
    {
      platform: { id: 'android', name: 'Android', language: 'Kotlin' },
      symbol: 'MyButton',
      path: 'app/ui/MyButton.kt',
      params: { onClick: 'lambda' },
      values: { variant: { filled: 'Filled' } },
      notes: 'Usa o tema padrão.',
    },
  ];

  it('sem projeto o path é só texto', () => {
    view({ initialTypeId: 'm3-button' }, patched(base, 'm3-button', { code }));
    const section = screen.getByRole('region', { name: t('catalog.page.code') });
    expect(within(section).getByText('MyButton')).toBeTruthy();
    expect(within(section).getByText('app/ui/MyButton.kt').closest('a')).toBeNull();
    expect(within(section).getByText('Usa o tema padrão.')).toBeTruthy();
    expect(within(section).getByText('onClick')).toBeTruthy();
  });

  it('com projeto e urlTemplate o path vira link', () => {
    const project: Project = {
      ...emptyProject(),
      platformRepos: {
        android: { urlTemplate: 'https://git.example/repo/{path}', localPath: '' },
      },
    };
    view({ initialTypeId: 'm3-button', project }, patched(base, 'm3-button', { code }));
    const section = screen.getByRole('region', { name: t('catalog.page.code') });
    const link = within(section).getByText('app/ui/MyButton.kt').closest('a');
    expect(link?.getAttribute('href')).toBe(
      'https://git.example/repo/app/ui/MyButton.kt',
    );
  });
});

describe('galeria', () => {
  it('gera uma imagem estática por exemplo mais a prévia, com alt do nome', () => {
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

  it('usa o cache: reabrir a mesma página não rasteriza de novo', async () => {
    const engine = renderer();
    const { user } = view({ initialTypeId: 'm3-button', renderer: engine });
    const galleryCalls = () => rasterize.mock.calls.length;
    await user.click(entryButton('Chip'));
    await user.click(entryButton('Button'));
    const after = galleryCalls();
    await user.click(entryButton('Chip'));
    await user.click(entryButton('Button'));
    // O playground rasteriza de novo; a galeria não: no máximo 2 chamadas a mais (uma por página).
    expect(galleryCalls() - after).toBeLessThanOrEqual(2);
  });

  it('exemplo que não desenha mostra o motivo', () => {
    const catalog = patched(base, 'm3-button', {
      examples: [{ name: 'Quebrado', mode: 'system', system: 'nenhum', file: 'x.json' }],
    });
    view({ initialTypeId: 'm3-button' }, catalog);
    expect(screen.getByText(t('catalog.gallery.unavailable'))).toBeTruthy();
    expect(screen.getByText('Quebrado')).toBeTruthy();
  });
});

describe('playground', () => {
  const stage = () => screen.getByRole('region', { name: t('catalog.playground.title') });

  it('editar um campo redesenha', async () => {
    const { user } = view({ initialTypeId: 'm3-button' });
    await waitFor(() => expect(within(stage()).getByRole('img')).toBeTruthy());
    const before = within(stage()).getByRole('img').getAttribute('src');
    const label = within(stage()).getByRole<HTMLInputElement>('textbox', {
      name: /label/i,
    });
    await user.clear(label);
    await user.type(label, 'Novo texto{Enter}');
    await waitFor(() =>
      expect(within(stage()).getByRole('img').getAttribute('src')).not.toBe(before),
    );
  });

  const buttonEntry = () => {
    const entry = base.layers
      .flatMap((l) => l.entries)
      .find((e) => e.type.id === 'm3-button');
    if (entry === undefined) throw new Error('sem botão');
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

  it('a largura começa automática e acompanha o texto', async () => {
    const { user } = view({ initialTypeId: 'm3-button' });
    expect(widthField().value).toBe(autoWidthOf('Label'));
    expect(heightField().value).toBe('40');
    expect(within(stage()).getByText(t('catalog.playground.autoWidth'))).toBeTruthy();
    const label = within(stage()).getByRole<HTMLInputElement>('textbox', {
      name: /label/i,
    });
    await user.clear(label);
    await user.type(label, 'Confirmar compra{Enter}');
    await waitFor(() => expect(widthField().value).toBe(autoWidthOf('Confirmar compra')));
    expect(Number(widthField().value)).toBeGreaterThan(120);
    expect(heightField().value).toBe('40');
    await waitFor(() =>
      expect(within(stage()).queryByText(/conteúdo maior que a caixa/)).toBeNull(),
    );
  });

  it('digitar uma largura a torna manual e limitada', async () => {
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
    await user.type(label, 'Confirmar compra{Enter}');
    await waitFor(() => expect(label.value).toBe('Confirmar compra'));
    expect(widthField().value).toBe('200');
  });

  it('Restaurar valores volta ao inicial e ao automático', async () => {
    const { user } = view({ initialTypeId: 'm3-button' });
    const label = within(stage()).getByRole<HTMLInputElement>('textbox', {
      name: /label/i,
    });
    await user.clear(label);
    await user.type(label, 'Confirmar compra{Enter}');
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

describe('navegação', () => {
  it('abrir outro componente leva a rolagem ao topo (tela cheia)', async () => {
    const { user, container } = view({ initialTypeId: 'm3-button' });
    const detail = container.querySelector<HTMLElement>('.catalog-detail');
    if (detail === null) throw new Error('sem detalhe');
    detail.scrollTop = 500;
    await user.click(entryButton('Chip'));
    await waitFor(() => expect(detail.scrollTop).toBe(0));
  });

  it('abrir outro componente leva a rolagem ao topo (diálogo)', async () => {
    const catalog = patched(base, 'm3-card', {
      docText: '[ir](mapping://material3/m3-chip)',
    });
    const { user } = view({ layout: 'list' }, catalog);
    await user.click(entryButton('Card'));
    const dialog = await screen.findByRole('dialog');
    const body = dialog.querySelector<HTMLElement>('.dialog-body');
    if (body === null) throw new Error('sem corpo');
    body.scrollTop = 500;
    await user.click(within(dialog).getByRole('link', { name: 'ir' }));
    await waitFor(() => expect(body.scrollTop).toBe(0));
    expect(within(dialog).getByRole('article', { name: 'Chip' })).toBeTruthy();
  });

  it('destino desconhecido avisa em região de status dentro da área que rola', async () => {
    const markdown = '[quebrado](mapping://material3/nao-existe)';
    const catalog = patched(base, 'm3-button', { docText: markdown });
    const { user, container } = view({ initialTypeId: 'm3-button' }, catalog);
    await user.click(screen.getByRole('link', { name: 'quebrado' }));
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('mapping://material3/nao-existe');
    expect(notice.classList.contains('catalog-notice')).toBe(true);
    expect(container.querySelector('.catalog-detail')?.contains(notice)).toBe(true);
  });
});

describe('layout list', () => {
  it('só a lista; escolher abre a página num diálogo', async () => {
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

describe('Adicionar à tela', () => {
  it('chama o callback com o id do tipo', async () => {
    const onAddToScreen = vi.fn();
    const { user } = view({ initialTypeId: 'm3-button', onAddToScreen });
    await user.click(screen.getByRole('button', { name: t('catalog.page.addToScreen') }));
    expect(onAddToScreen).toHaveBeenCalledWith('m3-button');
  });

  it('desabilitado mostra o motivo no title', () => {
    view({
      initialTypeId: 'm3-button',
      onAddToScreen: vi.fn(),
      addDisabledReason: 'Selecione uma tela',
    });
    const button = screen.getByRole<HTMLButtonElement>('button', {
      name: t('catalog.page.addToScreen'),
    });
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Selecione uma tela');
  });

  it('sem callback não há botão', () => {
    view({ initialTypeId: 'm3-button' });
    expect(
      screen.queryByRole('button', { name: t('catalog.page.addToScreen') }),
    ).toBeNull();
  });
});

describe('links mapping://', () => {
  it('resolve specId/typeId, só typeId e rejeita o resto', () => {
    expect(resolveCatalogLink(base, 'material3', 'mapping://material3/m3-card')).toBe(
      'm3-card',
    );
    expect(resolveCatalogLink(base, 'material3', 'mapping://m3-card')).toBe('m3-card');
    expect(resolveCatalogLink(base, 'material3', 'mapping://outro/m3-card')).toBeNull();
    expect(
      resolveCatalogLink(base, 'material3', 'mapping://material3/nao-existe'),
    ).toBeNull();
  });

  it('clicar num link navega; destino desconhecido avisa sem navegar', async () => {
    const catalog = patched(base, 'm3-button', {
      docText: '[card](mapping://material3/m3-card) e [fantasma](mapping://material3/xx)',
    });
    const { user } = view({ initialTypeId: 'm3-button' }, catalog);
    await user.click(screen.getByRole('link', { name: 'fantasma' }));
    expect(screen.getByRole('status').textContent).toContain('mapping://material3/xx');
    expect(screen.getByRole('article', { name: 'Button' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'card' }));
    expect(screen.getByRole('article', { name: 'Card' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('validação', () => {
  it('sem problemas mostra a mensagem de pacote válido', () => {
    const clean: Catalog = {
      ...base,
      report: { ...base.report, issues: [], errors: [], warnings: [] },
    };
    view({}, clean);
    const summary = screen.getByRole('region', { name: t('catalog.view.validation') });
    expect(summary.textContent).toContain(t('catalog.view.valid'));
  });

  it('lista longa de avisos começa recolhida e expande', async () => {
    const { user } = view();
    const summary = screen.getByRole('region', { name: t('catalog.view.validation') });
    expect(within(summary).queryByRole('group')).toBeNull();
    await user.click(
      within(summary).getByRole('button', { name: t('catalog.view.showIssues') }),
    );
    expect(
      within(summary).getByRole('group', { name: t('library.issues') }),
    ).toBeTruthy();
  });

  it('pacote com erros avisa, lista os problemas e ainda navega', async () => {
    const broken = new Map(files.map((f) => [f.path, f]));
    broken.set('components/m3-button.json', {
      path: 'components/m3-button.json',
      text: '{ não é json',
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

  it('pacote sem especialização legível renderiza vazio sem lançar', () => {
    view({}, buildCatalog([{ path: 'x.json', text: '{}' }]));
    expect(screen.getByText(t('catalog.view.empty'))).toBeTruthy();
  });
});
