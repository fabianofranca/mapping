// CL2 (1.4 of the retest): the `fit_marking` of a segmented-button near the container edge gets
// only the width that is left (209 of 360, the marking at x = 151) and the equal tracks (70) are smaller
// than the selected one's "check + label". The label (`ellipsis`) shrinks inside the track instead of
// going past the neighboring segment, and the row does not report "content larger than the box".
// pt-BR kept: shared fixture data (sdui example fields/layers, Material 3 node names) asserted by other dirs
import { describe, expect, it } from 'vitest';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { drawFitted } from '../support/material3Fitted';

const VALUES = {
  options: ['A', 'Whole week', 'Mon'].map((label, i) => ({
    label,
    icon: '',
    selected: i === 1 ? 'true' : 'false',
  })),
};

function rows(width: number, mode: 'light' | 'dark') {
  const { drawing } = drawFitted('segmented-button', VALUES, mode, { width, height: 40 });
  const boxes = absoluteBoxes(drawing.root);
  const nodes = [...walk(drawing.root)];
  const texts = nodes.filter((n) => n.name === 'rótulo' && n.type === 'text');
  const cells = nodes.filter((n) => n.name === 'segmento');
  return {
    messages: drawing.messages.map((m) => m.text),
    rows: cells.map((cell, i) => ({
      cell: boxes.get(cell.id)!,
      text: boxes.get(texts[i]!.id)!,
    })),
  };
}

describe('segmented-button at a width smaller than the content (1.4 of the retest)', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`209 wide (${mode}): each label stays inside its track and there is no warning`, () => {
      const { rows: found, messages } = rows(209, mode);
      expect(found).toHaveLength(3);
      for (const { cell, text } of found) {
        expect(text.x).toBeGreaterThanOrEqual(cell.x - 0.5);
        expect(text.x + text.width).toBeLessThanOrEqual(cell.x + cell.width + 0.5);
      }
      expect(messages.filter((m) => m.includes('larger than the box'))).toEqual([]);
    });
  }
});
