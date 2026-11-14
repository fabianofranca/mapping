import { describe, expect, it } from 'vitest';
import { UsageError, parseArgs } from '../../mcp/args';

describe('parseArgs', () => {
  it('reads one or more roots, in both forms', () => {
    expect(parseArgs(['--root', 'a']).roots).toEqual(['a']);
    expect(parseArgs(['--root', 'a', '--root=b/c']).roots).toEqual(['a', 'b/c']);
  });

  it('--help and --version do not need a root', () => {
    expect(parseArgs(['--help'])).toMatchObject({ help: true, roots: [] });
    expect(parseArgs(['-v'])).toMatchObject({ version: true });
  });

  it('--no-http turns off the image server (default: on)', () => {
    expect(parseArgs(['--root', 'a']).http).toBe(true);
    expect(parseArgs(['--root', 'a', '--no-http']).http).toBe(false);
  });

  it('requires at least one root and refuses unknown arguments', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['--foo'])).toThrow('unknown argument');
  });

  it('refuses --root without a value', () => {
    expect(() => parseArgs(['--root'])).toThrow(UsageError);
    expect(() => parseArgs(['--root', '--root', 'a'])).toThrow(UsageError);
    expect(() => parseArgs(['--root='])).toThrow(UsageError);
  });
});
