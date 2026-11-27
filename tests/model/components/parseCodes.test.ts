// Parser errors of rich text and text fit carry their own message code (code-review follow-up):
// none of them may fall to another catalog pattern (`componentCodeForText`).
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { parseComponent } from '../../../src/model/components/parseComponent';

function component(node: Record<string, unknown>): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [node] },
  };
}

const issuesOf = (node: Record<string, unknown>) => {
  const parsed = parseComponent(component(node));
  return parsed.ok ? [] : parsed.issues;
};

const text = (font: unknown) => ({ type: 'text', text: 'x', font });

describe('parser errors of runs and fit have their own code', () => {
  it('a bad baselineShift is not the format version message', () => {
    const [issue] = issuesOf({
      type: 'text',
      runs: [{ text: 'a', baselineShift: 'x' }],
    });
    expect(issue?.code).toBe('component.baselineShiftInvalid');
    expect(issue?.params).toBeUndefined();
  });

  it('a runs table inside a repeat', () => {
    const issues = issuesOf({
      type: 'repeat',
      field: 'rows',
      template: {
        type: 'frame',
        children: [{ type: 'text', runs: [{ field: 'x', template: { text: 'a' } }] }],
      },
    });
    expect(issues.map((i) => i.code)).toContain('component.runsTableInRepeat');
  });

  it('fit "shrink" without fitSizes', () => {
    expect(issuesOf(text({ size: 20, fit: 'shrink' })).map((i) => i.code)).toEqual([
      'component.fitSizesRequired',
    ]);
  });

  it('fitSizes with a wrong count', () => {
    const [issue] = issuesOf(text({ size: 20, fitSizes: [] }));
    expect(issue?.code).toBe('component.fitSizesCount');
    expect(issue?.params).toEqual({ max: '8' });
  });

  it('fitSizes that rise', () => {
    expect(issuesOf(text({ size: 20, fitSizes: [10, 12] })).map((i) => i.code)).toEqual([
      'component.fitSizesOrder',
    ]);
  });

  it('a first fitSizes item not smaller than a literal font.size', () => {
    for (const first of [20, 24]) {
      const [issue] = issuesOf(text({ size: 20, fitSizes: [first, 10] }));
      expect(issue?.code, String(first)).toBe('component.fitSizesAboveSize');
      expect(issue?.params).toEqual({ size: '20' });
    }
    expect(issuesOf(text({ size: 20, fitSizes: [19, 10] }))).toEqual([]);
    expect(issuesOf(text({ size: { $field: 's' }, fitSizes: [30] }))).toEqual([]);
  });

  it('fit "shrink" together with runs', () => {
    const issues = issuesOf({
      type: 'text',
      runs: [{ text: 'a' }],
      font: { size: 20, fit: 'shrink', fitSizes: [10] },
    });
    expect(issues.map((i) => i.code)).toEqual(['component.fitWithRuns']);
  });
});
