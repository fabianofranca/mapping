// Container density (schema v19): `containers[].density`, from 0.5 to 8; absent means 1.
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  addContainer,
  createMarking,
  deserialize,
  effectiveDensity,
  migrateFrom18To19,
  migrations,
  rectFromUnits,
  replaceContainer,
  serialize,
  setContainerDensity,
  snapScale,
  suggestDensity,
  validateProject,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

const v18Raw = (): Raw => {
  const raw = JSON.parse(
    serialize({ ...sampleProject(), schemaVersion: 19 } as never),
  ) as Raw;
  raw.schemaVersion = 18;
  return raw;
};

function open(raw: Raw): Project {
  const result = deserialize(JSON.stringify(raw), migrations);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

const first = (p: Project) => p.containers[0]!;

describe('schema v19 (density)', () => {
  it('the current version is at least 19 and the registry has the v18 → v19 migration', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(19);
    expect(migrations.get(18)).toBe(migrateFrom18To19);
  });

  it('the migration only bumps the number: a v18 mapping.json opens without density and is rewritten without the key', () => {
    const data = { project: { id: 'fixed' }, extra: 1 };
    expect(migrateFrom18To19(data)).toEqual(data);
    const result = deserialize(JSON.stringify(v18Raw()), migrations);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(18);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(first(result.project).density).toBeUndefined();
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect((saved.containers as Raw[]).every((c) => !('density' in c))).toBe(true);
  });

  it('density 3 round-trips and comes after background; null is the same as absent', () => {
    const raw = v18Raw();
    raw.schemaVersion = 19;
    const containers = raw.containers as Raw[];
    containers[0] = { ...containers[0], density: 3 };
    const project = open(raw);
    expect(first(project).density).toBe(3);
    const saved = JSON.parse(serialize(project)) as Raw;
    const keys = Object.keys((saved.containers as Raw[])[0]!);
    expect(keys.indexOf('density')).toBeGreaterThan(keys.indexOf('background'));
    expect((saved.containers as Raw[])[0]!.density).toBe(3);

    const withNull = setContainerDensity(project, first(project).id, null);
    const text = JSON.parse(serialize(withNull)) as Raw;
    expect('density' in (text.containers as Raw[])[0]!).toBe(false);
  });

  it('a density that is not a number fails to open', () => {
    const raw = v18Raw();
    raw.schemaVersion = 19;
    (raw.containers as Raw[])[0] = { ...(raw.containers as Raw[])[0], density: '3' };
    expect(deserialize(JSON.stringify(raw), migrations).ok).toBe(false);
  });
});

describe('effectiveDensity', () => {
  it("absent is 1; the canvas (null containerId) is 1; the container's value is itself", () => {
    const p = sampleProject();
    const id = first(p).id;
    expect(effectiveDensity(p, id)).toBe(1);
    expect(effectiveDensity(p, null)).toBe(1);
    expect(effectiveDensity(p, 'missing')).toBe(1);
    expect(effectiveDensity(setContainerDensity(p, id, 3), id)).toBe(3);
  });
});

describe('setContainerDensity', () => {
  it('accepts 0.5 to 8 and refuses outside it with container-density', () => {
    const p = sampleProject();
    const id = first(p).id;
    for (const ok of [0.5, 1.5, 2, 2.625, 8]) {
      expect(first(setContainerDensity(p, id, ok)).density).toBe(ok);
    }
    for (const bad of [0.49, 8.01, 12, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => setContainerDensity(p, id, bad)).toThrowError(/container-density/);
    }
  });

  it('null goes back to 1 (removes the key) and repeating the same value returns the same project', () => {
    const p = setContainerDensity(sampleProject(), first(sampleProject()).id, 3);
    const id = first(p).id;
    expect(setContainerDensity(p, id, 3)).toBe(p);
    const back = setContainerDensity(p, id, null);
    expect('density' in first(back)).toBe(false);
    expect(setContainerDensity(back, id, null)).toBe(back);
  });

  it('a missing container fails with not-found', () => {
    expect(() => setContainerDensity(sampleProject(), 'does-not-exist', 2)).toThrowError(
      /not-found/,
    );
  });
});

describe('container-density invariant', () => {
  it('density outside 0.5 to 8 (or not finite) is a violation; inside it is not', () => {
    const p = sampleProject();
    const bad = (density: number): Project => ({
      ...p,
      containers: p.containers.map((c, i) => (i === 0 ? { ...c, density } : c)),
    });
    expect(validateProject(bad(3)).map((v) => v.code)).not.toContain('container-density');
    for (const v of [0.4, 9, Number.NaN]) {
      expect(validateProject(bad(v)).map((x) => x.code)).toContain('container-density');
    }
  });
});

// Density suggestion (D2, decision 6): the container width ÷ the preset width is 1.5, 2, 3
// or 4 (2 px tolerance); the height only breaks ties; it only suggests, never applies.
const specOf = (
  id: string,
  containers: readonly { id: string; name: string; width: number; height: number }[],
): { id: string; spec: Spec } => ({
  id,
  spec: {
    format: 'mapping-spec',
    formatVersion: 6,
    id,
    name: id,
    version: 1,
    containers: [...containers],
    layers: [],
  },
});
const PHONE = { id: 'phone', name: 'Phone', width: 360, height: 800 };
const PHONE_LARGE = {
  id: 'phone-large',
  name: 'Large phone',
  width: 412,
  height: 915,
};
const material = specOf('m3', [PHONE, PHONE_LARGE]);

