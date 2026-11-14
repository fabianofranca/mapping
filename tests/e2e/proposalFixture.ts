import JSZip from 'jszip';
import {
  addAnnotation,
  addContainer,
  addLayer,
  buildProposal,
  createMarking,
  createProject,
  proposalFilePath,
  proposalImagePath,
  removeMarking,
  renameContainer,
  renameMarking,
  replaceContainer,
  serialize,
  serializeProposal,
  setMarkingLocked,
  setMarkingRect,
  updateEntry,
  type Project,
  type Proposal,
} from '../../src/model';
import { blocksPng, type PngBlock } from './png';

// Sample project with a change proposal (stage 4): used by the review e2e
// (review and partially apply) and by the zip `examples/proposal-example.zip`, which serves
// to test the review without the agent (Open zip, on desktop and on the phone). Everything is built
// with the model functions, so the proposal is exactly what the MCP would write.

const NOW = '2026-10-09T12:00:00.000Z';
export const FIXTURE_PROPOSAL_ID = 'checkout-figma';
export const FIXTURE_PROPOSAL_TITLE = 'Checkout from Figma';

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

/** The screens: Checkout, Cart (and its new version) and the new Confirmation. */
export const FIXTURE_IMAGES = {
  'images/checkout.png': blocksPng(WIDTH, HEIGHT, BG, [
    block(0, 0, WIDTH, 64, INK),
    block(16, 80, 358, 300, SOFT),
    block(16, 400, 358, 60, [255, 194, 71]),
    block(0, 700, WIDTH, 144, SOFT),
    block(24, 760, 342, 56, BRAND),
  ]),
  'images/cart.png': blocksPng(WIDTH, HEIGHT, BG, [
    block(0, 0, WIDTH, 64, INK),
    block(16, 96, 358, 120, SOFT),
    block(16, 232, 358, 120, SOFT),
  ]),
  'images/cart-v2.png': blocksPng(WIDTH, HEIGHT, BG, [
    block(0, 0, WIDTH, 64, BRAND),
    block(16, 96, 358, 120, SOFT),
    block(16, 232, 358, 120, SOFT),
    block(16, 368, 358, 120, SOFT),
  ]),
  'images/confirmation.png': blocksPng(WIDTH, HEIGHT, BG, [
    block(0, 0, WIDTH, 64, INK),
    block(95, 220, 200, 200, GREEN),
    block(24, 760, 342, 56, BRAND),
  ]),
} as const;

/** The project as it is: two screens, markings (the Pay button locked) and annotations. */
export function fixtureProject(): Project {
  let p = createProject({
    id: '00000000-0000-4000-8000-000000000e2e',
    name: 'Store',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Components', color: '#1e88e5' },
  });
  p = addContainer(p, {
    id: 'I1',
    file: 'images/checkout.png',
    width: WIDTH,
    height: HEIGHT,
  });
  p = renameContainer(p, 'I1', 'Checkout');
  p = addContainer(p, {
    id: 'I2',
    file: 'images/cart.png',
    width: WIDTH,
    height: HEIGHT,
  });
  p = renameContainer(p, 'I2', 'Cart');
  // The parent comes from containment (the Pay button sits inside the Footer).
  const mark = (id: string, imageId: string, name: string, rect: readonly number[]) => {
    const [x = 0, y = 0, width = 0, height = 0] = rect;
    p = createMarking(p, {
      id,
      containerId: imageId,
      name,
      rect: { x, y, width, height },
    });
  };
  mark('M1', 'I1', 'Header', [0, 0, 390, 64]);
  mark('M2', 'I1', 'Item list', [16, 80, 358, 300]);
  mark('M3', 'I1', 'Footer', [0, 700, 390, 144]);
  mark('M4', 'I1', 'Pay button', [24, 760, 342, 56]);
  mark('M5', 'I1', 'Promo banner', [16, 400, 358, 60]);
  mark('M6', 'I2', 'Title', [0, 0, 390, 64]);
  p = addAnnotation(p, {
    id: 'A1',
    markingId: 'M4',
    layerId: 'L1',
    name: 'Button',
    entries: [
      { id: 'E1', key: 'text', value: 'Pay' },
      { id: 'E2', key: 'style', value: 'primary' },
    ],
  });
  p = addAnnotation(p, {
    id: 'A2',
    markingId: 'M2',
    layerId: 'L1',
    name: 'List',
    entries: [{ id: 'E3', key: 'items', value: 'cart products' }],
  });
  return setMarkingLocked(p, 'M4', true);
}

