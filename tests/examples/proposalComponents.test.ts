import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deserialize,
  isTextPackageFile,
  parseProposalText,
  type Proposal,
} from '../../src/model';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { readProjectZip } from '../../src/storage/zip';
import { createEditorDerived } from '../../src/store/derived';
import { createEditorUi } from '../../src/store/ui';
import {
  SHOWCASE_NAMES,
  SHOWCASE_PROPOSAL_ID,
  showcase,
  showcaseZip,
} from '../e2e/proposedComponentsFixture';
import { openHarness } from '../store/proposalHarness';

// `examples/proposal-components.zip`: the "Screens" project with an open proposal of new
// components, for script R13 (Proposed with components) of docs/TESTING.md. The zip comes from
// `tests/e2e/proposedComponentsFixture.ts`; this test checks that it is up to date and that, once
// opened, the review has the states that the script describes. To generate it again:
// `npm run build:proposal-components`.

const EXAMPLE = 'examples/proposal-components.zip';
const HINT = 'Run `npm run build:proposal-components` to regenerate the zip.';

beforeEach(() => localStorage.clear());

async function readExample() {
  const read = await readProjectZip(new Blob([readFileSync(EXAMPLE)]));
  if (!read.ok) throw new Error(`unreadable zip: ${read.error}`);
  const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
  if (!parsed.ok) throw new Error(`invalid mapping.json: ${parsed.error.code}`);
  const text = read.files.proposals.get(
    `proposals/${SHOWCASE_PROPOSAL_ID}/proposal.json`,
  );
  const proposal = text ? parseProposalText(text) : null;
  if (!proposal?.ok) throw new Error('invalid proposal.json');
  return { project: parsed.project, proposal: proposal.proposal };
}

