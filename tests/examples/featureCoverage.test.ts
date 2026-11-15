import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_KEYS,
  CONDITION_OPS,
  EXPR_OPS,
  EXTRA_KEYS,
  NODE_TYPES,
  REPEAT_BASE_KEYS,
  ROOT_KEYS,
  classify,
  componentFeatureList,
  componentFeaturesUsed,
  listJsonFiles,
  readJson,
  specFeatureList,
  specFeaturesUsed,
} from './featureCoverage';

/**
 * Guard of the examples: every feature of the specialization format (derived from `specSchema`)
 * and of the component format (explicit list) has at least one example in the distributed
 * libraries and examples. Only these roots count (discovered through the folders, so a new
 * package counts by itself): `libraries/*`, `examples/libraries/*` and `examples/specs/*.json`.
 * `tests/fixtures/`, `viewer/`, `examples/full-example/` (copies) and zips are left out.
 */

const ROOT = join(__dirname, '..', '..');

/**
 * Features that no example needs to cover, with the reason. Only legacy keys accepted for
 * compatibility or meaningless in an example go here; never a current feature just to pass.
 */
const EXCEPTIONS: Record<string, string> = {
  'spec:layers[].annotationTypes[].fields[].type=codeRef':
    'type removed in stage 9 (schema v9); the parser accepts it only to ignore it and warn',
  'spec:layers[].annotationTypes[].fields[].platforms':
    'key of the removed codeRef type; rejected in the other types',
  'spec:layers[].annotationTypes[].fields[].columns[].type=codeRef':
    'type removed in stage 9; the parser accepts it only to ignore it and warn',
  'spec:layers[].annotationTypes[].fields[].columns[].type=table':
    'the schema declares the column with the shape of the field, but a column of a column does not exist',
  'spec:layers[].annotationTypes[].accessibility.parts[].touchTarget':
    'a part has no touch target: the key is accepted by the shape only to be rejected at its exact path',
  'spec:fonts[].style':
    'an example requires a font file in the package (without it the validator warns); owner decision (2026-11-01): the font is fixed in the mobile client, not in SDUI',
  'spec:fonts[].style=italic':
    'same as fonts[].style: no font file in any example library',
  'spec:fonts[].style=normal':
    'same as fonts[].style: no font file in any example library',
};

/**
 * Roots that will be removed in the examples cleanup (folders or files, from the repository
 * root).
 */
const LEAVING: string[] = [];

/**
 * What only the LEAVING roots cover today: it needs an example elsewhere before the removal.
 * Each item leaves here when it gets an example outside LEAVING; with LEAVING empty, this list
 * is empty.
 */
const PENDING_AFTER_REMOVAL: string[] = [];

/** Features with no example today; they get one in this stage. */
/*
 * `notices` (formatVersion 10, stage #486): the guide and the examples get no notices in this stage
 * ('Out' decision of #486); the feature is covered by tests/model/specV10.test.ts and by script R18.
 */
