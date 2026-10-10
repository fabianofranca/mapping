import JSZip from 'jszip';
import {
  addAnnotation,
  addImage,
  addLayer,
  buildProposal,
  createMarking,
  createProject,
  proposalFilePath,
  proposalImagePath,
  removeMarking,
  renameImage,
  renameMarking,
  replaceImage,
  serialize,
  serializeProposal,
  setMarkingLocked,
  setMarkingRect,
  updateEntry,
  type Project,
  type Proposal,
} from '../../src/model';
import { blocksPng, type PngBlock } from './png';

// Projeto de exemplo com uma proposta de alteração (etapa 4): usado pelo e2e da revisão
// (revisar e aplicar parcialmente) e pelo zip de `examples/proposta-exemplo.zip`, que serve
// para testar a revisão sem o agente (Abrir zip, no desktop e no celular). Tudo é montado
// com as funções do modelo, então a proposta é exatamente a que o MCP gravaria.

const NOW = '2026-10-09T12:00:00.000Z';
export const FIXTURE_PROPOSAL_ID = 'checkout-figma';
export const FIXTURE_PROPOSAL_TITLE = 'Checkout a partir do Figma';

const WIDTH = 390;
const HEIGHT = 844;
const BG: [number, number, number] = [246, 247, 249];
const INK: [number, number, number] = [40, 48, 60];
const SOFT: [number, number, number] = [214, 220, 228];
const BRAND: [number, number, number] = [26, 99, 204];
const GREEN: [number, number, number] = [30, 122, 70];

const block = (
  x: number,
  y: number,
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): PngBlock => ({ x, y, width, height, rgb });

/** As telas: o Checkout, o Carrinho (e a versão nova dele) e a Confirmação, nova. */
export const FIXTURE_IMAGES = {
  'images/checkout.png': blocksPng(WIDTH, HEIGHT, BG, [
    block(0, 0, WIDTH, 64, INK),
    block(16, 80, 358, 300, SOFT),
    block(16, 400, 358, 60, [255, 194, 71]),
    block(0, 700, WIDTH, 144, SOFT),
    block(24, 760, 342, 56, BRAND),
  ]),
  'images/carrinho.png': blocksPng(WIDTH, HEIGHT, BG, [
    block(0, 0, WIDTH, 64, INK),
    block(16, 96, 358, 120, SOFT),
    block(16, 232, 358, 120, SOFT),
  ]),
  'images/carrinho-v2.png': blocksPng(WIDTH, HEIGHT, BG, [
    block(0, 0, WIDTH, 64, BRAND),
    block(16, 96, 358, 120, SOFT),
    block(16, 232, 358, 120, SOFT),
    block(16, 368, 358, 120, SOFT),
  ]),
  'images/confirmacao.png': blocksPng(WIDTH, HEIGHT, BG, [
    block(0, 0, WIDTH, 64, INK),
    block(95, 220, 200, 200, GREEN),
    block(24, 760, 342, 56, BRAND),
  ]),
} as const;

/** O projeto como está: duas telas, marcações (o Botão Pagar trancado) e anotações. */
export function fixtureProject(): Project {
  let p = createProject({
    name: 'Loja',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Componentes', color: '#1e88e5' },
  });
  p = addImage(p, { id: 'I1', file: 'images/checkout.png', width: WIDTH, height: HEIGHT });
  p = renameImage(p, 'I1', 'Checkout');
  p = addImage(p, { id: 'I2', file: 'images/carrinho.png', width: WIDTH, height: HEIGHT });
  p = renameImage(p, 'I2', 'Carrinho');
  // O pai vem da contenção (o Botão Pagar fica dentro do Rodapé).
  const mark = (id: string, imageId: string, name: string, rect: readonly number[]) => {
    const [x = 0, y = 0, width = 0, height = 0] = rect;
    p = createMarking(p, { id, imageId, name, rect: { x, y, width, height } });
  };
  mark('M1', 'I1', 'Cabeçalho', [0, 0, 390, 64]);
  mark('M2', 'I1', 'Lista de itens', [16, 80, 358, 300]);
  mark('M3', 'I1', 'Rodapé', [0, 700, 390, 144]);
  mark('M4', 'I1', 'Botão Pagar', [24, 760, 342, 56]);
  mark('M5', 'I1', 'Banner promoção', [16, 400, 358, 60]);
  mark('M6', 'I2', 'Título', [0, 0, 390, 64]);
  p = addAnnotation(p, {
    id: 'A1',
    markingId: 'M4',
    layerId: 'L1',
    name: 'Button',
    entries: [
      { id: 'E1', key: 'texto', value: 'Pagar' },
      { id: 'E2', key: 'estilo', value: 'primary' },
    ],
  });
  p = addAnnotation(p, {
    id: 'A2',
    markingId: 'M2',
    layerId: 'L1',
    name: 'Lista',
    entries: [{ id: 'E3', key: 'itens', value: 'produtos do carrinho' }],
  });
  return setMarkingLocked(p, 'M4', true);
}