describe('example zip with new components in the proposal', () => {
  it('examples/proposal-components.zip is up to date with the generator', async () => {
    const expected = showcase().files;
    if (process.env.UPDATE_EXAMPLES === '1') {
      writeFileSync(EXAMPLE, await showcaseZip());
    }
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
    expect(names.sort(), HINT).toEqual([...expected.keys()].sort());
    for (const [path, content] of expected) {
      if (typeof content === 'string') {
        expect(await zip.file(path)?.async('string'), `${path}. ${HINT}`).toBe(content);
      } else {
        const bytes = await zip.file(path)?.async('nodebuffer');
        expect(bytes?.equals(content), `${path}. ${HINT}`).toBe(true);
      }
    }
  });

  it('the applied specialization is called "Material 3 (Compose)", as in the library (R13.10)', async () => {
    const { project } = await readExample();
    expect(project.specializations.map((s) => [s.id, s.spec?.name])).toEqual([
      ['material3-compose', 'Material 3 (Compose)'],
    ]);
  });

  it('the specs/material3-compose/ package of the zip is a valid library (no Diagnostics error)', async () => {
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE));
    const prefix = 'specs/material3-compose/';
    const files: LibraryFile[] = [];
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !name.startsWith(prefix)) continue;
      const path = name.slice(prefix.length);
      files.push(
        isTextPackageFile(path) ? { path, text: await entry.async('string') } : { path },
      );
    }
    const report = validateLibrary({ files, specPath: 'material3-compose.spec.json' });
    expect(report.errors.map((i) => `${i.file} ${i.path} ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  }, 30_000);

  it('the app reads the zip: the project and the open proposal with the recorded decisions', async () => {
    const { project, proposal } = await readExample();
    expect(project.containers).toHaveLength(1);
    expect(project.markings.map((m) => m.name)).toEqual([SHOWCASE_NAMES.existing]);
    expect(proposal.status).toBe('open');
    const ids = showcase().createIds;
    const stateOf = (id: string) => proposal.decisions[id]?.state ?? null;
    expect(stateOf(ids.pending)).toBeNull();
    expect(stateOf(ids.accepted)).toBe('accepted');
    expect(stateOf(ids.acceptedAnnotation)).toBe('accepted');
    expect(stateOf(ids.rejected)).toBe('rejected');
    expect(stateOf(ids.invalid)).toBe('accepted');
    expect(stateOf(ids.noLabel)).toBeNull();
    expect(stateOf(ids.package)).toBeNull();
  });

  it('in the review: pending, accepted, rejected, invalid, no label, from the package and changed', async () => {
    const { project, proposal } = await readExample();
    const files: Record<string, string> = {};
    for (const [path, text] of showcase().files) {
      if (
        typeof text === 'string' &&
        path !== 'mapping.json' &&
        !path.endsWith('/proposal.json')
      )
        files[path] = text;
    }
    const h = await openHarness({
      project,
      proposals: [proposal as Proposal],
      files,
    });
    const ui = createEditorUi();
    const derived = createEditorDerived(
      h.session.store,
      ui,
      h.review.derived.shownProject,
      h.review.components,
    );
    expect(h.review.open(SHOWCASE_PROPOSAL_ID).ok).toBe(true);
    h.review.setView('proposed');
    await h.session.components.whenIdle();
    await h.review.components.whenIdle();

    const shown = h.review.derived.shownProject.value;
    const idOf = (name: string) => shown?.markings.find((m) => m.name === name)?.id;
    const scenes = derived.componentScenes.value;
    const ids = showcase().createIds;

    // Drawn in Proposed: existing, pending, accepted, invalid, no label, from the package.
    for (const name of [
      SHOWCASE_NAMES.existing,
      SHOWCASE_NAMES.pending,
      SHOWCASE_NAMES.accepted,
      SHOWCASE_NAMES.invalid,
      SHOWCASE_NAMES.noLabel,
      SHOWCASE_NAMES.package,
    ]) {
      const id = idOf(name);
      expect(id, name).toBeDefined();
      expect(scenes.has(id ?? ''), name).toBe(true);
    }
    // Rejected: the marking does not exist in the Proposed view (only the ghost, drawn by the canvas).
    expect(idOf(SHOWCASE_NAMES.rejected)).toBeUndefined();
    expect(scenes.size).toBe(6);

    // The invalid one is in the set that blocks Apply; the others are not.
    const invalid = h.review.derived.invalid.value.changeIds;
    expect(invalid.has(ids.invalid)).toBe(true);
    for (const key of [
      'pending',
      'accepted',
      'rejected',
      'noLabel',
      'package',
    ] as const) {
      expect(invalid.has(ids[key]), key).toBe(false);
    }

    // The "No label" one carries the incomplete pending item; the "Pending" one does not.
    const incomplete = derived.incompleteMarkings.value;
    expect(incomplete.has(idOf(SHOWCASE_NAMES.noLabel) ?? '')).toBe(true);
    expect(incomplete.has(idOf(SHOWCASE_NAMES.pending) ?? '')).toBe(false);

    // R13.9: the Invalid one has both pending items (layer and "does not fit") and Incomplete lists it.
    const invalidAnnotation = shown?.annotations.find(
      (a) => a.markingId === idOf(SHOWCASE_NAMES.invalid),
    );
    expect(
      derived.issues.value
        .get(invalidAnnotation?.id ?? '')
        ?.map((i) => ({ code: i.code })),
    ).toEqual([{ code: 'layer-mismatch' }, { code: 'component-overflow' }]);
    const listed = derived.incompleteList.value.flatMap((g) =>
      g.items.map((i) => i.marking.id),
    );
    expect(listed).toContain(idOf(SHOWCASE_NAMES.invalid));
    expect(listed).toContain(idOf(SHOWCASE_NAMES.noLabel));
    expect(listed).not.toContain(idOf(SHOWCASE_NAMES.pending));

    // The existing one appears with the proposed value.
    const existing = shown?.annotations.find(
      (a) => a.markingId === idOf(SHOWCASE_NAMES.existing),
    );
    expect(existing?.values?.label).toBe('New value');

    // Current: no component created; nothing written to specs/ before applying.
    h.review.setView('current');
    expect(derived.componentScenes.value.size).toBe(1);
    expect(await h.root.read('specs/m3new/m3new.spec.json')).toBeNull();
  });
});
