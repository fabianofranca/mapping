import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exampleProjectBlob } from '../../src/app/exampleProject';

describe('projeto de exemplo embutido na app', () => {
  it('é o examples/exemplo-completo.zip, byte a byte', async () => {
    const blob = exampleProjectBlob();
    expect(blob.type).toBe('application/zip');
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.equals(readFileSync('examples/exemplo-completo.zip'))).toBe(true);
  });
});
