import JSZip from 'jszip';
import {
  addBackgroundContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  createProject,
  renameMarking,
  serialize,
  setContainerDensity,
  setFieldValue,
  specFiles,
} from '../../src/model';
import { A11Y_SPEC_ID, a11ySpec } from '../model/accessibilityProject';

// Project with one accessibility warning (R29): a `button` below the touch minimum at 3x, in a
// background container, so the Notices window has a row to lay out.

const NOW = '2026-11-05T12:00:00.000Z';

export async function accessibilityZip(): Promise<Buffer> {
  let p = createProject({
    id: '00000000-0000-4000-8000-000000000a11',
    name: 'Accessibility',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Free', color: '#1e88e5' },
    firstPage: { id: 'PG1', name: 'Page 1' },
  });
  p = applySpecialization(p, a11ySpec, { newId: () => 'LS1' });
  p = addBackgroundContainer(p, {
    id: 'B1',
    name: 'Screen',
    width: 1080,
    height: 2400,
    background: '#FFFFFF',
    center: { x: 540, y: 1200 },
  });
  p = setContainerDensity(p, 'B1', 3);
  p = createMarking(p, {
    id: 'M1',
    containerId: 'B1',
    name: 'x',
    rect: { x: 0, y: 0, width: 108, height: 120 },
  });
  p = renameMarking(p, 'M1', 'Legacy');
  p = addTypedAnnotation(p, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'LS1',
    type: { specId: A11Y_SPEC_ID, typeId: 'button' },
  });
  p = setFieldValue(p, 'A1', 'label', 'Buy');
  const zip = new JSZip();
  const opts = { date: new Date(NOW), compression: 'DEFLATE' as const };
  zip.file('mapping.json', serialize(p), opts);
  for (const [path, text] of specFiles(p)) zip.file(path, text, opts);
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}
