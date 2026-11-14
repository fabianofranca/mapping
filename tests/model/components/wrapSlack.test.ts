// The single 0.5 px slack before breaking the line (FX4, decision 20 of #896).
import { describe, expect, it } from 'vitest';
import { WRAP_SLACK } from '../../../src/model/components/textWrap';
import { measureLines } from '../../../src/model/components/instantiate';
import { breakLines } from '../../../mcp/image/textBars';
import { baseNode, type TextNode } from '../../../src/model/components/scene';

const font = {
  family: 'x',
  size: 10,
  weight: 400,
  italic: false,
  lineHeight: 12,
  letterSpacing: 0,
};
// "aa bb" measures 50 px (10 per character, the space counts).
const widthOf = (text: string): number => text.length * 10;

describe('break slack', () => {
  it('the constant is 0.5 px', () => {
    expect(WRAP_SLACK).toBe(0.5);
  });

  it('the measurer does not break a line that overflows by less than the slack', () => {
    expect(measureLines('aa bb', font, 49.6, widthOf).lines).toEqual(['aa bb']);
    expect(measureLines('aa bb', font, 49.4, widthOf).lines).toEqual(['aa', 'bb']);
  });

  it('the ellipsis also only cuts beyond the slack', () => {
    const e = { ...font, wrap: 'none' as const, ellipsis: true };
    expect(measureLines('aaaaa', e, 49.6, widthOf).lines).toEqual(['aaaaa']);
    expect(measureLines('aaaaa', e, 49.4, widthOf).lines).not.toEqual(['aaaaa']);
  });

  it('the server bar drawing breaks at the same point', () => {
    const node = (width: number): TextNode => ({
      ...baseNode({ id: 't', name: 't', width, height: 20 }),
      type: 'text',
      text: 'aa bb',
      style: {
        fontFamily: 'x',
        fontSize: 10,
        fontWeight: 400,
        italic: false,
        align: 'left',
        verticalAlign: 'top',
      },
    });
    expect(breakLines(node(49.6), widthOf)).toEqual(['aa bb']);
    expect(breakLines(node(49.4), widthOf)).toEqual(['aa', 'bb']);
  });
});
