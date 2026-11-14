// `formatVersion` 10: `notices` on a type, field and table column (stage #486, AV1).
import { describe, expect, it } from 'vitest';
import {
  parseSpec,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  type Spec,
} from '../../src/model/spec';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TYPE = 'layers[0].annotationTypes[0]';
const FIELD = `${TYPE}.fields[1]`;
const COLUMN = `${FIELD}.columns[0]`;

/** Specialization with one type, a `string` field and a one-column `table`. */
function spec(formatVersion = 10): Json {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 't',
            name: 'T',
            fields: [
              { key: 'k', type: 'string' },
              { key: 'lines', type: 'table', columns: [{ key: 'c', type: 'string' }] },
            ],
          },
        ],
      },
    ],
  };
}

/** The specialization with `notices` on the type, on the field `k` (index 0) and on the column `c`. */
function withNotices(
  formatVersion: number,
  where: ('type' | 'field' | 'column')[] = ['type', 'field', 'column'],
  notices: Json[] = [{ kind: 'deprecated', message: 'use another' }],
): Json {
  const json = spec(formatVersion);
  const type = json.layers[0].annotationTypes[0];
  if (where.includes('type')) type.notices = notices;
  if (where.includes('field')) type.fields[1].notices = notices;
  if (where.includes('column')) type.fields[1].columns[0].notices = notices;
  return json;
}

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.issues.map(({ path, message }) => ({ path, message }));
}

function parsed(input: unknown): Spec {
  const result = parseSpec(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

/** v10 spec with a single `notice` on the type. */
function typeNotice(notice: unknown): Json {
  return withNotices(10, ['type'], [notice as Json]);
}

describe('formatVersion 10: notices', () => {
  it('the current version is 16 and v1 to v9 are still accepted', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    for (const v of SPEC_FORMAT_VERSIONS) {
      expect(parseSpec(spec(v)).ok, `v${v}`).toBe(true);
    }
  });

  it('accepts notices on the type, the field and the table column and returns them', () => {
    const notices = [
      {
        kind: 'removed',
        message: 'left the library',
        since: '2026-03-01',
        ref: 'M3-12',
      },
      { kind: 'pending', message: 'the drawing is missing' },
    ];
    const result = parsed(withNotices(10, ['type', 'field', 'column'], notices));
    const type = result.layers[0]?.annotationTypes[0];
    expect(type?.notices).toEqual(notices);
    const table = type?.fields[1];
    expect(table?.notices).toEqual(notices);
    expect(table?.type === 'table' ? table.columns[0]?.notices : undefined).toEqual(
      notices,
    );
  });

  it('empty notices is accepted; so are the four kinds', () => {
    expect(issuesOf(withNotices(10, ['type'], []))).toEqual([]);
    for (const kind of ['removed', 'deprecated', 'diverges', 'pending']) {
      expect(issuesOf(typeNotice({ kind, message: 'x' })), kind).toEqual([]);
    }
  });

  it('notices in a v9 (and earlier) is an error at the path of the type, the field and the column', () => {
    for (const v of [1, 5, 8, 9]) {
      expect(issuesOf(withNotices(v)), `v${v}`).toEqual([
        { path: `${TYPE}.notices`, message: 'only allowed with formatVersion 10' },
        { path: `${FIELD}.notices`, message: 'only allowed with formatVersion 10' },
        { path: `${COLUMN}.notices`, message: 'only allowed with formatVersion 10' },
      ]);
    }
    expect(issuesOf(spec(9))).toEqual([]);
  });

  it('kind outside the list or missing', () => {
    expect(issuesOf(typeNotice({ kind: 'obsolete', message: 'x' }))).toEqual([
      {
        path: `${TYPE}.notices[0].kind`,
        message:
          '"obsolete" is invalid; use "removed", "deprecated", "diverges" or "pending"',
      },
    ]);
    expect(issuesOf(typeNotice({ message: 'x' }))).toEqual([
      { path: `${TYPE}.notices[0].kind`, message: 'required' },
    ]);
  });

  it('message missing, empty or only spaces', () => {
    expect(issuesOf(typeNotice({ kind: 'pending' }))).toEqual([
      { path: `${TYPE}.notices[0].message`, message: 'required' },
    ]);
    for (const message of ['', '   ', '\t\n']) {
      expect(
        issuesOf(typeNotice({ kind: 'pending', message })),
        JSON.stringify(message),
      ).toEqual([{ path: `${TYPE}.notices[0].message`, message: 'cannot be empty' }]);
    }
  });

  it('since must be a real date YYYY-MM-DD', () => {
    const since = (value: string) =>
      issuesOf(typeNotice({ kind: 'pending', message: 'x', since: value }));
    const path = `${TYPE}.notices[0].since`;
    expect(since('2026-02-30')).toEqual([{ path, message: 'nonexistent date' }]);
    // The wrong format also fails the existence check (the format's `dateString` is the same as the fields').
    expect(since('04/11/2026')).toEqual([
      { path, message: 'invalid date; use YYYY-MM-DD' },
      { path, message: 'nonexistent date' },
    ]);
    expect(since('2026-02-28')).toEqual([]);
  });

  it('empty ref is an error', () => {
    expect(issuesOf(typeNotice({ kind: 'pending', message: 'x', ref: '' }))).toEqual([
      { path: `${TYPE}.notices[0].ref`, message: 'cannot be empty' },
    ]);
  });

  it('an extra property in a notice is an error', () => {
    const issues = issuesOf(typeNotice({ kind: 'pending', message: 'x', severity: 1 }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe(`${TYPE}.notices[0]`);
    expect(issues[0]?.message).toContain('severity');
  });

  it('repeated notice (same kind and same message) on the type, the field and the column', () => {
    const notices = [
      { kind: 'pending', message: 'a' },
      { kind: 'pending', message: 'b' },
      { kind: 'pending', message: 'a', since: '2026-01-01' },
      { kind: 'removed', message: 'a' },
    ];
    expect(issuesOf(withNotices(10, ['type', 'field', 'column'], notices))).toEqual([
      { path: `${TYPE}.notices[2]`, message: 'repeated notice' },
      { path: `${FIELD}.notices[2]`, message: 'repeated notice' },
      { path: `${COLUMN}.notices[2]`, message: 'repeated notice' },
    ]);
  });

  it('notices that is not a list is an error', () => {
    const json = spec();
    json.layers[0].annotationTypes[0].notices = { kind: 'pending', message: 'x' };
    expect(issuesOf(json)).toHaveLength(1);
    expect(issuesOf(json)[0]?.path).toBe(`${TYPE}.notices`);
  });
});