describe('suggestDensity', () => {
  it('1080 with the 360 preset gives 3 and returns the preset (name and size)', () => {
    const found = suggestDensity({ width: 1080, height: 2400 }, [material]);
    expect(found).toMatchObject({
      density: 3,
      specId: 'm3',
      preset: { id: 'phone', name: 'Phone', width: 360, height: 800 },
    });
  });

  it('1082 (2 px rounding tolerance) also gives 3; 1083 does not', () => {
    expect(suggestDensity({ width: 1082, height: 2400 }, [material])?.density).toBe(3);
    expect(suggestDensity({ width: 1078, height: 2400 }, [material])?.density).toBe(3);
    expect(suggestDensity({ width: 1083, height: 2400 }, [material])).toBeNull();
  });

  it('720 with 360 and 412 gives 2 via the 360; 540 gives 1.5 and 1440 gives 4', () => {
    expect(suggestDensity({ width: 720, height: 1600 }, [material])).toMatchObject({
      density: 2,
      preset: { id: 'phone' },
    });
    expect(suggestDensity({ width: 540, height: 1200 }, [material])?.density).toBe(1.5);
    expect(suggestDensity({ width: 1440, height: 3200 }, [material])?.density).toBe(4);
  });

  it('1000 with no multiple gives nothing; the same width as the preset (1x) too', () => {
    expect(suggestDensity({ width: 1000, height: 2000 }, [material])).toBeNull();
    expect(suggestDensity({ width: 360, height: 800 }, [material])).toBeNull();
  });

  it('with no specialization with containers (or no readable copy) gives nothing', () => {
    expect(suggestDensity({ width: 1080, height: 2400 }, [])).toBeNull();
    expect(
      suggestDensity({ width: 1080, height: 2400 }, [{ id: 'a', spec: null }]),
    ).toBeNull();
    expect(
      suggestDensity({ width: 1080, height: 2400 }, [specOf('empty', [])]),
    ).toBeNull();
  });

  it('the height breaks ties between presets of the same width; then, the order', () => {
    const a = specOf('a', [
      { id: 'short', name: 'Short', width: 360, height: 640 },
      { id: 'long', name: 'Long', width: 360, height: 800 },
    ]);
    // 2400 ÷ 3 = 800: "Long" has the closest height, even though it comes later.
    expect(suggestDensity({ width: 1080, height: 2400 }, [a])?.preset.id).toBe('long');
    // Same height for both: the first in the order of the applied specializations.
    const b = specOf('b', [{ id: 'other', name: 'Other', width: 360, height: 800 }]);
    expect(suggestDensity({ width: 1080, height: 2400 }, [b, material])?.specId).toBe(
      'b',
    );
  });

  it('with two factors within tolerance, the closest wins (tiny preset)', () => {
    const tiny = specOf('t', [{ id: 'x', name: 'X', width: 2, height: 5 }]);
    // 4 is 1 px from 1.5 × 2 = 3 and 0 px from 2 × 2 = 4: the factor is 2, not 1.5.
    expect(suggestDensity({ width: 4, height: 10 }, [tiny])?.density).toBe(2);
  });

  it('a capture tends to crop bars: the height does not prevent the suggestion', () => {
    expect(suggestDensity({ width: 1080, height: 2100 }, [material])?.density).toBe(3);
  });
});

// CL2 (#1715), findings 2, 3 and 4.
describe('CL2: suggestDensity considers 1x', () => {
  it('1080×1920 with the 1080×1920 preset (already 1x) suggests nothing', () => {
    const full = specOf('hd', [{ id: 'hd', name: 'HD', width: 1080, height: 1920 }]);
    expect(suggestDensity({ width: 1080, height: 1920 }, [full])).toBeNull();
  });

  it('with 1x and 3x within tolerance, the closest wins; 1x is not suggested', () => {
    const both = specOf('both', [
      { id: 'big', name: 'Big', width: 1080, height: 1920 },
      { id: 'small', name: 'Small', width: 360, height: 640 },
    ]);
    // The 1080×1920 preset explains the container (1x): nothing to apply, even though the 360 gives 3x.
    expect(suggestDensity({ width: 1080, height: 1920 }, [both])).toBeNull();
  });
});

describe('CL2: rectFromUnits rounds by the edges', () => {
  it("the child's right/bottom edge does not pass the slot's (density 2.625)", () => {
    const d = 2.625;
    const slotUnit = { x: 0, y: 0, width: 9.728, height: 9.728 };
    const childUnit = { x: 0.2, y: 0.2, width: 9.5276, height: 9.5276 };
    const orig = { x: 0, y: 0, width: 1, height: 1 };
    const slot = rectFromUnits(slotUnit, orig, d);
    const child = rectFromUnits(childUnit, orig, d);
    expect(child.x + child.width).toBeLessThanOrEqual(slot.x + slot.width);
    expect(child.y + child.height).toBeLessThanOrEqual(slot.y + slot.height);
    expect(child.width).toBeGreaterThanOrEqual(1);
  });
});

