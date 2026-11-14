import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MAX_CONTAINER_SIZE, parseSpec, type SpecIssue } from '../../src/model';

// Specialization formatVersion 6 (Container stage): `containers` at the root, the presets of the
// New container dialog. v1 to v5 stay as they were and reject the key.

const read = (path: string): string => readFileSync(path, 'utf8');
const sdui = read('tests/fixtures/sdui-v2.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PHONE = { id: 'phone', name: 'Phone', width: 360, height: 800 };

function withContainers(containers: unknown, formatVersion = 6): Json {
  const spec = JSON.parse(sdui) as Json;
  spec.formatVersion = formatVersion;
  spec.containers = containers;
  return spec;
}

function issuesOf(spec: Json): SpecIssue[] {
  const result = parseSpec(spec);
  if (result.ok) throw new Error('was supposed to fail');
  return result.issues;
}

describe('formatVersion 6: containers', () => {
  it('valid presets pass in zod and in the JSON Schema and survive parsing', () => {
    const containers = [
      PHONE,
      { ...PHONE, id: 'tablet', width: 800, background: '#eeeeee' },
    ];
    const spec = withContainers(containers);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    const result = parseSpec(spec);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.spec.containers).toEqual(containers);
  });

  it('the v5 is still accepted without containers', () => {
    const spec = JSON.parse(sdui) as Json;
    spec.formatVersion = 5;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('before v6 the key is an error at the exact path', () => {
    for (const version of [2, 5]) {
      const issues = issuesOf(withContainers([PHONE], version));
      expect(issues.map((i) => [i.path, i.message])).toContainEqual([
        'containers',
        'only allowed with formatVersion 6',
      ]);
    }
  });

  it('repeated id is an error on the id of the second', () => {
    const issues = issuesOf(withContainers([PHONE, { ...PHONE, name: 'Other' }]));
    expect(issues.map((i) => [i.path, i.message])).toContainEqual([
      'containers[1].id',
      'id "phone" repeated',
    ]);
  });

  it.each([
    ['id outside the format', { ...PHONE, id: 'Phone 1' }, 'containers[0].id'],
    ['empty name', { ...PHONE, name: '' }, 'containers[0].name'],
    ['zero width', { ...PHONE, width: 0 }, 'containers[0].width'],
    [
      'height above the limit',
      { ...PHONE, height: MAX_CONTAINER_SIZE + 1 },
      'containers[0].height',
    ],
    ['fractional width', { ...PHONE, width: 10.5 }, 'containers[0].width'],
    ['invalid background', { ...PHONE, background: 'blue' }, 'containers[0].background'],
  ])('rejects: %s', (_name, container, path) => {
    const spec = withContainers([container]);
    expect(issuesOf(spec).some((i) => i.path === path)).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('accepts the limits 1 and MAX_CONTAINER_SIZE', () => {
    const spec = withContainers([{ ...PHONE, width: 1, height: MAX_CONTAINER_SIZE }]);
    expect(parseSpec(spec).ok).toBe(true);
  });
});
