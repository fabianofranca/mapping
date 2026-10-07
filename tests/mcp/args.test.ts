import { describe, expect, it } from 'vitest';
import { UsageError, parseArgs } from '../../mcp/args';

describe('parseArgs', () => {
  it('lê uma ou mais raízes, nas duas formas', () => {
    expect(parseArgs(['--root', 'a']).roots).toEqual(['a']);
    expect(parseArgs(['--root', 'a', '--root=b/c']).roots).toEqual(['a', 'b/c']);
  });

  it('--help e --version dispensam a raiz', () => {
    expect(parseArgs(['--help'])).toMatchObject({ help: true, roots: [] });
    expect(parseArgs(['-v'])).toMatchObject({ version: true });
  });

  it('exige ao menos uma raiz e recusa argumentos desconhecidos', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['--foo'])).toThrow('desconhecido');
  });

  it('recusa --root sem valor', () => {
    expect(() => parseArgs(['--root'])).toThrow(UsageError);
    expect(() => parseArgs(['--root', '--root', 'a'])).toThrow(UsageError);
    expect(() => parseArgs(['--root='])).toThrow(UsageError);
  });
});
