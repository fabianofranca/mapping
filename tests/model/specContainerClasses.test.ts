// `formatVersion` 21 (stage #1901, CX1; decisions 1, 5, 6 and 8): container classes in the
// specialization. `containerClasses` at the root (sets, computed by `width`/`height` or chosen per
// container), `classes` on a ready-made size (`containers[]`, only chosen sets) and `appliesIn` on
// the type. Every new key is outside the version contract (`diffSpecs` ignores it).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SPEC_FORMAT_VERSION, SPEC_FORMAT_VERSIONS, parseSpec } from '../../src/model';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const ONLY_V21 = 'only allowed with formatVersion 21';

/** A specialization with the two sets of decision 27, two ready-made sizes and two `appliesIn`. */
function v21(edit?: (spec: Json) => void, formatVersion = 21): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'backend',
    name: 'Backend',
    version: 1,
    containerClasses: [
      {
        id: 'platform',
        name: 'Platform',
        classes: [
          { id: 'android', name: 'Android' },
          { id: 'ios', name: 'iOS' },
          { id: 'web', name: 'Web' },
        ],
      },
      {
        id: 'window',
        name: 'Window',
        by: 'width',
        classes: [
          { id: 'compact', name: 'Compact', below: 600 },
          { id: 'medium', name: 'Medium', below: 840 },
          { id: 'expanded', name: 'Expanded' },
        ],
      },
    ],
    containers: [
      {
        id: 'phone',
        name: 'Phone',
        width: 360,
        height: 800,
        classes: { platform: 'android' },
      },
      {
        id: 'web-desktop',
        name: 'Web desktop',
        width: 1440,
        height: 900,
        classes: { platform: 'web' },
      },
    ],
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'sheet',
            name: 'Sheet',
            fields: [{ key: 'title', type: 'string' }],
            appliesIn: { platform: ['android', 'ios'] },
          },
          {
            id: 'fab',
            name: 'Fab',
            fields: [{ key: 'label', type: 'string' }],
            appliesIn: { window: ['compact', 'medium'] },
          },
          { id: 'plain', name: 'Plain', fields: [{ key: 'text', type: 'string' }] },
        ],
      },
    ],
  };
  edit?.(spec);
  return spec;
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

/** Only the declaration: nothing else points at the sets, so a change to a set shows alone. */
const declared = (edit: (spec: Json) => void): Json =>
  v21((s) => {
    for (const c of s.containers) delete c.classes;
    for (const t of s.layers[0].annotationTypes) delete t.appliesIn;
    edit(s);
  });

const platformSet = (s: Json): Json => s.containerClasses[0];
const windowSet = (s: Json): Json => s.containerClasses[1];
const typeOf = (s: Json, i: number): Json => s.layers[0].annotationTypes[i];

describe('formatVersion 21: version and valid shapes', () => {
  it('22 is the current version and 21 is still accepted', () => {
    expect(SPEC_FORMAT_VERSION).toBe(22);
    expect(SPEC_FORMAT_VERSIONS).toContain(21);
    expect(SPEC_FORMAT_VERSIONS.at(-1)).toBe(22);
  });

  it('a computed set, a chosen set and both together are accepted and read as written', () => {
    expect(issuesOf(v21())).toEqual([]);
    const only = (keep: number) =>
      v21((s) => {
        s.containerClasses = [s.containerClasses[keep]];
        s.containers = [];
        s.layers[0].annotationTypes = [typeOf(s, 2)];
      });
    expect(issuesOf(only(0))).toEqual([]);
    expect(issuesOf(only(1))).toEqual([]);
    const result = parseSpec(v21());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.containerClasses).toEqual(v21().containerClasses);
    expect(result.spec.containers?.[0]?.classes).toEqual({ platform: 'android' });
    expect(result.spec.layers[0]?.annotationTypes[0]?.appliesIn).toEqual({
      platform: ['android', 'ios'],
    });
  });

  it('a single-class computed set and a set with one class are valid', () => {
    expect(
      issuesOf(
        v21((s) => {
          windowSet(s).classes = [{ id: 'all', name: 'All' }];
          s.layers[0].annotationTypes[1].appliesIn = { window: ['all'] };
        }),
      ),
    ).toEqual([]);
  });

  it('the published JSON Schema accepts the declarations', () => {
    expect(jsonValidator.safeParse(v21()).success).toBe(true);
  });

  it('the published JSON Schema refuses an invalid shape', () => {
    const bad = v21((s) => {
      windowSet(s).by = 'depth';
    });
    expect(jsonValidator.safeParse(bad).success).toBe(false);
  });
});

