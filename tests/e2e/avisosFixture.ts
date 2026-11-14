import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import {
  addBackgroundContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  createProject,
  parseSpec,
  renameMarking,
  serialize,
  specFiles,
} from '../../src/model';

// "Notices" project of R18 (`docs/TESTING.md`): the `avisos-demo` specialization applied and the
// Card and Simple markings with a typed annotation, to check the Details headers.
// The JSON (with the `demo` platform and the `code.demo` of the three types) follows the R18 one.

const NOW = '2026-11-05T12:00:00.000Z';

/** Project zip: a "Screen" container with the Card and Simple markings. */
export async function avisosZip(): Promise<Buffer> {
  const parsed = parseSpec(
    JSON.parse(readFileSync('tests/e2e/fixtures/avisos-demo.spec.json', 'utf8')),
  );
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let p = createProject({
    id: '00000000-0000-4000-8000-000000000e2e',
    name: 'Notices',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Free', color: '#1e88e5' },
  });
  p = applySpecialization(p, parsed.spec, { newId: () => 'LS1' });
  p = addBackgroundContainer(p, {
    id: 'B1',
    name: 'Screen',
    width: 360,
    height: 800,
    background: '#FFFFFF',
    center: { x: 180, y: 400 },
  });
  const rows = [
    ['M1', 'Card', 'cartao', 40],
    ['M2', 'Simple', 'simples', 300],
  ] as const;
  for (const [id, name, typeId, y] of rows) {
    p = createMarking(p, {
      id,
      containerId: 'B1',
      name: 'x',
      rect: { x: 20, y, width: 300, height: 120 },
    });
    p = renameMarking(p, id, name);
    p = addTypedAnnotation(p, {
      id: `A_${id}`,
      markingId: id,
      layerId: 'LS1',
      type: { specId: 'avisos-demo', typeId },
    });
  }
  const zip = new JSZip();
  const opts = { date: new Date(NOW), compression: 'DEFLATE' as const };
  zip.file('mapping.json', serialize(p), opts);
  for (const [path, text] of specFiles(p)) zip.file(path, text, opts);
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}
