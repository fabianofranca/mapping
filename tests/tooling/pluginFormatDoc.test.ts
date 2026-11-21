// @vitest-environment node
// `docs/PLUGIN-FORMAT.md` (stage #1923, FP2) documents the plugin contract: everything the model
// fixes (the allowed operations and their keys, the top-level keys of the projection and the
// limits) appears there, in backticks. A new operation, key or limit without a line in the document
// fails here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FORMAT_INPUT_KEYS,
  FORMAT_OPERATION_KEYS,
  FORMAT_PLUGIN_CONTRACT,
  FORMAT_PLUGIN_LIMITS,
  FORMAT_RESULT_OPERATIONS,
} from '../../src/model';

const DOC = readFileSync('docs/PLUGIN-FORMAT.md', 'utf8');
const SPEC_FORMAT = readFileSync('docs/SPEC-FORMAT.md', 'utf8');
const quoted = (word: string) => `\`${word}\``;

describe('docs/PLUGIN-FORMAT.md', () => {
  it.each(FORMAT_RESULT_OPERATIONS)('names the operation %s in backticks', (op) => {
    expect(DOC).toContain(quoted(op));
  });

  it.each(FORMAT_INPUT_KEYS)('names the top-level key %s of the projection', (key) => {
    expect(DOC).toContain(quoted(key));
  });

  it.each(Object.keys(FORMAT_PLUGIN_LIMITS))('names the limit %s', (limit) => {
    expect(DOC).toContain(quoted(limit));
  });

  it('lists the keys of each operation in the row of its table', () => {
    for (const op of FORMAT_RESULT_OPERATIONS) {
      const row = DOC.split('\n').find((line) => line.startsWith(`| ${quoted(op)}`));
      expect(row, `row of ${op}`).toBeDefined();
      for (const key of FORMAT_OPERATION_KEYS[op]) {
        expect(row, `${op}.${key}`).toContain(quoted(key));
      }
    }
  });

  it('declares the projection in TypeScript with the contract number', () => {
    expect(DOC).toContain('```ts');
    expect(DOC).toContain(`contract: ${FORMAT_PLUGIN_CONTRACT};`);
    for (const key of FORMAT_INPUT_KEYS) {
      expect(DOC, key).toMatch(new RegExp(`^ {2}${key}[:?]`, 'm'));
    }
  });

  it('names the five plugin error codes', () => {
    for (const code of [
      'format-not-found',
      'plugin-failed',
      'plugin-timeout',
      'plugin-limit',
      'plugin-output-invalid',
    ]) {
      expect(DOC).toContain(quoted(code));
    }
  });

  it('is linked from "File formats" in SPEC-FORMAT.md', () => {
    const start = SPEC_FORMAT.indexOf('### File formats (`formatVersion` 20)');
    const end = SPEC_FORMAT.indexOf('\n## ', start);
    expect(start).toBeGreaterThan(0);
    expect(SPEC_FORMAT.slice(start, end)).toContain('(PLUGIN-FORMAT.md)');
  });
});