const MISSING_TODAY: string[] = [
  // `sources[].signature` (formatVersion 16, stage #1079): Material 3 covers `fieldModels`, `signature`, `ignore`, `calls`,
  // `formats` and the importer notices (S5); `sources[].signature` is covered by tests/model/specV16.test.ts and
  // tests/model/librarySignature.test.ts.
  'spec:layers[].annotationTypes[].sources[].signature',
  // Component layout v4 (stage #747, CF2): the distributed libraries do not migrate to
  // format 4 in this stage ('Out' decision of #747); covered by
  // tests/model/components/layoutFidelity.test.ts, layoutV4Parse.test.ts and by script R25.
  // Literal `font.family`: the last Material 3 component that used it migrated (stage #833, M5) and
  // inherits Roboto from the `font-sans` token; covered by tests/model/components/ and by script R25.
  'component:font.family',
  // `font.verticalAlign: "middle"`: Material 3 moved the labels and numbers to `cap-middle` (stage #896,
  // FX6, decision 23); `middle` is still covered by tests/e2e/textMetrics.spec.ts and by script R25.
  'component:font.verticalAlign=middle',
  // Component text v4 (stage #747, CF3): the Material 3 library already uses `font.maxLines` in
  // `text` (stage #833, M1); the rest of the distributed libraries did not migrate. Covered by
  // tests/model/components/textWrap.test.ts, tests/e2e/textMetrics.spec.ts and by script R25.
  // Rich text of component v4 (stage #747, CF4): the distributed libraries do not migrate; covered
  // by tests/model/components/richText.test.ts, tests/e2e/ and by script R25.
  'component:node.text.runs',
  // Row wrap (stage #898, MC4): `repeat` with `wrap` is not adopted by any distributed
  // library (Material 3 uses `layout.wrap` in the flow-row in MC6); covered by
  // tests/model/components/wrapLayout.test.ts and by script R25.
  'component:node.repeat.wrap',
  // `span` and `weight` (stage #1078, L3): Material 3 does not adopt them (the grid and
  // `repeat.layout` do, in L5); covered by tests/model/components/gridInstantiate.test.ts, gridParse.test.ts,
  // gridSlot.test.ts and by script R25.
  // `code.slots` (formatVersion 17, stage #1080, SL3): the Material 3 library (SL7) declares the `slots`
  // on the type and `slot.id`/`slot.fallback` on the components, but binds the slots to the call
  // parameters through the `role: slot` parameter, not through `code{}.slots`; covered by
  // tests/model/specV17.test.ts, tests/model/specSlots.test.ts, tests/model/librarySlots.test.ts,
  // the fixture tests/fixtures/slots/ and script R28.
  'spec:layers[].annotationTypes[].code{}.slots',
  'spec:layers[].annotationTypes[].code{}.variants.cases{}.slots',
  // `accessibility` (formatVersion 18, stage #1081, A1): no distributed library declares it yet; the Material 3
  // library adopts it in A4 and these items leave this list then. Covered by tests/model/specV18.test.ts,
  // tests/model/accessibility.test.ts and the fixture tests/fixtures/accessibility/.
  'spec:accessibility',
  'spec:accessibility.touchTarget',
  'spec:accessibility.touchTarget.height',
  'spec:accessibility.touchTarget.mode',
  'spec:accessibility.touchTarget.mode=expanded',
  'spec:accessibility.touchTarget.mode=visual',
  'spec:accessibility.touchTarget.width',
  'spec:layers[].annotationTypes[].accessibility',
  'spec:layers[].annotationTypes[].accessibility.label',
  'spec:layers[].annotationTypes[].accessibility.label.fields',
  'spec:layers[].annotationTypes[].accessibility.label.required',
  'spec:layers[].annotationTypes[].accessibility.parts',
  'spec:layers[].annotationTypes[].accessibility.parts[].id',
  'spec:layers[].annotationTypes[].accessibility.parts[].label',
  'spec:layers[].annotationTypes[].accessibility.parts[].label.fields',
  'spec:layers[].annotationTypes[].accessibility.parts[].label.required',
  'spec:layers[].annotationTypes[].accessibility.parts[].name',
  'spec:layers[].annotationTypes[].accessibility.parts[].role',
  'spec:layers[].annotationTypes[].accessibility.parts[].when',
  'spec:layers[].annotationTypes[].accessibility.role',
  'spec:layers[].annotationTypes[].accessibility.touchTarget',
  'spec:layers[].annotationTypes[].accessibility.touchTarget.height',
  'spec:layers[].annotationTypes[].accessibility.touchTarget.mode',
  'spec:layers[].annotationTypes[].accessibility.touchTarget.mode=expanded',
  'spec:layers[].annotationTypes[].accessibility.touchTarget.mode=visual',
  'spec:layers[].annotationTypes[].accessibility.touchTarget.width',
  'spec:layers[].annotationTypes[].accessibility.touchTarget=false',
  'component:node.span',
  'component:node.weight',
  'component:node.repeat.lineGap',
  'component:node.repeat.maxPerLine',
  'component:node.repeat.maxLines',
  'component:run.text',
  'component:run.weight',
  'component:run.italic',
  'component:run.color',
  'component:run.decoration',
  'component:run.family',
  'component:run.size',
  'component:run.background',
  'component:run.radius',
  'component:run.padding',
  // Tokens (formatVersion 15, stage #747, CF5): the `tokens` root already has an example in the Material 3 library
  // (stage #833, M1); `$token` in the components of the other libraries does not yet. Covered by
  // tests/model/specTokens.test.ts, tests/model/components/tokens.test.ts, libraryTokens.test.ts and
  // by script R25.
  'component:expr.$token',
  // Icons (formatVersion 15, stage #747, CF7): the `icons` root and the `icon` node already have an example in the
  // Material 3 library (stage #833, M1); `icon.name`/`strokeWidth` do not yet. Covered by
  // tests/model/components/icons.test.ts, libraryIcons.test.ts, tests/mcp/libraryIcons.test.ts and
  // by script R25.
  'component:node.icon.name',
  'component:node.icon.strokeWidth',
  // Reading direction (stage #1096, R1): `direction` on the node, the `$direction` condition and the `mirror`
  // of `icon` and `path`. The distributed libraries draw in `ltr` and do not adopt them in this
  // stage; covered by tests/model/components/direction.test.ts, directionParse.test.ts,
  // layoutDirection.test.ts, tests/mcp/directionRaster.test.ts and by script R27.
  'component:node.direction',
  // The logical anchors `start` and `end` already have an example: the arrow of the Material 3 tooltip (stage #1096, R5).
  'component:cond.$direction',
  'component:node.icon.mirror',
  // Anchor (stage #1096, R3 and R5): `anchor` on the component root and the `$anchor.*` already have an example in the tooltip,
  // the badge and the Material 3 menu, and the `mirror` of `path`, in the tooltip arrow (R5).
  // Screen and scaled stroke (CF8, stage #747): `screen` on the root and `stroke.scale` (format 4) and
  // `structural` on the type (formatVersion 15); the distributed libraries do not migrate; covered by
  // tests/model/components/ and by script R25.
  'component:root.screen',
  'component:stroke.scale',
  'spec:layers[].annotationTypes[].structural',
  // `accepts.annotations` (formatVersion 14, stage #679): the examples do not get the feature in this
  // stage (the script uses an inline specialization); covered by tests/model/specAcceptsAnnotations.
  'spec:layers[].annotationTypes[].fields[].accepts.annotations',
  'spec:layers[].annotationTypes[].fields[].columns[].accepts.annotations',
  'spec:layers[].annotationTypes[].notices[].kind=deprecated',
  'spec:layers[].annotationTypes[].notices[].kind=diverges',
  'spec:layers[].annotationTypes[].notices[].kind=removed',
  'spec:layers[].annotationTypes[].notices[].since',
  'spec:layers[].annotationTypes[].fields[].notices[].kind=deprecated',
  'spec:layers[].annotationTypes[].fields[].notices[].kind=pending',
  'spec:layers[].annotationTypes[].fields[].notices[].since',
  'spec:layers[].annotationTypes[].fields[].columns[].notices',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind=deprecated',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind=diverges',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind=pending',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind=removed',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].message',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].ref',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].since',
];

