import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// The `mapping-viewer/formats` entry bundles zod, which probes `new Function` at load; a host with a CSP
// without `unsafe-eval` would log a `securitypolicyviolation` for it (stage #2059, VF3). The entry turns
// the probe off (`jitless`), as the app does in `src/utils/zodConfig.ts`.
describe('the formats entry and zod', () => {
  it('sets zod to jitless when loaded, so the host CSP sees no eval violation', async () => {
    await import('../../viewer/formats');
    expect(z.config().jitless).toBe(true);
  });
});
