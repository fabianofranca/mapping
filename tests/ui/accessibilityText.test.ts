import { afterEach, describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  type AuditFinding,
  type Project,
  type TouchTargetOverlapFinding,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { auditFindingText } from '../../src/ui/accessibilityText';
import { auditWarning } from '../../mcp/auditViews';
import { Refs } from '../../mcp/items';
import { emptyProject } from '../model/fixtures';

/** A project with the marking `M2` named "Icon B" (the other side of an overlap). */
const named = (): Project => {
  let p = addContainer(emptyProject(), {
    id: 'I1',
    file: 'a.png',
    width: 500,
    height: 500,
  });
  p = createMarking(p, {
    id: 'M2',
    containerId: 'I1',
    rect: { x: 0, y: 0, width: 40, height: 40 },
    name: 'Icon B',
  });
  return p;
};

// Phase A6 (R4): the app and the MCP round an actual size down, so a size just under the minimum never reads as
// meeting it (43.96 is 43.9, not 44).

const finding = (size: number): AuditFinding => ({
  code: 'touch-target-small',
  annotationId: 'A1',
  markingId: 'M1',
  actual: { width: size, height: size },
  min: { width: 44, height: 44 },
  minPx: { width: 44, height: 44 },
  density: 1,
});

const mcpMessage = (size: number): string =>
  auditWarning({ ref: (_k: string, id: string) => id } as unknown as Refs, finding(size))
    .message as string;

describe('the actual size in the app text and in the MCP message', () => {
  it.each([
    [43.96, '43.9 × 43.9; minimum 44 × 44 units (44 × 44 px at 1x)'],
    [44, '44 × 44; minimum 44 × 44 units (44 × 44 px at 1x)'],
    [44.04, '44 × 44; minimum 44 × 44 units (44 × 44 px at 1x)'],
  ])('%s reads the same in both', (size, text) => {
    expect(auditFindingText(named(), finding(size))).toBe(text);
    expect(mcpMessage(size)).toBe(text);
  });
});

const overlap = (): TouchTargetOverlapFinding => ({
  code: 'touch-target-overlap',
  annotationId: 'A1',
  markingId: 'M1',
  other: { annotationId: 'A2', markingId: 'M2' },
  overlap: { width: 4, height: 48 },
  overlapPx: { width: 4, height: 48 },
  density: 1,
});

describe('touch-target-overlap text (stage #1998, decision 7)', () => {
  afterEach(() => {
    locale.value = 'en-US';
  });

  it('en-US: names the other marking, the units and the pixels at the density', () => {
    locale.value = 'en-US';
    expect(auditFindingText(named(), overlap())).toBe(
      'Touch area overlaps Icon B by 4 × 48 units (4 × 48 px at 1x)',
    );
  });

  it('pt-BR: the same numbers in Portuguese', () => {
    locale.value = 'pt-BR';
    // portuguese-guard:begin the object of the test is the pt-BR text of the finding
    expect(auditFindingText(named(), overlap())).toBe(
      'Área de toque sobrepõe Icon B em 4 × 48 unidades (4 × 48 px a 1x)',
    );
    // portuguese-guard:end
  });

  it('density 3: the units have one decimal and the pixels none', () => {
    locale.value = 'en-US';
    const f: TouchTargetOverlapFinding = {
      ...overlap(),
      overlap: { width: 11.5, height: 48 },
      overlapPx: { width: 35, height: 144 },
      density: 3,
    };
    expect(auditFindingText(named(), f)).toBe(
      'Touch area overlaps Icon B by 11.5 × 48 units (35 × 144 px at 3x)',
    );
  });

  it('the app text and the MCP message say the same', () => {
    locale.value = 'en-US';
    const refs = {
      ref: (_k: string, id: string) => id,
      markingName: () => 'Icon B',
    } as unknown as Refs;
    expect(auditWarning(refs, overlap()).message).toBe(
      'overlaps the touch area of Icon B by 4 × 48 units (4 × 48 px at 1x)',
    );
  });
});