describe('formatVersion 21: containerClasses, decision 1, at the exact path', () => {
  it('width and height are reserved set ids', () => {
    for (const id of ['width', 'height']) {
      expect(issuesOf(declared((s) => (platformSet(s).id = id)))).toEqual([
        {
          path: 'containerClasses[0].id',
          message:
            'reserved name: width and height are read by $container.width and $container.height',
        },
      ]);
    }
  });

  it('the set id: invalid characters, repeated, empty and missing', () => {
    for (const id of ['Platform', 'a_b', 'a b']) {
      expect(issuesOf(declared((s) => (platformSet(s).id = id)))).toEqual([
        { path: 'containerClasses[0].id', message: 'invalid id; use [a-z0-9-]+' },
      ]);
    }
    expect(issuesOf(declared((s) => (windowSet(s).id = 'platform')))).toEqual([
      { path: 'containerClasses[1].id', message: 'id "platform" repeated' },
    ]);
    expect(issuesOf(declared((s) => (platformSet(s).id = '')))).toEqual([
      { path: 'containerClasses[0].id', message: 'cannot be empty' },
    ]);
    expect(
      issuesOf(
        declared((s) => {
          delete platformSet(s).id;
        }),
      ),
    ).toEqual([{ path: 'containerClasses[0].id', message: 'required' }]);
  });

  it('the set name: empty, missing and not text', () => {
    expect(issuesOf(declared((s) => (platformSet(s).name = '')))).toEqual([
      { path: 'containerClasses[0].name', message: 'cannot be empty' },
    ]);
    expect(
      issuesOf(
        declared((s) => {
          delete platformSet(s).name;
        }),
      ),
    ).toEqual([{ path: 'containerClasses[0].name', message: 'required' }]);
    expect(issuesOf(declared((s) => (platformSet(s).name = 3)))).toEqual([
      { path: 'containerClasses[0].name', message: 'must be text' },
    ]);
  });

  it('by: only "width" or "height"', () => {
    expect(issuesOf(declared((s) => (windowSet(s).by = 'height')))).toEqual([]);
    for (const by of ['depth', '', 1]) {
      expect(issuesOf(declared((s) => (windowSet(s).by = by)))).toEqual([
        { path: 'containerClasses[1].by', message: 'must be "width" or "height"' },
      ]);
    }
  });

  it('the class list: missing, empty and not a list', () => {
    expect(issuesOf(declared((s) => (platformSet(s).classes = [])))).toEqual([
      { path: 'containerClasses[0].classes', message: 'cannot be empty' },
    ]);
    expect(
      issuesOf(
        declared((s) => {
          delete platformSet(s).classes;
        }),
      ),
    ).toEqual([{ path: 'containerClasses[0].classes', message: 'required' }]);
    expect(issuesOf(declared((s) => (platformSet(s).classes = {})))).toEqual([
      { path: 'containerClasses[0].classes', message: 'must be a list of classes' },
    ]);
  });

  it('the class id: invalid, repeated in the set, empty; the same id in another set is fine', () => {
    expect(issuesOf(declared((s) => (platformSet(s).classes[0].id = 'Android')))).toEqual(
      [
        {
          path: 'containerClasses[0].classes[0].id',
          message: 'invalid id; use [a-z0-9-]+',
        },
      ],
    );
    expect(issuesOf(declared((s) => (platformSet(s).classes[1].id = 'android')))).toEqual(
      [{ path: 'containerClasses[0].classes[1].id', message: 'id "android" repeated' }],
    );
    expect(issuesOf(declared((s) => (platformSet(s).classes[0].name = '')))).toEqual([
      { path: 'containerClasses[0].classes[0].name', message: 'cannot be empty' },
    ]);
    expect(
      issuesOf(
        declared((s) => {
          platformSet(s).classes[0].id = 'compact';
        }),
      ),
    ).toEqual([]);
  });

  it('below is required in every class but the last (at the class path)', () => {
    expect(
      issuesOf(
        declared((s) => {
          delete windowSet(s).classes[0].below;
        }),
      ),
    ).toEqual([
      {
        path: 'containerClasses[1].classes[0]',
        message: 'below is required in every class but the last',
      },
    ]);
  });

  it('the last class has no below (at the class path)', () => {
    expect(issuesOf(declared((s) => (windowSet(s).classes[2].below = 1200)))).toEqual([
      { path: 'containerClasses[1].classes[2]', message: 'the last class has no below' },
    ]);
  });

  it('below must increase along the list: equal or decreasing (at the class path)', () => {
    for (const below of [840, 900]) {
      expect(issuesOf(declared((s) => (windowSet(s).classes[0].below = below)))).toEqual([
        {
          path: 'containerClasses[1].classes[1]',
          message: 'below must increase along the list',
        },
      ]);
    }
  });

  it('below is a number greater than 0', () => {
    for (const below of [0, -5, '600']) {
      expect(issuesOf(declared((s) => (windowSet(s).classes[0].below = below)))).toEqual([
        {
          path: 'containerClasses[1].classes[0].below',
          message: 'must be a number greater than 0',
        },
      ]);
    }
  });

  it('below in a chosen set is an error at the below', () => {
    expect(issuesOf(declared((s) => (platformSet(s).classes[0].below = 100)))).toEqual([
      {
        path: 'containerClasses[0].classes[0].below',
        message: 'below only in a set with by',
      },
    ]);
  });

  it('an unknown key, in the set and in the class', () => {
    expect(issuesOf(declared((s) => (platformSet(s).kind = 'x')))).toEqual([
      { path: 'containerClasses[0].kind', message: 'unknown key: kind' },
    ]);
    expect(issuesOf(declared((s) => (platformSet(s).classes[0].icon = 'x')))).toEqual([
      { path: 'containerClasses[0].classes[0].icon', message: 'unknown key: icon' },
    ]);
  });

  it('shapes: the list and the entries', () => {
    expect(issuesOf(declared((s) => (s.containerClasses = {})))).toEqual([
      { path: 'containerClasses', message: 'must be a list of container class sets' },
    ]);
    expect(issuesOf(declared((s) => (s.containerClasses = ['platform'])))).toEqual([
      { path: 'containerClasses[0]', message: 'must be an object' },
    ]);
    expect(issuesOf(declared((s) => (platformSet(s).classes = ['android'])))).toEqual([
      { path: 'containerClasses[0].classes[0]', message: 'must be an object' },
    ]);
  });
});