describe('CL2: density 1 is absent', () => {
  it('setContainerDensity(p, id, 1) does not write the key and, without a density, returns the same project', () => {
    const p = sampleProject();
    const id = first(p).id;
    expect(setContainerDensity(p, id, 1)).toBe(p);
    const three = setContainerDensity(p, id, 3);
    const back = setContainerDensity(three, id, 1);
    expect('density' in first(back)).toBe(false);
  });
});

describe('replaceContainer: the density follows the width (stage #1891, DL1)', () => {
  const phone = (density: number | null, width = 1080): Project => {
    let p = addContainer(emptyProject(), {
      id: 'P',
      file: 'images/phone.png',
      width,
      height: 2400,
    });
    if (density !== null) p = setContainerDensity(p, 'P', density);
    return createMarking(p, {
      id: 'B',
      containerId: 'P',
      rect: { x: 100, y: 200, width: 174, height: 120 },
    });
  };
  const next = (width: number, height = 2400) => ({
    file: 'images/new.png',
    width,
    height,
  });
  const densityOf = (p: Project) => p.containers.find((c) => c.id === 'P')?.density;
  /** The button's minimum in pixels at a density: 58 × 40 units. */
  const minSizeAt = (_id: string, density: number) => ({
    width: Math.ceil(58 * density - 1e-9),
    height: Math.ceil(40 * density - 1e-9),
  });

  it('1080 → 1440 with density 3 gives 4, and the button keeps 58 × 40 units', () => {
    const after = replaceContainer(phone(3), 'P', next(1440, 3200));
    expect(densityOf(after)).toBe(4);
    const rect = after.markings.find((m) => m.id === 'B')!.rect;
    expect(rect.width).toBe(232);
    expect(rect.height).toBe(160);
    expect(rect.width / 4).toBe(58);
    expect(rect.height / 4).toBe(40);
  });

  it('with no density, 1080 → 2160 stores 2', () => {
    expect(densityOf(replaceContainer(phone(null), 'P', next(2160, 4800)))).toBe(2);
  });

  it('1080 → 1000 with 3 gives snapScale(3 × 1000 ÷ 1080)', () => {
    const after = replaceContainer(phone(3), 'P', next(1000, 2222));
    expect(densityOf(after)).toBe(snapScale((3 * 1000) / 1080));
  });

  it('the same width does not change the density', () => {
    expect(densityOf(replaceContainer(phone(3), 'P', next(1080, 2400)))).toBe(3);
    const plain = replaceContainer(phone(null), 'P', next(1080, 2400));
    expect('density' in plain.containers.find((c) => c.id === 'P')!).toBe(false);
  });

  it('when the result is 1, the key goes away', () => {
    const after = replaceContainer(phone(2, 2160), 'P', next(1080, 1200));
    expect('density' in after.containers.find((c) => c.id === 'P')!).toBe(false);
  });

  it('the result is clamped to 0.5 and 8', () => {
    expect(densityOf(replaceContainer(phone(6), 'P', next(2160, 4800)))).toBe(8);
    expect(densityOf(replaceContainer(phone(0.75), 'P', next(540, 1200)))).toBe(0.5);
  });

  it('with a different aspect ratio (`confirmAspectChange`), the ratio of the widths applies', () => {
    const after = replaceContainer(phone(3), 'P', next(1440, 1440), {
      confirmAspectChange: true,
    });
    expect(densityOf(after)).toBe(4);
  });

  it('is still one valid project', () => {
    expect(validateProject(replaceContainer(phone(3), 'P', next(1440, 3200)))).toEqual(
      [],
    );
  });

  it('replacing back (1440 → 1080, density 4 → 3) does not grow the button at the minimum nor flag it', () => {
    const at4 = replaceContainer(phone(3), 'P', next(1440, 3200), { minSizeAt });
    expect(at4.markings.find((m) => m.id === 'B')!.rect).toMatchObject({
      width: 232,
      height: 160,
    });
    // `minSizeOf` is what the store passes: the minimum at the density from before the replacement (4).
    const back = replaceContainer(at4, 'P', next(1080, 2400), {
      minSizeOf: (id) => minSizeAt(id, 4),
      minSizeAt,
    });
    expect(densityOf(back)).toBe(3);
    const marking = back.markings.find((m) => m.id === 'B')!;
    expect(marking.rect.width).toBe(174);
    expect(marking.rect.height).toBe(120);
    expect(marking.needsReview).toBe(false);
  });

  it('without `minSizeAt`, the minimum of `minSizeOf` (today) applies', () => {
    const after = replaceContainer(phone(3), 'P', next(1440, 3200), {
      minSizeOf: () => ({ width: 300, height: 300 }),
    });
    const marking = after.markings.find((m) => m.id === 'B')!;
    expect(marking.rect.width).toBe(300);
    expect(marking.needsReview).toBe(true);
  });
});
