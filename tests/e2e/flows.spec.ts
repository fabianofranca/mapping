import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { join } from 'node:path';
import {
  addImage,
  applySpecialization,
  canvasPoint,
  createProject,
  drawMarking,
  exportMapping,
  openExport,
  selectedRect,
} from './helpers';

const SDUI = join(process.cwd(), 'examples', 'specs', 'sdui.json');
const MODELO = join(process.cwd(), 'examples', 'specs', 'modelo-de-dados.json');

test('projeto novo → imagem → marcação → anotação → zip com o mapping.json', async ({
  page,
}) => {
  await createProject(page, 'Projeto E2E');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
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
  expect(mapping.schemaVersion).toBe(13);
  expect(files).toContain('images/tela.webp');
  expect(mapping.containers).toHaveLength(1);
  expect(mapping.containers[0]).toMatchObject({
    file: 'images/tela.webp',
    width: 400,
    height: 800,
  });
  expect(mapping.markings).toHaveLength(1);
  const marking = mapping.markings[0];
  if (!marking) throw new Error('sem marcação');
  expect(marking.containerId).toBe(mapping.containers[0]?.id);
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
}) => {
  await createProject(page, 'Projeto SDUI');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await applySpecialization(page, SDUI);

  // Anotação livre com a tupla `name: string` (camada livre).
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
  // Uma seta só no campo: o ícone (etapa 7, O2); a seta em texto fica na dica.
  await expect(dado).toContainText('User.name');
  await expect(dado).not.toContainText('→');
  await expect(dado).toHaveAttribute('title', /→ User\.name/);

  const { mapping } = await exportMapping(page);
  expect(mapping.specializations).toEqual(
    // A biblioteca de notas já vem aplicada em todo projeto novo (ME3).
    [
      { id: 'notas', version: 2 },
      { id: 'sdui', version: 3 },
    ].map((s) => expect.objectContaining(s)),
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

test('caixa de seleção e texto de "Componentes sobre fotos" ficam na mesma linha', async ({
  page,
}) => {
  await page.goto('/');
  // Configurações é um diálogo: botão da coluna lateral (desktop) ou da barra (celular).
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const check = page.getByLabel('Mostrar componentes sobre fotos');
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
}) => {
  await createProject(page, 'Janelas');

  // Barra de status e breadcrumbs sem seleção.
  await expect(page.getByText('schema v13')).toBeVisible();
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
test('desktop: Árvore e Camadas dividem a coluna da esquerda', async ({ page }) => {
  await createProject(page, 'Camadas');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));

  const tree = page.getByRole('region', { name: 'Árvore de marcações' });
  const layers = page.getByRole('region', { name: 'Camadas', exact: true });
  await expect(tree).toBeVisible();
  await expect(layers).toBeVisible();
  const [t, l] = await Promise.all([tree.boundingBox(), layers.boundingBox()]);
  if (!t || !l) throw new Error('janelas sem tamanho');
  // Mesma largura e Camadas embaixo da Árvore.
  expect(l.width).toBe(t.width);
  expect(l.y).toBeGreaterThanOrEqual(t.y + t.height - 1);

  // Nova camada pelo cabeçalho; renomear na própria linha. O projeto novo já tem a camada
  // Notas (biblioteca de notas aplicada por padrão): a nova é a terceira.
  await layers.getByRole('button', { name: 'Nova camada' }).click();
  const names = layers.getByLabel('Nome da camada');
  await expect(names).toHaveCount(3);
  await names.nth(2).fill('Pintura');
  await names.nth(2).press('Enter');
  await expect(names.nth(2)).toHaveValue('Pintura');

  // A paleta abre em popover, troca a cor e fecha.
  await layers.getByRole('button', { name: 'Cor da camada Pintura' }).click();
  const palette = page.getByRole('group', { name: 'Cor da camada Pintura' });
  await expect(palette).toBeVisible();
  await palette.getByRole('button', { name: '#1E88E5' }).click();
  await expect(palette).toBeHidden();

  // A camada ativa muda pelo botão da linha; o chip da barra acompanha.
  await layers.getByRole('button', { name: 'Tornar ativa' }).last().click();
  await expect(
    page.getByRole('button', { name: 'Camadas (ativa: Pintura)' }),
  ).toBeVisible();

  // Excluir fica no menu da linha e pede confirmação.
  await layers.getByRole('button', { name: 'Mais ações da camada Pintura' }).click();
  await page.getByRole('button', { name: 'Excluir camada' }).click();
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(names).toHaveCount(2);

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
}) => {
  await createProject(page, 'Árvore');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page), { width: 160, height: 160 });
  await drawMarking(page, await canvasPoint(page, 0.7), { width: 80, height: 60 });

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
test('desktop: Detalhes com atalhos, arrasto de pares e seções recolhíveis', async ({
  page,
}) => {
  await createProject(page, 'Detalhes');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
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
test('tela inicial: ações, busca e tabela de recentes', async ({ page }) => {
  await createProject(page, 'Carro');
  await page.getByRole('button', { name: 'Ações do projeto' }).click();
  await page.getByRole('button', { name: 'Fechar projeto', exact: true }).click();

  await expect(page.getByRole('button', { name: /Novo projeto/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Abrir zip/ })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Neste dispositivo');
  await expect(page.getByRole('complementary', { name: 'Tela inicial' })).toBeVisible();

  // A busca ignora acentos e maiúsculas.
  await page.getByRole('searchbox', { name: 'Buscar projetos' }).fill('CARRO');
  await expect(page.getByText('Carro', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar projetos' }).fill('zzz');
  await expect(page.getByText('Nenhum projeto encontrado para "zzz".')).toBeVisible();
});

test('Ajuda: busca e seção Atalhos; Configurações leva até ela', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const settings = page.getByRole('dialog');

  // Tema em segmentado.
  const theme = settings.getByRole('group', { name: 'Tema' });
  await theme.getByRole('button', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await theme.getByRole('button', { name: 'Claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await settings.getByRole('button', { name: 'Ver os atalhos de teclado' }).click();
  const help = page.getByRole('dialog');
  await expect(
    help.getByRole('heading', { name: 'Atalhos de teclado' }),
  ).toBeInViewport();
  await expect(help.getByText('Ctrl', { exact: true }).first()).toBeVisible();

  // "referência" agora também está nos atalhos (copiar referência): usa um termo só de outras seções.
  await help.getByRole('searchbox', { name: 'Buscar na ajuda' }).fill('especializacao');
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

// Fase 6.1 (achado 7): no Chrome, Baixar abre o "Salvar como" (`showSaveFilePicker`) e o
// aviso "Alterações não exportadas" só sai depois de o zip ser gravado. O seletor é
// simulado: cancelar rejeita com `AbortError`; salvar devolve um arquivo do OPFS, gravado
// pelo `createWritable` de verdade.
async function simulateSavePicker(page: Page, outcome: 'cancel' | 'save'): Promise<void> {
  await page.evaluate((outcome) => {
    Reflect.set(window, 'showSaveFilePicker', async (options: unknown) => {
      Reflect.set(window, '__savePickerOptions', options);
      if (outcome === 'cancel') throw new DOMException('cancelado', 'AbortError');
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle('exportado.zip', { create: true });
    });
  }, outcome);
}

test('Exportar: cancelar o "Salvar como" mantém "Alterações não exportadas"', async ({
  page,
}) => {
  await createProject(page, 'Cancela');
  await addImage(page);
  const statusbar = page.locator('.statusbar');
  await expect(statusbar).toContainText('Alterações não exportadas');
  await simulateSavePicker(page, 'cancel');
  await openExport(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Baixar' }).click();
  await expect(dialog.getByRole('button', { name: 'Baixar' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(statusbar).toContainText('Alterações não exportadas');
});

test('Exportar: salvar pelo "Salvar como" grava o zip e limpa o aviso', async ({
  page,
}) => {
  await createProject(page, 'Salva');
  await addImage(page);
  const statusbar = page.locator('.statusbar');
  await expect(statusbar).toContainText('Alterações não exportadas');
  await simulateSavePicker(page, 'save');
  await openExport(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Baixar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(statusbar).not.toContainText('Alterações não exportadas');
  const options = await page.evaluate(() => Reflect.get(window, '__savePickerOptions'));
  expect(options).toMatchObject({ suggestedName: expect.stringMatching(/\.zip$/) });
  const bytes = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle('exportado.zip')).getFile();
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  });
  const zip = await JSZip.loadAsync(new Uint8Array(bytes));
  expect(Object.keys(zip.files)).toContain('mapping.json');
});

// Fase 5.8: só desktop. Abaixo de 900 px a app mostra o aviso no lugar do editor, sem
// desmontar nada; ao alargar, o editor volta com a mesma seleção e o mesmo zoom.
test('janela estreita: aviso no lugar do editor e volta ao alargar', async ({ page }) => {
  await createProject(page, 'Estreita');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  const rect = await selectedRect(page);
  await page.keyboard.press('Control+Equal');
  const zoom = page.locator('.zoom-field').first();
  const zoomText = await zoom.textContent();
  const host = page.locator('.canvas-host');
  const fits = await host.getAttribute('data-fits');

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(
    page.getByRole('heading', { name: 'Abra numa janela maior' }),
  ).toBeVisible();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('heading', { name: 'Abra numa janela maior' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await expect(zoom).toHaveText(zoomText ?? '');
  expect(await selectedRect(page)).toEqual(rect);
  // O canvas não foi remontado nem reenquadrado.
  expect(await host.getAttribute('data-fits')).toBe(fits);
});

// Etapa 6 (6.4), achado 2: dicas ocultas não alargam diálogos, janelas nem o editor.
// Mede os contêineres que rolam (overflow auto/scroll) e o `.editor` (que nunca rola).
async function horizontalOverflow(page: Page, root: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const found: string[] = [];
    for (const base of document.querySelectorAll<HTMLElement>(selector)) {
      for (const el of [base, ...base.querySelectorAll<HTMLElement>('*')]) {
        const overflowX = getComputedStyle(el).overflowX;
        const scrolls = overflowX === 'auto' || overflowX === 'scroll';
        if (!scrolls && !el.matches('.editor')) continue;
        if (el.scrollWidth > el.clientWidth || el.scrollLeft !== 0) {
          found.push(
            `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}x${el.clientWidth} (scrollLeft ${el.scrollLeft})`,
          );
        }
      }
    }
    return found;
  }, root);
}

test('sem barra horizontal: Configurações, janelas e o editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await horizontalOverflow(page, 'dialog[open]')).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar diálogo' }).click();

  await createProject(page, 'Sem rolagem');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await applySpecialization(page, SDUI);
  await page
    .getByRole('button', { name: /Adicionar anotação na camada/ })
    .first()
    .click();
  await page.getByLabel('Nome da anotação').fill('Botão');
  await page.getByLabel('Nome da anotação').press('Enter');
  expect(await horizontalOverflow(page, '.editor')).toEqual([]);

  // Levar à vista cada botão do editor (como a rolagem automática do relato) não o desloca.
  await page.evaluate(() => {
    for (const b of document.querySelectorAll<HTMLElement>('.editor button')) {
      b.scrollIntoView({ block: 'nearest', inline: 'end' });
    }
  });
  expect(await horizontalOverflow(page, '.editor')).toEqual([]);
});

// Etapa 6 (6.4), achado 3: com a janela Camadas baixa, o selo fica dentro da linha (a
// lista rola em vez de encolher as linhas). Achado 5: na largura padrão de Detalhes, as
// colunas da tabela não se sobrepõem.
test('selo da especialização dentro da linha com a janela Camadas baixa', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 639 });
  await createProject(page, 'Selos');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await applySpecialization(page, SDUI);
  await applySpecialization(page, MODELO);

  const layers = page.getByRole('region', { name: 'Camadas', exact: true });
  const rows = layers.locator('.layer-row');
  // As seis de antes mais a Notas (biblioteca de notas aplicada por padrão).
  await expect(rows).toHaveCount(7);
  for (const row of await rows.all()) {
    const badge = row.locator('.layer-badge');
    if ((await badge.count()) === 0) continue;
    const [r, b] = await Promise.all([row.boundingBox(), badge.boundingBox()]);
    if (!r || !b) continue; // fora da área visível da lista (que rola)
    expect(b.y + b.height).toBeLessThanOrEqual(r.y + r.height + 0.5);
  }
});

test('tabela `atributos` sem colunas sobrepostas na largura padrão de Detalhes', async ({
  page,
}) => {
  await createProject(page, 'Tabela');
  await addImage(page);
  await drawMarking(page, await canvasPoint(page));
  await applySpecialization(page, MODELO);
  await page
    .getByRole('button', { name: 'Adicionar anotação na camada Classes' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Classe/ })
    .click();
  const details = page.getByRole('region', { name: 'Detalhes' });
  await details.getByRole('button', { name: '+ Linha' }).click();
  await details.getByLabel('exemplo (Linha 1)').fill('ana@exemplo.com');
  await details.getByLabel('exemplo (Linha 1)').press('Enter');
  const required = details.getByRole('group', { name: 'obrigatório (Linha 1)' });
  const [seg, example] = await Promise.all([
    required.boundingBox(),
    details.getByLabel('exemplo (Linha 1)').boundingBox(),
  ]);
  if (!seg || !example) throw new Error('tabela sem tamanho');
  expect(seg.x + seg.width).toBeLessThanOrEqual(example.x + 0.5);
});