// ---------------------------------------------------------------------------------------

interface ExampleFile {
  /** Path from the repository root. */
  rel: string;
  kind: 'spec' | 'component';
  features: Set<string>;
}

function subdirs(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .sort()
    .filter((name) => statSync(join(abs, name)).isDirectory())
    .map((name) => `${dir}/${name}`);
}

/** The example roots, discovered through the folders: packages and single files. */
function discoverRoots(): string[] {
  const roots = [...subdirs('libraries'), ...subdirs('examples/libraries')];
  const specsDir = join(ROOT, 'examples/specs');
  if (existsSync(specsDir)) {
    for (const name of readdirSync(specsDir).sort()) {
      if (name.endsWith('.json')) roots.push(`examples/specs/${name}`);
    }
  }
  return roots;
}

function loadRoot(root: string): ExampleFile[] {
  const abs = join(ROOT, root);
  const files = statSync(abs).isDirectory() ? listJsonFiles(abs) : [abs];
  const out: ExampleFile[] = [];
  for (const file of files) {
    const data = readJson(file);
    const kind = classify(data);
    if (kind === 'other') continue;
    const rel = file
      .slice(ROOT.length + 1)
      .split('\\')
      .join('/');
    out.push({
      rel,
      kind,
      features: kind === 'spec' ? specFeaturesUsed(data) : componentFeaturesUsed(data),
    });
  }
  return out;
}

const roots = discoverRoots();
const byRoot = new Map(roots.map((root) => [root, loadRoot(root)]));

const SPEC_FEATURES = specFeatureList().map((f) => `spec:${f}`);
const COMPONENT_FEATURES = componentFeatureList().map((f) => `component:${f}`);
const ALL_FEATURES = [...SPEC_FEATURES, ...COMPONENT_FEATURES];

/** Features (with the format prefix) used by the files of the given roots. */
function coveredBy(selected: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const root of selected) {
    for (const file of byRoot.get(root) ?? []) {
      const prefix = file.kind === 'spec' ? 'spec:' : 'component:';
      for (const feature of file.features) out.add(`${prefix}${feature}`);
    }
  }
  return out;
}

const isLeaving = (root: string): boolean =>
  LEAVING.some((l) => root === l || root.startsWith(`${l}/`));
