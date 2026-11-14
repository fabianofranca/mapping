// Library validator (level 2) with `$token` (CF5): the token must exist in the specialization's
// `tokens` (or be built in) and have the type the position expects.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'tk.spec.json';

function component(children: Raw[], formatVersion = 4): Raw {
  return {
    format: 'mapping-component',
    formatVersion,
    id: 'tk',
    name: 'Tk',
    size: { width: 100, height: 50 },
    template: { type: 'frame', children },
  };
}

function spec(tokens?: unknown): Raw {
  return {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 'tk',
    name: 'Tk',
    version: 1,
    ...(tokens === null ? {} : { tokens }),
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 't', name: 'T', component: 'components/tk.json', fields: [] },
        ],
      },
    ],
  };
}

const TOKENS = {
  modes: ['light', 'dark'],
  values: { primary: { light: '#1a73e8', dark: '#8ab4f8' }, radius: 8 },
};

function validate(comp: Raw, tokens: unknown = TOKENS) {
  return validateLibrary({
    specPath: SPEC_PATH,
    level: 2,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(tokens)) },
      { path: 'components/tk.json', text: JSON.stringify(comp) },
    ],
  });
}

const messages = (r: ReturnType<typeof validate>) =>
  r.errors.map((e) => [e.file, e.path, e.message]);

describe('validateLibrary with $token', () => {
  it('existing tokens of the right type (and the built-in ones) pass', () => {
    const r = validate(
      component([
        { type: 'rect', fill: { $token: 'primary' }, cornerRadius: { $token: 'radius' } },
        { type: 'text', text: 'x', font: { family: { $token: 'font-mono' } } },
      ]),
    );
    expect(r.errors).toEqual([]);
  });

  it('a missing token gives an error with the node path', () => {
    const r = validate(component([{ type: 'rect', fill: { $token: 'inexistente' } }]));
    expect(messages(r)).toContainEqual([
      'components/tk.json',
      'template.children[0].fill',
      'the token "inexistente" does not exist in the specialization tokens',
    ]);
  });

  it('a color token where a number is expected is an error', () => {
    const r = validate(
      component([{ type: 'rect', cornerRadius: { $token: 'primary' } }]),
    );
    expect(messages(r)).toContainEqual([
      'components/tk.json',
      'template.children[0].cornerRadius',
      'the token "primary" is a color, but a number is expected here',
    ]);
  });

  it('specialization without tokens: only the built-in ones exist', () => {
    const r = validate(component([{ type: 'rect', fill: { $token: 'primary' } }]), null);
    expect(messages(r)).toContainEqual([
      'components/tk.json',
      'template.children[0].fill',
      'the token "primary" does not exist in the specialization tokens',
    ]);
  });

  it('$token in v3 fails with the version message', () => {
    const r = validate(component([{ type: 'rect', fill: { $token: 'primary' } }], 3));
    expect(messages(r)).toContainEqual([
      'components/tk.json',
      'template.children[0].fill',
      'only allowed with formatVersion 4',
    ]);
  });
});
