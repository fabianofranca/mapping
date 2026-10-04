import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import {
  addImage,
  applySpecialization,
  canvasPoint,
  createProject,
  drawMarking,
  exportMapping,
  isMobile,
  openDetails,
  openExport,
} from './helpers';

const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');

test('projeto novo → imagem → marcação → anotação → zip com o mapping.json', async ({
  page,
}, info) => {
  await createProject(page, 'Projeto E2E');
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));

  await openDetails(page);
  await page
    .getByRole('button', { name: /Adicionar anotação na camada/ })
    .first()
    .click();
  await page.getByLabel('Nome da anotação').fill('Botão Entrar');
  await page.getByLabel('Nome da anotação').press('Enter');
  await page.getByRole('button', { name: '+ Par' }).click();
  await page.getByLabel('Chave').fill('acao');
  await page.getByLabel('Chave').press('Tab');
  await page.getByLabel('Valor').fill('login');
  await page.getByLabel('Valor').press('Enter');

  const { mapping, files } = await exportMapping(page);
  expect(mapping.schemaVersion).toBe(4);
  expect(files).toContain('images/tela.webp');
  expect(mapping.images).toHaveLength(1);
  expect(mapping.images[0]).toMatchObject({
    file: 'images/tela.webp',
    width: 400,
    height: 800,
  });
  expect(mapping.markings).toHaveLength(1);
  const marking = mapping.markings[0];
  if (!marking) throw new Error('sem marcação');
  expect(marking.imageId).toBe(mapping.images[0]?.id);
  // O retângulo vai em pixels da imagem original, dentro dela.
  const { x, y, width, height } = marking.rect;
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(x + width).toBeLessThanOrEqual(400);
  expect(y + height).toBeLessThanOrEqual(800);
  expect(mapping.annotations).toHaveLength(1);
  expect(mapping.annotations[0]).toMatchObject({
    markingId: marking.id,
    name: 'Botão Entrar',
    type: null,
  });
  expect(mapping.annotations[0]?.entries.map((e) => [e.key, e.value])).toEqual([
    ['acao', 'login'],
  ]);
});

test('exemplo SDUI → Input com `dado` apontando para uma tupla livre', async ({
  page,
}, info) => {
  await createProject(page, 'Projeto SDUI');
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  await applySpecialization(page, SDUI);

  // Anotação livre com a tupla `name: string` (camada livre).
  await openDetails(page);
  await page
    .getByRole('button', { name: 'Adicionar anotação na camada Camada 1' })
    .first()
    .click();
  await page.getByLabel('Nome da anotação').fill('User');
  await page.getByLabel('Nome da anotação').press('Enter');
  await page.getByRole('button', { name: '+ Par' }).click();
  await page.getByLabel('Chave').fill('name');
  await page.getByLabel('Chave').press('Tab');
  await page.getByLabel('Valor').fill('string');
  await page.getByLabel('Valor').press('Enter');

  // Input na camada de componentes.
  await page
    .getByRole('button', { name: 'Adicionar anotação na camada Componentes' })
    .click();
  await page.getByRole('button', { name: /^Input/ }).click();
  await page.getByLabel('id', { exact: true }).fill('input_nome');
  await page.getByLabel('id', { exact: true }).press('Enter');
  // Seletor de referência em popup (B14): busca e Enter escolhe.
  const dado = page.getByRole('button', { name: /^dado: / });
  await dado.click();
  await page.getByRole('combobox', { name: 'Buscar alvo' }).fill('name');
  await page.getByRole('combobox', { name: 'Buscar alvo' }).press('Enter');
  await expect(dado).toContainText('→ User.name');

  const { mapping } = await exportMapping(page);
  expect(mapping.specializations).toEqual(
    [{ id: 'sdui', version: 1 }].map((s) => expect.objectContaining(s)),
  );
  const free = mapping.annotations.find((a) => a.type === null);
  const input = mapping.annotations.find((a) => a.type?.typeId === 'input');
  expect(free?.entries).toHaveLength(1);
  expect(input?.type).toEqual({ specId: 'sdui', typeId: 'input' });
  expect(input?.values).toMatchObject({
    id: 'input_nome',
    dado: { annotationId: free?.id, entryId: free?.entries[0]?.id },
  });
});

