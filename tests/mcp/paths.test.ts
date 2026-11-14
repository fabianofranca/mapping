import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasParentSegment, isWithin } from '../../mcp/paths';

// The server tests run only on Linux (CI `ubuntu-latest`); the two path checks
// that matter on Windows are tested here with `path.win32` (phase 8.5, M14).

describe('isWithin', () => {
  it.each([
    ['C:\\proj', 'C:\\proj', true],
    ['C:\\proj', 'C:\\proj\\store\\mapping.json', true],
    ['C:\\proj', 'c:\\PROJ\\store', true],
    ['C:\\proj\\', 'C:\\proj\\store', true],
    ['C:\\proj', 'C:\\project', false],
    ['C:\\proj', 'C:\\proj\\..\\outside', false],
    ['C:\\proj', 'C:\\', false],
    ['C:\\proj', 'D:\\proj\\store', false],
    ['\\\\server\\design', '\\\\server\\design\\store', true],
    ['\\\\server\\design', '\\\\server\\other\\store', false],
    ['\\\\server\\design', 'C:\\design\\store', false],
  ])('win32: %s contains %s? %s', (parent, child, expected) => {
    expect(isWithin(parent, child, path.win32)).toBe(expected);
  });

  it.each([
    ['/root', '/root/store', true],
    ['/root', '/root', true],
    ['/root', '/root-2/store', false],
    ['/root', '/', false],
    ['/root', '/ROOT/store', false],
  ])('posix (default): %s contains %s? %s', (parent, child, expected) => {
    expect(isWithin(parent, child)).toBe(expected);
    expect(isWithin(parent, child, path.posix)).toBe(expected);
  });
});

describe('hasParentSegment', () => {
  it.each([
    ['..\\outside', true],
    ['store\\..\\..\\outside', true],
    ['store/..\\outside', true],
    ['C:\\proj\\..', true],
    ['store\\a..b\\c', false],
    ['store\\..x', false],
    ['..store', false],
    ['store\\images', false],
  ])('%s → %s', (input, expected) => {
    expect(hasParentSegment(input)).toBe(expected);
  });
});
