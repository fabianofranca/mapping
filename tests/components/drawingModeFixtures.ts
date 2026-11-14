import type { Project } from '../../src/model';
import { codeProject } from '../model/specFixtures';

/** The test project with `light` and `dark` declared in the `tokens` of the first specialization. */
export function projectWithModes(modes: readonly string[] = ['light', 'dark']): Project {
  const p = codeProject();
  let done = false;
  return {
    ...p,
    specializations: p.specializations.map((s) => {
      if (done || s.spec === null) return s;
      done = true;
      return { ...s, spec: { ...s.spec, tokens: { modes: [...modes], values: {} } } };
    }),
  };
}
