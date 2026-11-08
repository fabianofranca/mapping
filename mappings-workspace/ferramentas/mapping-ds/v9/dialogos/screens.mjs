// Telas do grupo "dialogos": cada diálogo vira um container, medido no app 0.25.0 com a fixture aberta.
import { readFileSync, readdirSync } from 'node:fs';
import { PATHS } from '../../paths.mjs';
import { pathToFileURL } from 'node:url';

const BASE = PATHS.base;
const NOTAS = `${BASE}/shots/fixture/specs/notas`;
const extractor = () => import(pathToFileURL(`${BASE}/shots/extractor.mjs`).href);

// O foco (anel do :focus-visible) não é desenhado: tira o foco do controle que o diálogo focou ao abrir.
const blur = (page) => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());

// Pacote da especialização Notas na versão 4, a partir da cópia aplicada na fixture (v3): a migração remove
// o campo titulo da Tabela (5 valores perdidos, nas 5 tabelas do projeto), o desenho ainda cita o campo
// (1 erro) e a Nota ganha um campo que o desenho não usa (aviso), mais o preview que cita o campo (aviso).
async function notasV4() {
  const { JSZip } = await extractor();
  const spec = JSON.parse(readFileSync(`${NOTAS}/notas.spec.json`, 'utf8'));
  spec.version = 4;
  const tipos = spec.layers[0].annotationTypes;
  const tabela = tipos.find((t) => t.id === 'tabela');
  tabela.fields = tabela.fields.filter((f) => f.key !== 'titulo');
  delete tabela.labelField;
  tabela.examples = [{ name: 'Evento de analytics', values: {} }];
  tipos.find((t) => t.id === 'nota').fields.push({ key: 'cor', label: 'Cor', type: 'enum', options: ['amarela', 'azul'], default: 'amarela' });
  spec.migrations = [{ from: 3, to: 4, steps: [{ op: 'remove-field', type: 'tabela', field: 'titulo' }] }];
  const zip = new JSZip();
  zip.file('notas.spec.json', JSON.stringify(spec, null, 2));
  for (const d of ['components', 'docs']) for (const n of readdirSync(`${NOTAS}/${d}`)) zip.file(`${d}/${n}`, readFileSync(`${NOTAS}/${d}/${n}`));
  return zip.generateAsync({ type: 'nodebuffer' });
}

// A fixture com dois problemas reparáveis: uma marcação com pai inexistente (vira raiz) e outra que passa
// 10 px da borda esquerda da imagem (é recortada).
async function inconsistente() {
  const { JSZip, projectZip } = await extractor();
  const zip = await JSZip.loadAsync(await projectZip());
  const p = JSON.parse(await zip.file('mapping.json').async('string'));
  const orfa = p.markings.find((m) => m.parentId && m.name);
  orfa.parentId = 'deadbeef-0000-4000-8000-000000000000';
  const fora = p.markings.find((m) => m.parentId === null && m.containerId && m !== orfa && m.rect.x >= 10 && m.rect.width > 20);
  fora.rect = { ...fora.rect, x: -10 };
  zip.file('mapping.json', JSON.stringify(p, null, 2));
  return zip.generateAsync({ type: 'nodebuffer' });
}

export const screens = [
  {
    name: 'Ajuda',
    rootSel: '.dialog',
    open: async (page) => {
      await page.keyboard.press('F1');
      await page.locator('.dialog .help').waitFor();
      await blur(page);
    },
  },
  {
    name: 'Novo container',
    rootSel: '.dialog',
    open: async (page) => {
      await page.getByRole('button', { name: 'Novo container' }).first().click();
      await page.locator('#container-form').waitFor();
      await blur(page);
    },
  },
  {
    name: 'Especializações',
    rootSel: '.dialog',
    open: async (page) => {
      await page.getByRole('button', { name: 'Especializações' }).first().click();
      await page.locator('.spec-list').waitFor();
      await blur(page);
    },
  },
  {
    name: 'Atualizar Notas — pacote com problemas',
    rootSel: '.dialog',
    open: async (page) => {
      await page.getByRole('button', { name: 'Especializações' }).first().click();
      const item = page.locator('.spec-item').filter({ hasText: 'Notas' });
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), item.getByRole('button', { name: 'Atualizar de zip…' }).click()]);
      await chooser.setFiles({ name: 'notas-v4.zip', mimeType: 'application/zip', buffer: await notasV4() });
      await page.locator('.dialog .library-issues').waitFor();
      await blur(page);
    },
  },
  {
    name: 'Excluir container?',
    rootSel: '.dialog',
    open: async (page) => {
      await page.locator('.tree-row').filter({ hasText: 'Janela Comentários' }).first().locator('.tree-item').first().click();
      await page.keyboard.press('Delete');
      await page.locator('.dialog .dialog-title', { hasText: 'Excluir container?' }).waitFor();
      await blur(page);
    },
  },
  {
    name: 'Projeto com dados inconsistentes',
    rootSel: '.dialog',
    open: async (page) => {
      await page.reload();
      await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles({ name: 'comentarios.zip', mimeType: 'application/zip', buffer: await inconsistente() });
      await page.locator('.dialog .dialog-title', { hasText: 'Projeto com dados inconsistentes' }).waitFor();
      await blur(page);
    },
  },
];
