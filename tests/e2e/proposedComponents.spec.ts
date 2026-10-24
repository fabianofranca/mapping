import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addBackgroundContainer,
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  buildProposal,
  createProject,
  loadSpecComponents,
  parseSpec,
  proposalFilePath,
  serialize,
  serializeProposal,
  serializeSpec,
  specFiles,
  type ComponentCatalog,
  type Spec,
} from '../../src/model';

// Etapa Proposto com componentes (PC1): a visão Proposto desenha os componentes que a
// proposta cria (de um tipo já aplicado e de um pacote que a proposta traz); a Atual não.
// O host do canvas publica `data-components` (quantos componentes foram desenhados).

const PACKAGE_DIR = 'examples/libraries/material3';
const NOW = '2026-10-24T12:00:00.000Z';
const PROPOSAL_ID = 'telas-novas';

/** Arquivos de componente do Material 3 (caminho relativo ao pacote → texto). */
function componentTexts(): Map<string, string> {
  const dir = join(PACKAGE_DIR, 'components');
  return new Map(
    readdirSync(dir).map((name) => [
      `components/${name}`,
      readFileSync(join(dir, name), 'utf8'),
    ]),
  );
}

function loadSpec(id: string): Spec {
  const raw = JSON.parse(
    readFileSync(join(PACKAGE_DIR, 'material3.spec.json'), 'utf8'),
  ) as Record<string, unknown>;
  const parsed = parseSpec({ ...raw, id, name: id });
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Catálogo de uma especialização cujo pacote está em `specs/<id>/`. */
function catalogOf(spec: Spec, texts: Map<string, string>): ComponentCatalog {
  const file = `specs/${spec.id}/${spec.id}.spec.json`;
  const loaded = loadSpecComponents(spec, file, spec.version, (path) =>
    texts.get(path.replace(`specs/${spec.id}/`, '')),
  );
  return new Map([[spec.id, loaded]]);
}

/**
 * O projeto "Telas" (Material 3 aplicado, uma tela em branco) e a proposta que cria nela um
 * Button de tipo já aplicado (`material3`) e um de um pacote que a proposta traz (`m3novo`).
 */
async function fixtureZip(): Promise<Buffer> {
  const texts = componentTexts();
  const applied = loadSpec('material3');
  const extra = loadSpec('m3novo');
  let n = 0;
  let base = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Componentes', color: '#1e88e5' },
  });
  base = applySpecialization(base, applied, {
    newId: () => `LS${++n}`,
    packageSpecName: 'material3.spec.json',
  });
  base = addBackgroundContainer(base, {
    id: 'B1',
    name: 'Tela',
    width: 360,
    height: 800,
    background: '#FFFFFF',
    center: { x: 180, y: 400 },
  });

  let after = applySpecialization(base, extra, {
    newId: () => `LS${++n}`,
    packageSpecName: 'm3novo.spec.json',
  });
  const catalog: ComponentCatalog = new Map([
    ...catalogOf(applied, texts),
    ...catalogOf(extra, texts),
  ]);
  for (const [markingId, specId, y] of [
    ['N1', 'material3', 100],
    ['N2', 'm3novo', 300],
  ] as const) {
    after = addComponentMarking(
      after,
      catalog,
      {
        markingId,
        annotationId: `A_${markingId}`,
        containerId: 'B1',
        parentId: null,
        specId,
        typeId: 'm3-button',
        center: { x: 180, y },
        values: { label: 'Pagar' },
      },
      approximateMeasurer,
    );
  }
  const proposal = buildProposal(base, after, {
    id: PROPOSAL_ID,
    title: 'Telas novas',
    createdAt: NOW,
  });

  const zip = new JSZip();
  zip.file('mapping.json', serialize(base));
  for (const [path, text] of specFiles(base)) zip.file(path, text);
  for (const [path, text] of texts) zip.file(`specs/material3/${path}`, text);
  zip.file(proposalFilePath(PROPOSAL_ID), serializeProposal(proposal));
  const pkg = `proposals/${PROPOSAL_ID}/specs/m3novo`;
  zip.file(`${pkg}/m3novo.spec.json`, serializeSpec(extra));
  for (const [path, text] of texts) zip.file(`${pkg}/${path}`, text);
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

async function importFixture(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'telas.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
}

test('Proposto desenha os componentes que a proposta cria; Atual não', async ({
  page,
}) => {
  await importFixture(page);
  const host = page.locator('.canvas-host');

  // Janela Propostas (Ctrl+Shift+7) e Revisar: a revisão começa na visão Proposto.
  await page.keyboard.press('Control+Shift+7');
  await expect(page.getByText('Telas novas').first()).toBeVisible();
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await expect(page.getByText('Somente leitura').first()).toBeVisible();

  const view = page.getByRole('group', { name: 'Visão do canvas' });
  const proposed = view.getByRole('button', { name: 'Proposto', exact: true });
  const current = view.getByRole('button', { name: 'Atual', exact: true });
  await expect(proposed).toHaveAttribute('aria-pressed', 'true');

  // O tipo já aplicado e o do pacote da proposta (lido de proposals/<id>/) são desenhados.
  await expect(host).toHaveAttribute('data-components', '2');

  // Na Atual, nenhum dos dois existe ainda.
  await current.click();
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await expect(host).toHaveAttribute('data-components', '0');

  await proposed.click();
  await expect(host).toHaveAttribute('data-components', '2');
});
