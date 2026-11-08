import { it } from 'vitest';
import { validateLibrary } from '/home/user/mapping/src/model/library';
import { SPEC_FILE, files } from '/home/user/mapping/tests/support/material3Library';
it('v', () => {
  const r = validateLibrary({ files, specPath: SPEC_FILE });
  throw new Error(JSON.stringify([r.errors, r.warnings].map((l) => l.slice(0, 12)), null, 1));
});