describe('formatVersion 21: classes on a ready-made size, decision 5', () => {
  it('a set that does not exist', () => {
    expect(issuesOf(v21((s) => (s.containers[0].classes = { form: 'phone' })))).toEqual([
      {
        path: 'containers[0].classes.form',
        message: 'the set "form" does not exist',
      },
    ]);
  });

  it('a computed set is not chosen (by width and by height)', () => {
    expect(
      issuesOf(v21((s) => (s.containers[0].classes = { window: 'compact' }))),
    ).toEqual([
      {
        path: 'containers[0].classes.window',
        message: 'the set "window" is computed by width: it is not chosen',
      },
    ]);
    expect(
      issuesOf(
        v21((s) => {
          windowSet(s).by = 'height';
          s.containers[0].classes = { window: 'compact' };
        }),
      ),
    ).toEqual([
      {
        path: 'containers[0].classes.window',
        message: 'the set "window" is computed by height: it is not chosen',
      },
    ]);
  });

  it('a class the set does not declare', () => {
    expect(
      issuesOf(v21((s) => (s.containers[1].classes = { platform: 'desktop' }))),
    ).toEqual([
      {
        path: 'containers[1].classes.platform',
        message: '"desktop" is not a class of "platform"',
      },
    ]);
  });

  it('the value is text and the shape is an object', () => {
    expect(issuesOf(v21((s) => (s.containers[0].classes = { platform: 3 })))).toEqual([
      { path: 'containers[0].classes.platform', message: 'must be text' },
    ]);
    expect(issuesOf(v21((s) => (s.containers[0].classes = ['android'])))).toEqual([
      { path: 'containers[0].classes', message: 'must be an object' },
    ]);
  });

  it('a size without classes, and with several chosen sets, is valid', () => {
    expect(
      issuesOf(
        v21((s) => {
          delete s.containers[0].classes;
        }),
      ),
    ).toEqual([]);
    expect(
      issuesOf(
        v21((s) => {
          s.containerClasses.push({
            id: 'form',
            name: 'Form factor',
            classes: [{ id: 'phone', name: 'Phone' }],
          });
          s.containers[0].classes = { platform: 'ios', form: 'phone' };
        }),
      ),
    ).toEqual([]);
  });
});

