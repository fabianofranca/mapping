import { describe, expect, it } from 'vitest';
import type { AuditFinding } from '../../src/model';
import { auditFindingText } from '../../src/ui/accessibilityText';
import { auditWarning } from '../../mcp/auditViews';
import { Refs } from '../../mcp/items';

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
    expect(auditFindingText(finding(size))).toBe(text);
    expect(mcpMessage(size)).toBe(text);
  });
});