test('caixa de seleção e texto de "Texto no canvas" ficam na mesma linha', async ({
  page,
}) => {
  await page.goto('/');
  // Configurações é um diálogo: botão da coluna lateral (desktop) ou da barra (celular).
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const check = page.getByLabel('Texto no canvas');
  const text = page.locator('label.choice .choice-label').first();
  await expect(check).toBeVisible();
  const [c, s] = await Promise.all([check.boundingBox(), text.boundingBox()]);
  if (!c || !s) throw new Error('sem bounding box');
  // Mesma faixa vertical (as caixas se sobrepõem) e a caixa fica à esquerda do texto.
  expect(c.y).toBeLessThan(s.y + s.height);
  expect(s.y).toBeLessThan(c.y + c.height);
  expect(c.x + c.width).toBeLessThanOrEqual(s.x + 1);
});

// R4: estrutura do editor no desktop (B1, B2, B8, B11, P4).
test('desktop: janelas de ferramenta abrem, redimensionam e ficam guardadas', async ({
  page,
}, info) => {
  test.skip(isMobile(info), 'janelas de ferramenta: só no layout de desktop');
  await createProject(page, 'Janelas');

  // Barra de status e breadcrumbs sem seleção.
  await expect(page.getByText('schema v4')).toBeVisible();
  await expect(page.locator('.crumbs')).toContainText('Nada selecionado');

  // Árvore e Detalhes abrem por padrão; a Lista abre pela faixa.
  const tree = page.getByRole('region', { name: 'Árvore de marcações' });
  const list = page.getByRole('region', { name: 'Lista de anotações' });
  await expect(tree).toBeVisible();
  await expect(page.getByRole('region', { name: 'Detalhes' })).toBeVisible();
  await expect(list).toBeHidden();
  await page.getByRole('button', { name: 'Mostrar Lista de anotações' }).click();
  await expect(list).toBeVisible();

  // Fechar pelo cabeçalho; reabrir pelo atalho oficial (Ctrl+Shift+4).
  await page.getByRole('button', { name: 'Fechar a janela Lista de anotações' }).click();
  await expect(list).toBeHidden();
  await page.keyboard.press('Control+Shift+Digit4');
  await expect(list).toBeVisible();

  // A janela inferior tem uma aba por janela (R7): Incompletas (5) e Diagnóstico (6).
  await page.keyboard.press('Control+Shift+Digit5');
  await expect(page.getByRole('region', { name: 'Incompletas' })).toBeVisible();
  await expect(list).toBeHidden();
  await page.keyboard.press('Control+Shift+Digit6');
  await expect(page.getByRole('region', { name: 'Diagnóstico' })).toBeVisible();
  await page.getByRole('tab', { name: 'Lista' }).click();
  await expect(list).toBeVisible();

  // Ctrl+Shift+setas redimensionam a janela em foco, em passos de 16px.
  const width = () =>
    tree.evaluate((el: HTMLElement) => el.getBoundingClientRect().width);
  const before = await width();
  await tree.focus();
  await page.keyboard.press('Control+Shift+ArrowRight');
  expect(await width()).toBe(before + 16);

  // O layout fica guardado: volta à tela inicial e abre o projeto de novo.
  await page.getByRole('button', { name: 'Ações do projeto' }).click();
  await page.getByRole('button', { name: 'Fechar projeto', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await expect(list).toBeVisible();
  expect(await width()).toBe(before + 16);
});

// R6: Árvore e Camadas como janelas à esquerda (B3).
test('desktop: Árvore e Camadas dividem a coluna da esquerda', async ({ page }, info) => {
  test.skip(isMobile(info), 'janelas de ferramenta: só no layout de desktop');
  await createProject(page, 'Camadas');
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));

  const tree = page.getByRole('region', { name: 'Árvore de marcações' });
  const layers = page.getByRole('region', { name: 'Camadas', exact: true });
  await expect(tree).toBeVisible();
  await expect(layers).toBeVisible();
  const [t, l] = await Promise.all([tree.boundingBox(), layers.boundingBox()]);
  if (!t || !l) throw new Error('janelas sem tamanho');
  // Mesma largura e Camadas embaixo da Árvore.
  expect(l.width).toBe(t.width);
  expect(l.y).toBeGreaterThanOrEqual(t.y + t.height - 1);

  // Nova camada pelo cabeçalho; renomear na própria linha.
  await layers.getByRole('button', { name: 'Nova camada' }).click();
  const names = layers.getByLabel('Nome da camada');
  await expect(names).toHaveCount(2);
  await names.nth(1).fill('Pintura');
  await names.nth(1).press('Enter');
  await expect(names.nth(1)).toHaveValue('Pintura');

  // A paleta abre em popover, troca a cor e fecha.
  await layers.getByRole('button', { name: 'Cor da camada Pintura' }).click();
  const palette = page.getByRole('group', { name: 'Cor da camada Pintura' });
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: '#1E88E5' }).click();
  await expect(palette).toBeHidden();

  // A camada ativa muda pelo botão da linha; o chip da barra acompanha.
  await layers.getByRole('button', { name: 'Tornar ativa' }).click();
  await expect(
    page.getByRole('button', { name: 'Camadas (ativa: Pintura)' }),
  ).toBeVisible();

  // Excluir fica no menu da linha e pede confirmação.
  await layers.getByRole('button', { name: 'Mais ações da camada Pintura' }).click();
  await page.getByRole('button', { name: 'Excluir camada' }).click();
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(names).toHaveCount(1);

  // O modo "sem anotação" fica no rodapé da janela.
  const mode = layers.getByLabel('Marcações sem anotação');
  await mode.selectOption('hide');
  await expect(mode).toHaveValue('hide');
  await mode.selectOption('dim');

  // Fechar as Camadas deixa a Árvore sozinha; Ctrl+Shift+2 as reabre e foca.
  await page.getByRole('button', { name: 'Fechar a janela Camadas' }).click();
  await expect(layers).toBeHidden();
  await expect(tree).toBeVisible();
  await page.keyboard.press('Control+Shift+Digit2');
  await expect(layers).toBeVisible();
  await expect(layers).toBeFocused();
  // O chip da barra leva o foco de volta para a janela.
  await tree.focus();
  await page.getByRole('button', { name: /^Camadas \(ativa/ }).click();
  await expect(layers).toBeFocused();
});

