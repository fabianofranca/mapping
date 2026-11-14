// `mapping-signature` sheet (formatVersion 1; stage #1079, decision 4): `parseSignature`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSignature } from '../../../src/model/signatures';
import { buttonSignature, type Json } from './fixtures';

const issuesOf = (raw: unknown) => {
  const r = parseSignature(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

describe('parseSignature', () => {
  it('the example signature of decision 4 is valid', () => {
    const r = parseSignature(buttonSignature());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.signature.params.map((p) => p.name)).toEqual([
        'onClick',
        'modifier',
        'enabled',
        'shape',
        'colors',
        'content',
      ]);
      expect(r.signature.params[4]?.factory?.params[0]?.name).toBe('containerColor');
    }
  });

  it('a design signature (Figma) with enum, boolean and text is valid', () => {
    const raw = {
      format: 'mapping-signature',
      formatVersion: 1,
      source: {
        kind: 'design',
        system: 'figma',
        id: '12:34',
        name: 'Button',
        extractor: 'mapping-signature/figma@1',
      },
      params: [
        {
          name: 'Style',
          id: '1:2',
          role: 'value',
          type: 'VARIANT',
          value: { kind: 'enum', options: ['Filled', 'Outlined'], default: 'Filled' },
        },
        { name: 'Label', role: 'value', type: 'TEXT', value: { kind: 'text' } },
        { name: 'Icon', role: 'slot', type: 'INSTANCE_SWAP' },
      ],
    };
    expect(issuesOf(raw)).toEqual([]);
  });

  it('unknown key is an error, with the path', () => {
    expect(issuesOf(buttonSignature((s) => (s.extra = 1)))).toEqual([
      { path: '', message: 'unknown property: "extra"' },
    ]);
    expect(
      issuesOf(buttonSignature((s) => (s.params[0].colour = 'x'))).map((i) => i.path),
    ).toEqual(['params[0]']);
  });

  it('role outside the set is an error, with the path', () => {
    const issues = issuesOf(buttonSignature((s) => (s.params[1].role = 'bogus')));
    expect(issues.map((i) => i.path)).toEqual(['params[1].role']);
    expect(issues[0]?.message).toContain('value');
  });

  it('value.kind outside the set is an error, with the path', () => {
    const issues = issuesOf(buttonSignature((s) => (s.params[2].value.kind = 'matrix')));
    expect(issues.map((i) => i.path)).toEqual(['params[2].value.kind']);
  });

  it('factory nested two levels is an error, with the path', () => {
    const issues = issuesOf(
      buttonSignature((s) => {
        s.params[4].factory.params[0].factory = { call: 'x.y', params: [] };
      }),
    );
    expect(issues.map((i) => i.path)).toEqual(['params[4].factory.params[0].factory']);
  });

  it('the format and the version must match', () => {
    expect(issuesOf(buttonSignature((s) => (s.format = 'mapping-spec')))).not.toEqual([]);
    expect(issuesOf(buttonSignature((s) => (s.formatVersion = 2)))).not.toEqual([]);
  });

  it('enum without options and repeated parameter name are errors', () => {
    expect(
      issuesOf(
        buttonSignature((s) => {
          s.params[2].value = { kind: 'enum' };
        }),
      ).map((i) => i.path),
    ).toEqual(['params[2].value.options']);
    expect(
      issuesOf(
        buttonSignature((s) => {
          s.params[1].name = 'onClick';
        }),
      ).map((i) => i.path),
    ).toEqual(['params[1].name']);
  });

  it('code source without platform or design source without system is an error', () => {
    expect(
      issuesOf(buttonSignature((s) => delete s.source.platform)).map((i) => i.path),
    ).toEqual(['source.platform']);
    expect(issuesOf(buttonSignature((s) => (s.source.kind = 'design')))).not.toEqual([]);
  });

  it('JSON that is not an object is an error', () => {
    expect(issuesOf('text')).not.toEqual([]);
    expect(issuesOf(null)).not.toEqual([]);
  });
});

describe('docs/signature.schema.json', () => {
  const schema = JSON.parse(readFileSync('docs/signature.schema.json', 'utf8')) as Record<
    string,
    unknown
  >;
  const validator = z.fromJSONSchema(schema as never);

  it('accepts the example signature and the design one, like parseSignature', () => {
    expect(validator.safeParse(buttonSignature()).success).toBe(true);
    const design = {
      format: 'mapping-signature',
      formatVersion: 1,
      source: {
        kind: 'design',
        system: 'figma',
        id: '1:2',
        name: 'B',
        extractor: 'agent',
      },
      params: [
        {
          name: 'Style',
          role: 'value',
          type: 'VARIANT',
          value: { kind: 'enum', options: ['A'] },
        },
      ],
    };
    expect(validator.safeParse(design).success).toBe(true);
    expect(parseSignature(design).ok).toBe(true);
  });

  it('refuses what parseSignature refuses: key, role, kind and two-level factory', () => {
    const edits: ((s: Json) => void)[] = [
      (s) => (s.extra = 1),
      (s) => (s.params[1].role = 'bogus'),
      (s) => (s.params[2].value.kind = 'matrix'),
      (s) => (s.params[4].factory.params[0].factory = { call: 'x.y', params: [] }),
    ];
    for (const edit of edits) {
      const bad = buttonSignature(edit);
      expect(validator.safeParse(bad).success).toBe(false);
      expect(parseSignature(bad).ok).toBe(false);
    }
  });
});