describe('formatVersion 21: appliesIn on the type, decision 6', () => {
  const sheet = (s: Json): Json => typeOf(s, 0);

  it('a set that does not exist, at appliesIn.<set>', () => {
    expect(issuesOf(v21((s) => (sheet(s).appliesIn = { form: ['phone'] })))).toEqual([
      {
        path: 'layers[0].annotationTypes[0].appliesIn.form',
        message: 'the set "form" does not exist',
      },
    ]);
  });

  it('a class the set does not declare, at appliesIn.<set>', () => {
    expect(
      issuesOf(v21((s) => (sheet(s).appliesIn = { platform: ['android', 'tv'] }))),
    ).toEqual([
      {
        path: 'layers[0].annotationTypes[0].appliesIn.platform',
        message: '"tv" is not a class of "platform"',
      },
    ]);
  });

  it('an empty object and an empty list', () => {
    expect(issuesOf(v21((s) => (sheet(s).appliesIn = {})))).toEqual([
      { path: 'layers[0].annotationTypes[0].appliesIn', message: 'cannot be empty' },
    ]);
    expect(issuesOf(v21((s) => (sheet(s).appliesIn = { platform: [] })))).toEqual([
      {
        path: 'layers[0].annotationTypes[0].appliesIn.platform',
        message: 'cannot be empty',
      },
    ]);
  });

  it('repeated classes', () => {
    expect(
      issuesOf(v21((s) => (sheet(s).appliesIn = { platform: ['ios', 'ios'] }))),
    ).toEqual([
      {
        path: 'layers[0].annotationTypes[0].appliesIn.platform',
        message: 'repeated values',
      },
    ]);
  });

  it('shapes: the object and the list', () => {
    expect(issuesOf(v21((s) => (sheet(s).appliesIn = ['android'])))).toEqual([
      { path: 'layers[0].annotationTypes[0].appliesIn', message: 'must be an object' },
    ]);
    expect(issuesOf(v21((s) => (sheet(s).appliesIn = { platform: 'ios' })))).toEqual([
      {
        path: 'layers[0].annotationTypes[0].appliesIn.platform',
        message: 'must be a list of classes',
      },
    ]);
  });

  it('two sets at once are valid (OR inside a set, AND across sets)', () => {
    expect(
      issuesOf(
        v21((s) => {
          sheet(s).appliesIn = { platform: ['android'], window: ['compact'] };
        }),
      ),
    ).toEqual([]);
  });

  it('an arrow-only type cannot have it', () => {
    expect(
      issuesOf(
        v21((s) => {
          sheet(s).appliesTo = ['arrow'];
        }),
      ),
    ).toEqual([
      {
        path: 'layers[0].annotationTypes[0].appliesIn',
        message: 'appliesIn only on a type that applies to markings in a container',
      },
    ]);
  });

  it('a type that applies to the marking and the arrow can have it', () => {
    expect(
      issuesOf(
        v21((s) => {
          sheet(s).appliesTo = ['marking', 'arrow'];
        }),
      ),
    ).toEqual([]);
  });

  it('a floating type cannot have it', () => {
    expect(
      issuesOf(
        v21((s) => {
          sheet(s).floating = true;
        }),
      ),
    ).toEqual([
      {
        path: 'layers[0].annotationTypes[0].appliesIn',
        message: 'appliesIn only on a type that applies to markings in a container',
      },
    ]);
  });
});

