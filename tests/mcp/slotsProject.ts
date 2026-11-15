import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createProject,
  loadSpecComponents,
  parseSpecText,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { NOW } from '../model/fixtures';

// The project of the `tests/fixtures/slots` library with a few component markings (stage #1080, SL4 and SL5):
// pure model, shared by the model tests and the MCP workspace.

export const FIXTURE = 'tests/fixtures/slots';
export const SPEC_ID = 'slots';
export const SCREEN = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';
export const COMPONENTS = ['bar', 'pin', 'rounded-bar'];

export type Placer = (
  id: string,
  typeId: string,
  extra?: Partial<NewComponentArgs>,
) => void;

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SlotsOptions {
  /** Edits the library's specialization before it is applied (the `code` of a platform, for instance). */
  readonly tweak?: (spec: Doc) => void;
  /** Extra files of the library, by path inside `specs/slots/` (a signature sheet, for instance). */
  readonly files?: Readonly<Record<string, string>>;
}

/** The specialization text of the fixture, edited by `options.tweak`. */
export function specText(options: SlotsOptions): string {
  const text = readFileSync(join(FIXTURE, 'slots.spec.json'), 'utf8');
  if (options.tweak === undefined) return text;
  const spec = JSON.parse(text) as Doc;
  options.tweak(spec);
  return JSON.stringify(spec);
}

/** The fixture's specialization (edited by `options.tweak`) and the catalog of its components. */
export function slotsLibrary(options: SlotsOptions = {}) {
  const parsed = parseSpecText(specText(options));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  const texts = new Map(
    COMPONENTS.map((id) => [
      `specs/slots/components/${id}.json`,
      readFileSync(join(FIXTURE, 'components', `${id}.json`), 'utf8'),
    ]),
  );
  const catalog = new Map([
    [
      SPEC_ID,
      loadSpecComponents(parsed.spec, 'specs/slots/slots.spec.json', 1, (path) =>
        texts.get(path),
      ),
    ],
  ]);
  return { spec: parsed.spec, catalog };
}

/** The empty project with the library applied; `fill` adds the markings (ids `mk-<id>`, annotations `an-<id>`). */
export function slotsProject(
  fill: (add: Placer) => void,
  options: SlotsOptions = {},
): Project {
  const { spec, catalog } = slotsLibrary(options);
  let p = createProject({
    name: 'Slots',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, {
    id: SCREEN,
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
  p = applySpecialization(p, spec, { packageSpecName: 'slots.spec.json' });
  const add = (id: string, typeId: string, extra: Partial<NewComponentArgs> = {}) => {
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId: `mk-${id}`,
        annotationId: `an-${id}`,
        containerId: SCREEN,
        parentId: null,
        specId: SPEC_ID,
        typeId,
        ...extra,
      },
      approximateMeasurer,
    );
  };
  fill(add);
  return p;
}