/**
 * The proposal "Checkout from Figma": renames the header, moves the locked button,
 * changes the button style, removes the banner, creates the coupon field, a new layer with the
 * button event, the confirmation screen (new image) and replaces the cart image.
 */
export function fixtureProposal(base: Project = fixtureProject()): Proposal {
  let after = renameMarking(base, 'M1', 'Checkout header');
  after = setMarkingLocked(after, 'M4', false);
  after = setMarkingRect(after, 'M4', { x: 24, y: 740, width: 342, height: 56 });
  after = setMarkingLocked(after, 'M4', true);
  after = updateEntry(after, 'A1', 'E2', { key: 'style', value: 'secondary' });
  after = removeMarking(after, 'M5');
  after = createMarking(after, {
    id: 'M7',
    containerId: 'I1',
    name: 'Coupon field',
    rect: { x: 16, y: 620, width: 358, height: 56 },
  });
  after = addAnnotation(after, {
    id: 'A7',
    markingId: 'M7',
    layerId: 'L1',
    name: 'Input',
    entries: [{ id: 'E7', key: 'placeholder', value: 'Discount coupon' }],
  });
  after = addLayer(after, { id: 'L2', name: 'Events', color: '#e65100' });
  after = addAnnotation(after, {
    id: 'A8',
    markingId: 'M4',
    layerId: 'L2',
    name: 'onClick',
    entries: [{ id: 'E8', key: 'action', value: 'checkout.pay' }],
  });
  after = addContainer(after, {
    id: 'I3',
    file: 'images/confirmation.png',
    width: WIDTH,
    height: HEIGHT,
  });
  after = renameContainer(after, 'I3', 'Confirmation');
  after = createMarking(after, {
    id: 'M8',
    containerId: 'I3',
    name: 'Success message',
    rect: { x: 95, y: 220, width: 200, height: 200 },
  });
  after = replaceContainer(after, 'I2', {
    file: 'images/cart-v2.png',
    width: WIDTH,
    height: HEIGHT,
  });
  return buildProposal(base, after, {
    id: FIXTURE_PROPOSAL_ID,
    title: FIXTURE_PROPOSAL_TITLE,
    description: 'Screens of the Checkout page of the Store v3 file.',
    origin: 'Figma: Store v3 › Checkout',
    author: 'Claude Code',
    createdAt: NOW,
  });
}

/** The zip files (path → content), as the app's export writes them. */
export function fixtureFiles(): Map<string, string | Buffer> {
  const project = fixtureProject();
  const proposal = fixtureProposal(project);
  const files = new Map<string, string | Buffer>();
  files.set('mapping.json', serialize(project));
  files.set('images/checkout.png', FIXTURE_IMAGES['images/checkout.png']);
  files.set('images/cart.png', FIXTURE_IMAGES['images/cart.png']);
  files.set(proposalFilePath(proposal.id), serializeProposal(proposal));
  for (const file of ['images/confirmation.png', 'images/cart-v2.png'] as const) {
    files.set(proposalImagePath(proposal.id, file), FIXTURE_IMAGES[file]);
  }
  return files;
}

/** The zip of the sample project with the proposal (for "Open zip"). */
export async function fixtureZip(): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of fixtureFiles()) {
    zip.file(path, content, { date: new Date(NOW), compression: 'DEFLATE' });
  }
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}