test('desktop: a árvore recolhe nós, recolhe tudo e localiza a seleção', async ({
  page,
}, info) => {
  test.skip(isMobile(info), 'janelas de ferramenta: só no layout de desktop');
  await createProject(page, 'Árvore');
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page), { width: 160, height: 160 });
  await drawMarking(page, info, await canvasPoint(page, 0.7), { width: 80, height: 60 });

  const tree = page.getByRole('region', { name: 'Árvore de marcações' });
  const rows = tree.locator('.tree-item');
  await expect(rows).toHaveCount(3);
  // A altura da linha segue a densidade do desktop (28px).
  const box = await rows.first().boundingBox();
  expect(box?.height).toBe(28);

  await tree.getByRole('button', { name: /^Recolher images\/tela/ }).click();
  await expect(rows).toHaveCount(1);
  await tree.getByRole('button', { name: /^Expandir images\/tela/ }).click();
  await expect(rows).toHaveCount(3);

  await tree.getByRole('button', { name: 'Recolher tudo' }).click();
  await expect(rows).toHaveCount(1);
  // Localizar abre os ancestrais da seleção e põe o foco na linha dela.
  await tree.getByRole('button', { name: 'Localizar a seleção na árvore' }).click();
  await expect(rows).toHaveCount(3);
  await expect(tree.locator('.tree-item[aria-current="true"]')).toBeFocused();
});

