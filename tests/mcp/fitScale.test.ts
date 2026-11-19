import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProject,
  serialize,
  addContainer,
  applySpecialization,
} from '../../src/model';
import {
  FIT_COMPONENTS,
  FIT_SPEC_ID,
  FIT_SPEC_JSON,
  fitSpec,
} from '../model/fitFixtures';
import { NOW } from '../model/fixtures';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// FM2 (decision 11 of #2089): a `hug` component drawn at scale 0.96 (`fit-scaled`) is fitted by `fit_marking`
// and born at the measured size without a `component-overflow` caused by the fit.

const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-fit-scale-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs', 'fit', 'components'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', 'fit', 'fit.spec.json'),
    JSON.stringify(FIT_SPEC_JSON),
  );
  for (const [id, component] of Object.entries(FIT_COMPONENTS)) {
    writeFileSync(
      join(dir, 'specs', 'fit', 'components', `${id}.json`),
      JSON.stringify(component),
    );
  }
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/foto.png', width: 600, height: 400 });
  p = applySpecialization(p, fitSpec(), { packageSpecName: 'fit.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp.close();
  rmSync(base, { recursive: true, force: true });
});

interface Plan {
  valid: boolean;
  errors?: unknown[];
  issues?: { new?: { issues: { code: string }[] }[] };
}

const overflows = (plan: Plan): string[] =>
  (plan.issues?.new ?? []).flatMap((e) =>
    e.issues.filter((i) => i.code === 'component-overflow').map((i) => i.code),
  );

describe('plan_changes: fit-scaled never comes out short', () => {
  for (const label of ['Ok', 'Confirm', 'Save and continue', 'Wwwwwwwwwwiiiiiiii']) {
    it(`create_marking with rect + fit_marking, label "${label}"`, async () => {
      const plan = ok(
        await mcp.call<Plan>('plan_changes', {
          project: 'telas',
          operations: [
            {
              op: 'create_marking',
              as: '$b',
              container: IMAGE,
              rect: { x: 20, y: 20, width: 120, height: 40 },
              annotation: { type: `${FIT_SPEC_ID}/fit-scaled`, values: { label } },
            },
            { op: 'fit_marking', marking: '$b' },
          ],
        }),
      );
      expect(plan.errors).toBeUndefined();
      expect(plan.valid).toBe(true);
      expect(overflows(plan)).toEqual([]);
    });

    it(`create_marking without rect (born at the measured size), label "${label}"`, async () => {
      const plan = ok(
        await mcp.call<Plan>('plan_changes', {
          project: 'telas',
          operations: [
            {
              op: 'create_marking',
              as: '$b',
              container: IMAGE,
              annotation: { type: `${FIT_SPEC_ID}/fit-scaled`, values: { label } },
            },
          ],
        }),
      );
      expect(plan.valid).toBe(true);
      expect(overflows(plan)).toEqual([]);
    });
  }
});
