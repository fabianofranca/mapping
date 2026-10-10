import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateProject } from '../../src/model';
import {
  INVALID_CASES,
  INVALID_FIXTURES_DIR,
  buildInvalidCase,
  readInvalidFixture,
} from './invalidFixtures';
import { cadastroProject } from './specFixtures';

const update = process.env.UPDATE_FIXTURES === '1';

describe('fixtures inconsistentes (tests/fixtures/invalid)', () => {
  it.each(INVALID_CASES)('$name.json é o gerado a partir do roteiro 13.9', (c) => {
    const text = serialize(buildInvalidCase(c));
    if (update) {
      mkdirSync(INVALID_FIXTURES_DIR, { recursive: true });
      writeFileSync(join(INVALID_FIXTURES_DIR, `${c.name}.json`), text);
    }
    expect(readInvalidFixture(c.name)).toBe(text);
  });

  it('o projeto do roteiro 13.9 íntegro abre sem passar pelo reparo', () => {
    const result = deserialize(serialize(cadastroProject()));
    expect(result.ok).toBe(true);
    expect(result.ok ? null : result.repair).toBeNull();
  });

  it.each(INVALID_CASES)('$name.json: recusado com a lista exata', (c) => {
    const result = deserialize(readInvalidFixture(c.name));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invariant-violation');
    if (result.error.code !== 'invariant-violation') return;
    expect(result.error.issues.map((i) => i.code)).toContain(c.code);
    for (const issue of result.error.issues) {
      expect(issue.entity).toMatch(/^(image|marking|annotation|layer|spec)$/);
      expect(issue.id).not.toBe('');
    }
  });

  it.each(INVALID_CASES)('$name.json: abre reparado ou fica só a lista', (c) => {
    const result = deserialize(readInvalidFixture(c.name));
    if (result.ok) throw new Error('deveria ser recusado');
    const repair = result.repair;
    if (!repair) throw new Error('sem resultado do reparo');
    if (c.repairable) {
      expect(repair.unrepaired).toEqual([]);
      expect(repair.repaired.length).toBeGreaterThan(0);
      expect(validateProject(repair.project)).toEqual([]);
      // O reparado grava e relê sem passar de novo pelo reparo.
      expect(deserialize(serialize(repair.project)).ok).toBe(true);
    } else {
      expect(repair.unrepaired.map((i) => i.code)).toContain(c.code);
    }
  });
});