// R8: celular com barra de cima, Painéis, telas cheias e gaveta de três alturas (B6, B7).
test('celular: Camadas em tela cheia, com a paleta e o menu da linha', async ({
  page,
}, info) => {
  test.skip(!isMobile(info), 'telas cheias: só no celular');
  await createProject(page, 'Camadas celular');
  // O chip da camada ativa abre Camadas em tela cheia (B3, B6).
  await page.getByRole('button', { name: /^Camadas \(ativa/ }).tap();
  const screen = page.getByRole('region', { name: 'Camadas', exact: true });
  await expect(screen).toBeVisible();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeHidden();

  await screen.getByRole('button', { name: 'Nova camada' }).tap();
  const names = screen.getByLabel('Nome da camada');
  await expect(names).toHaveCount(2);
  // Área de toque de 44px nos botões da linha.
  const more = await screen
    .getByRole('button', { name: /^Mais ações da camada/ })
    .first()
    .boundingBox();
  expect(more?.height).toBeGreaterThanOrEqual(44);

  await screen
    .getByRole('button', { name: /^Cor da camada/ })
    .first()
    .tap();
  const palette = page.getByRole('group', { name: /^Cor da camada/ });
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: '#1E88E5' }).tap();
  await expect(palette).toBeHidden();

  // A faixa de abas troca de janela; voltar devolve o canvas.
  await page.getByRole('tab', { name: 'Lista' }).tap();
  await expect(page.getByRole('region', { name: 'Lista de anotações' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao canvas' }).tap();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
});

// O `tap` do Playwright e o arraste por CDP do helper `drag` não se misturam num mesmo
// teste: um deixa estado de toque que atrapalha o outro (o toque some, ou o arraste
// vira pinça). Por isso os toques ficam num teste e o desenho, com `click`, no outro.
test('celular: gaveta de três alturas e menu Painéis, com toque', async ({
  page,
}, info) => {
  test.skip(!isMobile(info), 'layout do celular');
  await createProject(page, 'Painéis');
  await addImage(page);

  // Gaveta: recolhida (64px), aberta (72%) e tela cheia (Detalhes).
  const sheet = page.getByRole('region', { name: 'Detalhes' });
  const peek = await sheet.boundingBox();
  expect(peek?.height).toBeLessThanOrEqual(72);
  await page.getByRole('button', { name: 'Mostrar detalhes', exact: true }).tap();
  // `boundingBox` não espera: só mede depois que a gaveta aparece aberta.
  await expect(page.getByRole('button', { name: 'Esconder detalhes' })).toBeVisible();
  await expect
    .poll(async () => (await sheet.boundingBox())?.height ?? 0)
    .toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Abrir Detalhes em tela cheia' }).tap();
  await expect(page.getByRole('tab', { name: 'Detalhes' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Voltar ao canvas' }).tap();
  await page.getByRole('button', { name: 'Esconder detalhes' }).tap();
  await expect(
    page.getByRole('button', { name: 'Mostrar detalhes', exact: true }),
  ).toBeVisible();

  // Painéis: as seis janelas e as ações do projeto.
  await page.getByRole('button', { name: /^Painéis/ }).tap();
  const menu = page.getByRole('dialog', { name: 'Painéis e ações' });
  await expect(menu).toBeVisible();
  for (const name of ['Especializações', 'Exportar', 'Ajuda', 'Configurações']) {
    await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await menu.getByRole('button', { name: /^Árvore de marcações/ }).tap();
  await expect(menu).toBeHidden();
  const tree = page.getByRole('region', { name: 'Árvore de marcações' });
  await expect(tree).toBeVisible();
  // Escolher na árvore seleciona e volta ao canvas, com o caminho nos breadcrumbs.
  await tree.getByRole('button', { name: /^images\/tela/ }).tap();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Caminho da seleção' }),
  ).toContainText('images/tela.webp');

  // O ⋯ da barra de cima abre o mesmo menu.
  await page.getByRole('button', { name: 'Mais: painéis e ações' }).tap();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('celular: marcação em Detalhes na gaveta e em tela cheia, sem rolagem lateral', async ({
  page,
}, info) => {
  test.skip(!isMobile(info), 'layout do celular');
  await createProject(page, 'Gaveta');
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));

  // Nada passa da largura da tela.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Mostrar detalhes', exact: true }).click();
  await expect(page.getByLabel('X', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Detalhes em tela cheia' }).click();
  await expect(page.getByLabel('X', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao canvas' }).click();
  // A gaveta volta aberta, e os breadcrumbs mostram o caminho da marcação.
  await expect(page.getByRole('button', { name: 'Esconder detalhes' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Caminho da seleção' }),
  ).toContainText('images/tela.webp');
});

// R5: Detalhes redesenhado (B15, P6 e os atalhos Alt+N e Alt+Enter).
test('desktop: Detalhes com atalhos, arrasto de pares e seções recolhíveis', async ({
  page,
}, info) => {
  test.skip(isMobile(info), 'atalhos de teclado e arrasto com mouse: layout de desktop');
  await createProject(page, 'Detalhes');
  await addImage(page);
  await drawMarking(page, info, await canvasPoint(page));
  const details = page.getByRole('region', { name: 'Detalhes' });

  // Alt+N: nova anotação na camada ativa, com o foco no nome.
  await page.keyboard.press('Alt+KeyN');
  const name = details.getByLabel('Nome da anotação');
  await expect(name).toBeFocused();
  await name.fill('Botão');
  await name.press('Enter');

  // + Par e Alt+Enter criam pares.
  await details.getByRole('button', { name: '+ Par' }).click();
  await details.getByLabel('Chave').fill('a');
  await details.getByLabel('Chave').press('Tab');
  await details.getByLabel('Valor').fill('1');
  await details.getByLabel('Valor').press('Alt+Enter');
  const keys = details.getByLabel('Chave');
  await expect(keys.nth(1)).toBeFocused();
  await keys.nth(1).fill('b');
  await keys.nth(1).press('Enter');
  await expect(keys).toHaveCount(2);

  // Arrastar o par "b" pela alça para cima de "a" (P6).
  const grip = details.getByRole('button', { name: 'Mover o par b' });
  const target = details.getByRole('button', { name: 'Mover o par a' });
  const from = await grip.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('sem alças');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 5 });
  await page.mouse.up();
  await expect(keys.nth(0)).toHaveValue('b');
  await expect(keys.nth(1)).toHaveValue('a');

  // Seção Marcação recolhida: mostra o resumo e esconde os campos (B15).
  await details.getByRole('button', { name: /^Marcação/ }).click();
  await expect(details.getByLabel('X', { exact: true })).toBeHidden();
  await expect(details.getByText(/^X \d+ · Y \d+ · \d+ × \d+ px$/)).toBeVisible();

  const { mapping } = await exportMapping(page);
  expect(mapping.annotations[0]?.entries.map((e) => e.key)).toEqual(['b', 'a']);
});

// R9: diálogos e tela inicial (B9, B10, B16, P8, P10).
test('tela inicial: ações, busca e tabela de recentes (desktop) ou cartões (celular)', async ({
  page,
}, info) => {
  await createProject(page, 'Carro');
  await page.getByRole('button', { name: 'Ações do projeto' }).click();
  await page.getByRole('button', { name: 'Fechar projeto', exact: true }).click();

  await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Abrir zip/ })).toBeVisible();
  if (isMobile(info)) {
    await expect(page.locator('.action-card')).toHaveCount(3);
    await expect(page.getByRole('table')).toHaveCount(0);
  } else {
    await expect(page.getByRole('table')).toContainText('Neste dispositivo');
    await expect(page.getByRole('complementary', { name: 'Tela inicial' })).toBeVisible();
  }

  // A busca ignora acentos e maiúsculas.
  await page.getByRole('searchbox', { name: 'Buscar projetos' }).fill('CARRO');
  await expect(page.getByText('Carro', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar projetos' }).fill('zzz');
  await expect(page.getByText('Nenhum projeto encontrado para "zzz".')).toBeVisible();
});

test('Ajuda: busca e seção Atalhos; Configurações leva até ela', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const settings = page.getByRole('dialog');

  // Tema em segmentado.
  const theme = settings.getByRole('group', { name: 'Tema' });
  await theme.getByRole('button', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await theme.getByRole('button', { name: 'Claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // No celular o diálogo ocupa a tela toda.
  if (isMobile(info)) {
    const box = await settings.boundingBox();
    expect(box?.width).toBe(380);
  }

  await settings.getByRole('button', { name: 'Ver os atalhos de teclado' }).click();
  const help = page.getByRole('dialog');
  await expect(
    help.getByRole('heading', { name: 'Atalhos de teclado' }),
  ).toBeInViewport();
  await expect(help.getByText('Ctrl', { exact: true }).first()).toBeVisible();

  await help.getByRole('searchbox', { name: 'Buscar na ajuda' }).fill('referencia');
  await expect(help.getByRole('link', { name: 'Atalhos de teclado' })).toHaveCount(0);
  await help.getByRole('button', { name: 'Fechar diálogo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Exportar: o diálogo mostra o arquivo e fecha pelo cabeçalho', async ({ page }) => {
  await createProject(page, 'Exporta');
  await addImage(page);
  await openExport(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.file-card')).toContainText('.zip');
  await expect(dialog.locator('.file-card')).toContainText('Arquivo zip');
  await dialog.getByRole('button', { name: 'Fechar diálogo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