/**
 * A proposta "Checkout a partir do Figma": renomeia o cabeçalho, move o botão trancado,
 * troca o estilo do botão, remove o banner, cria o campo de cupom, uma camada nova com o
 * evento do botão, a tela de confirmação (imagem nova) e troca a imagem do carrinho.
 */
export function fixtureProposal(base: Project = fixtureProject()): Proposal {
  let after = renameMarking(base, 'M1', 'Cabeçalho do checkout');
  after = setMarkingLocked(after, 'M4', false);
  after = setMarkingRect(after, 'M4', { x: 24, y: 740, width: 342, height: 56 });
  after = setMarkingLocked(after, 'M4', true);
  after = updateEntry(after, 'A1', 'E2', { key: 'estilo', value: 'secondary' });
  after = removeMarking(after, 'M5');
  after = createMarking(after, {
    id: 'M7',
    imageId: 'I1',
    name: 'Campo Cupom',
    rect: { x: 16, y: 620, width: 358, height: 56 },
  });
  after = addAnnotation(after, {
    id: 'A7',
    markingId: 'M7',
    layerId: 'L1',
    name: 'Input',
    entries: [{ id: 'E7', key: 'placeholder', value: 'Cupom de desconto' }],
  });
  after = addLayer(after, { id: 'L2', name: 'Eventos', color: '#e65100' });
  after = addAnnotation(after, {
    id: 'A8',
    markingId: 'M4',
    layerId: 'L2',
    name: 'onClick',
    entries: [{ id: 'E8', key: 'acao', value: 'checkout.pay' }],
  });
  after = addImage(after, {
    id: 'I3',
    file: 'images/confirmacao.png',
    width: WIDTH,
    height: HEIGHT,
  });
  after = renameImage(after, 'I3', 'Confirmação');
  after = createMarking(after, {
    id: 'M8',
    imageId: 'I3',
    name: 'Mensagem de sucesso',
    rect: { x: 95, y: 220, width: 200, height: 200 },
  });
  after = replaceImage(after, 'I2', {
    file: 'images/carrinho-v2.png',
    width: WIDTH,
    height: HEIGHT,
  });
  return buildProposal(base, after, {
    id: FIXTURE_PROPOSAL_ID,
    title: FIXTURE_PROPOSAL_TITLE,
    description: 'Telas da página Checkout do arquivo Loja v3.',
    origin: 'Figma: Loja v3 › Checkout',
    author: 'Claude Code',
    createdAt: NOW,
  });
}

/** Os arquivos do zip (caminho → conteúdo), como a exportação da app os grava. */
export function fixtureFiles(): Map<string, string | Buffer> {
  const project = fixtureProject();
  const proposal = fixtureProposal(project);
  const files = new Map<string, string | Buffer>();
  files.set('mapping.json', serialize(project));
  files.set('images/checkout.png', FIXTURE_IMAGES['images/checkout.png']);
  files.set('images/carrinho.png', FIXTURE_IMAGES['images/carrinho.png']);
  files.set(proposalFilePath(proposal.id), serializeProposal(proposal));
  for (const file of ['images/confirmacao.png', 'images/carrinho-v2.png'] as const) {
    files.set(proposalImagePath(proposal.id, file), FIXTURE_IMAGES[file]);
  }
  return files;
}

/** O zip do projeto de exemplo com a proposta (para "Abrir zip"). */
export async function fixtureZip(): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of fixtureFiles()) {
    zip.file(path, content, { date: new Date(NOW), compression: 'DEFLATE' });
  }
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}
