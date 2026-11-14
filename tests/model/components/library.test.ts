// Components Lab: the specialization points to one file per component.
import { describe, expect, it } from 'vitest';
import { findSlot } from '../../../src/model/components/arrange';
import type { FieldValue } from '../../../src/model/components/componentFormat';
import {
  type TextFile,
  initialValues,
  instanceLabel,
  loadLibrary,
  resolvePath,
  resolvePathChecked,
} from '../../../src/model/components/library';
import {
  SAMPLE_COMPONENTS,
  SAMPLE_FILES,
  SAMPLE_SPEC,
} from '../../../viewer/samples/samples';

describe('library', () => {
  it('resolves paths relative to the specialization file', () => {
    expect(resolvePath('spec.json', 'components/button.json')).toBe(
      'components/button.json',
    );
    expect(resolvePath('design/spec.json', './components/button.json')).toBe(
      'design/components/button.json',
    );
    expect(resolvePath('design/specs/spec.json', '../components/x.json')).toBe(
      'design/components/x.json',
    );
  });

  it('resolvePathChecked returns undefined when the `..` leaves the library root', () => {
    expect(resolvePathChecked('spec.json', '../x.json')).toBeUndefined();
    expect(resolvePathChecked('a/spec.json', '../../x.json')).toBeUndefined();
    expect(resolvePathChecked('a/spec.json', '../x.json')).toBe('x.json');
    expect(resolvePathChecked('spec.json', './components/b.json')).toBe(
      'components/b.json',
    );
  });

  describe('path that leaves the library', () => {
    const specFiles = (spec: Record<string, unknown>): TextFile[] => [
      ...SAMPLE_FILES.filter((f) => !f.path.endsWith('spec.json')),
      { path: 'spec.json', text: JSON.stringify({ ...SAMPLE_SPEC, ...spec }) },
    ];

    it('component: problem at the type path, without a redundant "not found"', () => {
      const layers = SAMPLE_SPEC.layers.map((layer) => ({
        ...layer,
        annotationTypes: layer.annotationTypes.map((t) =>
          t.id === 'button' ? { ...t, component: '../x.json' } : t,
        ),
      }));
      const lib = loadLibrary(specFiles({ layers }));
      expect(lib.problems).toContain('button: path outside the library: ../x.json');
      expect(lib.problems.some((p) => p.includes('not found'))).toBe(false);
      expect(lib.types.find((t) => t.id === 'button')?.component).toBeUndefined();
    });

    it('allowOutside: the `..` that leaves the root is discarded, as in loading by URL', () => {
      const layers = SAMPLE_SPEC.layers.map((layer) => ({
        ...layer,
        annotationTypes: layer.annotationTypes.map((t) =>
          t.id === 'button' ? { ...t, component: '../components/button.json' } : t,
        ),
      }));
      const lib = loadLibrary(specFiles({ layers }), { allowOutside: true });
      expect(lib.problems).toEqual([]);
      expect(lib.types.find((t) => t.id === 'button')?.component).toBeDefined();
    });

    it('font: problem in fonts[i] and the font is not loaded', () => {
      const lib = loadLibrary(
        specFiles({
          fonts: [
            { family: 'Roboto', file: 'fonts/R.ttf' },
            { family: 'Outside', file: '../R.ttf' },
          ],
        }),
      );
      expect(lib.problems).toEqual(['fonts[1]: path outside the library: ../R.ttf']);
      expect(lib.fonts.map((f) => f.family)).toEqual(['Roboto']);
    });

    it('icons: `icons` problem with the quoted text', () => {
      const lib = loadLibrary(specFiles({ icons: '../icons.json' }));
      expect(lib.problems).toEqual(['icons: path outside the library: ../icons.json']);
      expect(lib.icons).toBeUndefined();
    });
  });

  it('instanceLabel: a table value (array/object) counts as empty, never [object Object]', () => {
    const button = loadLibrary(SAMPLE_FILES).types.find((t) => t.id === 'button')!;
    const label = button.labelField!;
    // pt-BR kept: the default label of the button in viewer/samples/samples.ts (pt-BR sample data)
    expect(instanceLabel(button, { [label]: [{ a: 'x' }] })).toBe('Botão');
    // pt-BR kept: same sample default label
    expect(instanceLabel(button, { [label]: { a: 'x' } as unknown as FieldValue })).toBe(
      'Botão',
    );
    expect(instanceLabel(button, { [label]: 42 })).toBe('42');
  });

  it('loads the samples: every type with a valid component and no problems', () => {
    const lib = loadLibrary(SAMPLE_FILES);
    expect(lib.specId).toBe('lab-components');
    expect(lib.problems).toEqual([]);
    expect(lib.types).toHaveLength(SAMPLE_COMPONENTS.length);
    for (const type of lib.types) {
      expect(type.component?.id, type.id).toBe(type.id);
      expect(type.componentPath).toBe(`components/${type.id}.json`);
    }
    const button = lib.types.find((t) => t.id === 'button');
    expect(button?.fields.map((f) => f.key)).toEqual([
      'label',
      'variant',
      'icon',
      'disabled',
      'action',
    ]);
    // pt-BR kept: the preview values of the button in viewer/samples/samples.ts (pt-BR sample data)
    expect(initialValues(button!)).toEqual({
      label: 'Entrar',
      variant: 'primary',
      icon: 'não',
      disabled: 'não',
      action: null,
    });
    expect(instanceLabel(button!, { label: 'Save' })).toBe('Save');
    // pt-BR kept: the default label of the button in viewer/samples/samples.ts (pt-BR sample data)
    expect(instanceLabel(button!, { label: '  ' })).toBe('Botão');
  });

  it('records a missing file, an invalid component and broken JSON as problems, without taking down the rest', () => {
    const files = SAMPLE_FILES.filter((f) => !f.path.endsWith('avatar.json')).map((f) =>
      f.path.endsWith('card.json') ? { ...f, text: '{"format":"mapping-component"}' } : f,
    );
    files.push({ path: 'components/broken.json', text: '{oops' });
    const lib = loadLibrary(files);
    expect(
      lib.problems.some((p) => p.includes('avatar') && p.includes('not found')),
    ).toBe(true);
    expect(
      lib.problems.some((p) =>
        p.endsWith('card.json: formatVersion: expected 1, 2, 3 or 4'),
      ),
    ).toBe(true);
    // one problem per issue, each with the file path
    expect(lib.problems.filter((p) => p.includes('card.json: ')).length).toBeGreaterThan(
      1,
    );
    expect(
      lib.problems.some((p) => p.includes('broken.json') && p.includes('invalid JSON')),
    ).toBe(true);
    expect(lib.types.find((t) => t.id === 'button')?.component).toBeDefined();
    expect(lib.types.find((t) => t.id === 'avatar')?.component).toBeUndefined();
  });

  it('without a specialization, it throws; with two, it uses the first and warns', () => {
    expect(() => loadLibrary([{ path: 'a.json', text: '{}' }])).toThrow(/mapping-spec/);
    const twice = [
      ...SAMPLE_FILES,
      { path: 'other.json', text: JSON.stringify({ ...SAMPLE_SPEC, id: 'other' }) },
    ];
    const lib = loadLibrary(twice);
    expect(lib.specId).toBe('lab-components');
    expect(lib.problems[0]).toMatch(/2 specializations/);
  });

  describe('origins and sources', () => {
    const originOf = (overrides: Record<string, unknown> = {}) => ({
      system: 'sdui',
      node: { type: 'type', props: 'props', children: 'children' },
      screen: {
        width: { path: 'w' },
        height: { path: 'h' },
        roots: [{ path: 'content' }],
      },
      ...overrides,
    });
    const specWith = (
      type: Record<string, unknown>,
      extra: Record<string, unknown> = {},
    ): TextFile[] => {
      const cardFile = SAMPLE_FILES.find((f) => f.path.endsWith('card.json'))!;
      const spec = {
        format: 'mapping-spec',
        formatVersion: 4,
        id: 's',
        name: 'S',
        version: 1,
        ...extra,
        layers: [
          {
            id: 'l',
            name: 'L',
            annotationTypes: [
              { id: 'card', name: 'Card', component: 'components/card.json', ...type },
            ],
          },
        ],
      };
      return [{ path: 'spec.json', text: JSON.stringify(spec) }, cardFile];
    };

    it('reads origins and sources (including from other systems) without problems', () => {
      const lib = loadLibrary(
        specWith(
          {
            sources: [
              { system: 'figma', id: '1:2', name: 'DS/Card' },
              { system: 'sdui', name: 'Card', slot: 'content', ignore: ['a'] },
            ],
            fields: [
              {
                key: 'k',
                type: 'enum',
                options: ['a', 'b'],
                sources: [
                  { system: 'figma', name: 'Kind', values: { A: 'a' } },
                  { system: 'sdui', path: 'x.y[0]', values: { '0': 'b' } },
                ],
              },
            ],
          },
          { origins: [originOf()] },
        ),
      );
      expect(lib.origins.map((o) => o.system)).toEqual(['sdui']);
      const card = lib.types[0]!;
      expect(card.sources).toEqual([
        { system: 'figma', id: '1:2', name: 'DS/Card' },
        { system: 'sdui', name: 'Card', slot: 'content', ignore: ['a'] },
      ]);
      expect(card.fields[0]!.sources).toHaveLength(2);
      expect(lib.problems.filter((p) => !p.includes('slot'))).toEqual([]);
    });

    it('without origins or sources: empty lists', () => {
      const lib = loadLibrary(SAMPLE_FILES);
      expect(lib.origins).toEqual([]);
      for (const type of lib.types) {
        expect(type.sources).toEqual([]);
        for (const field of type.fields) expect(field.sources).toEqual([]);
      }
    });

    it('origins problems appear in library.problems, with a path', () => {
      const lib = loadLibrary(
        specWith({}, { origins: [originOf({ extra: 1, node: { type: 'type' } })] }),
      );
      expect(lib.origins).toEqual([]);
      expect(lib.problems.some((p) => p.startsWith('origins[0].extra:'))).toBe(true);
      expect(lib.problems.some((p) => p.startsWith('origins[0].node.props:'))).toBe(true);
    });

    it('a scrim that is not a type of the specialization is a problem', () => {
      const lib = loadLibrary(
        specWith(
          {},
          {
            origins: [
              originOf({
                screen: {
                  width: 10,
                  height: 20,
                  roots: [{ path: 'm', scrim: 'does-not-exist' }],
                },
              }),
            ],
          },
        ),
      );
      expect(lib.problems).toContain(
        'origins[0].screen.roots[0].scrim: nonexistent type: does-not-exist',
      );
    });

    it('the type slot must be the name of the component slot', () => {
      const slotName = (() => {
        const lib = loadLibrary(SAMPLE_FILES);
        const card = lib.types.find((t) => t.id === 'card')!;
        return findSlot(card.component!)?.name;
      })();
      expect(slotName).toBeDefined();
      const ok = loadLibrary(
        specWith({ sources: [{ system: 'sdui', name: 'Card', slot: slotName }] }),
      );
      expect(ok.problems).toEqual([]);
      const wrong = loadLibrary(
        specWith({ sources: [{ system: 'sdui', name: 'Card', slot: 'other' }] }),
      );
      expect(wrong.problems).toEqual([
        `card.sources[0].slot: the component's slot is "${slotName}", not "other"`,
      ]);
      // Component without a slot: the button.
      const buttonFile = SAMPLE_FILES.find((f) => f.path.endsWith('button.json'))!;
      const noSlot = loadLibrary([
        {
          path: 'spec.json',
          text: JSON.stringify({
            format: 'mapping-spec',
            formatVersion: 4,
            id: 's',
            name: 'S',
            version: 1,
            layers: [
              {
                id: 'l',
                name: 'L',
                annotationTypes: [
                  {
                    id: 'button',
                    name: 'B',
                    component: 'components/button.json',
                    sources: [{ system: 'sdui', name: 'B', slot: 'x' }],
                    fields: [],
                  },
                ],
              },
            ],
          }),
        },
        buttonFile,
      ]);
      expect(noSlot.problems).toEqual([
        'button.sources[0].slot: the component has no slot',
      ]);
    });

    it('values only on an enum field and with targets inside options', () => {
      const lib = loadLibrary(
        specWith({
          fields: [
            {
              key: 'text',
              type: 'string',
              sources: [{ system: 'sdui', name: 'a', values: { x: 'y' } }],
            },
            {
              key: 'mode',
              type: 'enum',
              options: ['a', 'b'],
              sources: [{ system: 'figma', name: 'M', values: { X: 'a', Y: 'zzz' } }],
            },
          ],
        }),
      );
      expect(lib.problems).toEqual([
        'card.fields[0].sources[0].values: only valid on an enum field',
        'card.fields[1].sources[0].values.Y: target outside options: zzz',
      ]);
    });

    it('a malformed type or field source becomes a problem and is discarded', () => {
      const lib = loadLibrary(
        specWith({
          sources: [
            { system: 'sdui' },
            { name: 'X' },
            { system: 'sdui', name: 'X', extra: 1 },
            { system: 'sdui', name: 'Ok', ignore: 'a' },
            { system: 'sdui', name: 'Right' },
          ],
          fields: [
            {
              key: 'a',
              type: 'string',
              sources: [{ system: 'sdui' }, { system: 'sdui', name: 'ok' }, 3],
            },
          ],
        }),
      );
      expect(lib.types[0]!.sources).toEqual([{ system: 'sdui', name: 'Right' }]);
      expect(lib.types[0]!.fields[0]!.sources).toEqual([{ system: 'sdui', name: 'ok' }]);
      expect(lib.problems).toEqual([
        'card.fields[0].sources[0]: needs name or path',
        'card.fields[0].sources[2]: expected an object',
        'card.sources[0]: needs id or name',
        'card.sources[1].system: expected non-empty text',
        'card.sources[2].extra: unknown key: extra',
        'card.sources[3].ignore: expected a list of texts',
      ]);
    });

    it('the path of a field, in an executable origin, is a valid path without [*]', () => {
      const lib = loadLibrary(
        specWith(
          {
            fields: [
              {
                key: 'a',
                type: 'string',
                sources: [
                  { system: 'sdui', path: 'a..b' },
                  { system: 'sdui', path: 'a[*]' },
                  { system: 'sdui', path: 'a.b[0]' },
                  { system: 'figma', name: 'anything..' },
                ],
              },
            ],
          },
          { origins: [originOf()] },
        ),
      );
      expect(lib.problems).toEqual([
        'card.fields[0].sources[0].path: invalid path "a..b" (empty segment)',
        'card.fields[0].sources[1].path: "[*]" is only valid in roots[].path',
      ]);
      expect(lib.types[0]!.fields[0]!.sources.map((s) => s.system)).toEqual([
        'sdui',
        'figma',
      ]);
    });

    it('a field of an executable system without path is a problem, with the field path', () => {
      const lib = loadLibrary(
        specWith(
          {
            fields: [
              {
                key: 'a',
                type: 'string',
                sources: [{ system: 'sdui', name: 'only-the-name' }],
              },
            ],
          },
          { origins: [originOf()] },
        ),
      );
      expect(lib.problems).toEqual([
        'card.fields[0].sources[0].path: required in a system declared in origins',
      ]);
    });

    it('name and path coexist: the name is only the name and the path is the path', () => {
      const lib = loadLibrary(
        specWith(
          {
            fields: [
              {
                key: 'a',
                type: 'string',
                sources: [{ system: 'sdui', name: 'a.b[', path: 'x.y' }],
              },
            ],
          },
          { origins: [originOf()] },
        ),
      );
      expect(lib.problems).toEqual([]);
      expect(lib.types[0]!.fields[0]!.sources).toEqual([
        { system: 'sdui', name: 'a.b[', path: 'x.y' },
      ]);
    });
  });
});