describe('formatVersion 21: earlier versions and the version contract (decision 8)', () => {
  it('every new key in an earlier version is "only allowed with formatVersion 21", at its path', () => {
    for (const version of [20, 6, 1]) {
      // `containers` exists from 6; in 1 to 5 it is its own error, so look only at the new keys.
      const issues = issuesOf(v21(undefined, version)).filter(
        (i) => i.message === ONLY_V21,
      );
      const paths = issues.map((i) => i.path);
      expect(paths).toContain('containerClasses');
      expect(paths).toContain('layers[0].annotationTypes[0].appliesIn');
      expect(paths).toContain('layers[0].annotationTypes[1].appliesIn');
      if (version >= 6) {
        expect(paths).toContain('containers[0].classes');
        expect(paths).toContain('containers[1].classes');
      }
    }
  });

  it('each key alone in 20 is exactly one error at its path', () => {
    expect(
      issuesOf(
        v21((s) => {
          delete s.containers;
          for (const t of s.layers[0].annotationTypes) delete t.appliesIn;
        }, 20),
      ),
    ).toEqual([{ path: 'containerClasses', message: ONLY_V21 }]);
    expect(
      issuesOf(
        v21((s) => {
          delete s.containerClasses;
          for (const t of s.layers[0].annotationTypes) delete t.appliesIn;
          delete s.containers[1].classes;
        }, 20),
      ),
    ).toEqual([{ path: 'containers[0].classes', message: ONLY_V21 }]);
    expect(
      issuesOf(
        v21((s) => {
          delete s.containerClasses;
          delete s.containers;
          delete typeOf(s, 1).appliesIn;
        }, 20),
      ),
    ).toEqual([{ path: 'layers[0].annotationTypes[0].appliesIn', message: ONLY_V21 }]);
  });

  it('a 20 without the new keys is untouched', () => {
    expect(
      issuesOf(
        v21((s) => {
          delete s.containerClasses;
          for (const c of s.containers) delete c.classes;
          for (const t of s.layers[0].annotationTypes) delete t.appliesIn;
        }, 20),
      ),
    ).toEqual([]);
  });

  it('diffSpecs sees no difference when only these keys change', () => {
    const base = parseSpec(v21());
    const changed = parseSpec(
      v21((s) => {
        windowSet(s).classes = [
          { id: 'small', name: 'Small', below: 400 },
          { id: 'large', name: 'Large' },
        ];
        s.containers[0].classes = { platform: 'ios' };
        typeOf(s, 0).appliesIn = { platform: ['web'] };
        delete typeOf(s, 1).appliesIn;
        s.layers[0].annotationTypes[1].appliesIn = { platform: ['ios'] };
      }),
    );
    const bare = parseSpec(
      v21((s) => {
        delete s.containerClasses;
        for (const c of s.containers) delete c.classes;
        for (const t of s.layers[0].annotationTypes) delete t.appliesIn;
      }),
    );
    expect(base.ok && changed.ok && bare.ok).toBe(true);
    if (!base.ok || !changed.ok || !bare.ok) return;
    expect(diffSpecs(base.spec, changed.spec)).toEqual([]);
    expect(diffSpecs(changed.spec, base.spec)).toEqual([]);
    expect(diffSpecs(bare.spec, base.spec)).toEqual([]);
    expect(diffSpecs(base.spec, bare.spec)).toEqual([]);
  });
});
