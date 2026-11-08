import { it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { SPEC_FILE, files } from '../support/material3Library';
it('x', () => {
  const r = validateLibrary({ files, specPath: SPEC_FILE });
  console.log(JSON.stringify([...r.errors, ...r.warnings].filter((m) => /time-picker/.test(JSON.stringify(m))), null, 1));
});