const leavingRoots = roots.filter(isLeaving);
const remainingRoots = roots.filter((root) => !isLeaving(root));

const covered = coveredBy(roots);
const withoutExceptions = ALL_FEATURES.filter((f) => !(f in EXCEPTIONS));

describe('feature coverage by the examples', () => {
  it('discovers the example roots through the folders', () => {
    expect(roots).toContain('libraries/kotlin');
    expect(roots).toContain('examples/specs/sdui.json');
    expect(roots.some((r) => r.startsWith('examples/libraries/'))).toBe(true);
    for (const root of LEAVING)
      expect(roots, `LEAVING: ${root} does not exist`).toContain(root);
    expect(SPEC_FEATURES.length).toBeGreaterThan(100);
    expect(COMPONENT_FEATURES.length).toBeGreaterThan(80);
  });

  it('the exceptions are features that exist', () => {
    for (const feature of Object.keys(EXCEPTIONS)) {
      expect(ALL_FEATURES, `unknown exception: ${feature}`).toContain(feature);
      expect(EXCEPTIONS[feature]?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('every feature has at least one example (except the exceptions and the declared gaps)', () => {
    const missing = withoutExceptions.filter((f) => !covered.has(f)).sort();
    expect(
      missing,
      `features with no example in any root:\n${missing.join('\n')}`,
    ).toEqual([...MISSING_TODAY].sort());
  });

  it('what leaves with LEAVING leaves exactly PENDING_AFTER_REMOVAL uncovered', () => {
    const inLeaving = coveredBy(leavingRoots);
    const inRemaining = coveredBy(remainingRoots);
    const onlyLeaving = withoutExceptions
      .filter((f) => inLeaving.has(f) && !inRemaining.has(f))
      .sort();
    expect(
      onlyLeaving,
      `features that only the LEAVING roots cover:\n${onlyLeaving.join('\n')}`,
    ).toEqual([...PENDING_AFTER_REMOVAL].sort());
  });

  it('MISSING_TODAY repeats no covered features nor exceptions', () => {
    for (const feature of MISSING_TODAY) {
      expect(ALL_FEATURES, `unknown: ${feature}`).toContain(feature);
      expect(covered.has(feature), `${feature} already has an example`).toBe(false);
      expect(feature in EXCEPTIONS).toBe(false);
    }
  });
});

describe('the component feature list forgot nothing from the code', () => {
  const source = readFileSync(
    join(ROOT, 'src/model/components/parseComponent.ts'),
    'utf8',
  );

  /** Items of `const NAME = [ 'a', 'b' ]` or of `NAME: … = [ … ]` in the code. */
  function constList(name: string): string[] {
    const match = new RegExp(`const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`).exec(source);
    if (!match) throw new Error(`const ${name} not found in parseComponent.ts`);
    return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
  }

  it('node types, operators and root keys', () => {
    expect([...NODE_TYPES].sort()).toEqual(constList('NODE_TYPES').sort());
    expect([...EXPR_OPS].sort()).toEqual(constList('EXPR_OPS').sort());
    expect([...CONDITION_OPS].sort()).toEqual(constList('CONDITION_OPS').sort());
    expect([...ROOT_KEYS].sort()).toEqual(constList('ROOT_KEYS').sort());
  });

  it('common node keys (with `type`) and the repeat ones', () => {
    expect(['type', ...BASE_KEYS].sort()).toEqual(constList('BASE_KEYS').sort());
    const rejected = constList('REPEAT_REJECTED_KEYS');
    expect([...REPEAT_BASE_KEYS].sort()).toEqual(
      BASE_KEYS.filter((k) => !rejected.includes(k)).sort(),
    );
  });

  it('keys specific to each node type', () => {
    const block = /const extra: Record<string, readonly string\[\]> = \{([^}]*)\}/.exec(
      source,
    );
    if (!block) throw new Error('`extra` map not found in parseComponent.ts');
    const fromCode: Record<string, string[]> = {};
    for (const m of (block[1] ?? '').matchAll(/(\w+):\s*\[([^\]]*)\]/g))
      fromCode[m[1] ?? ''] = [...(m[2] ?? '').matchAll(/'([^']+)'/g)].map(
        (x) => x[1] ?? '',
      );
    for (const type of NODE_TYPES) {
      expect([...EXTRA_KEYS[type]].sort(), `keys of ${type}`).toEqual(
        (fromCode[type] ?? []).sort(),
      );
    }
  });
});
