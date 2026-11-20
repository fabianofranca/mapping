// hug-fill.mjs: node hug-fill.mjs <library folder> [two]
// Replaces the `chip` of a copy of `m3-tokens` with a format 4 menu item (R25: `fill` inside `hug`):
// a `hug` root with `minWidth` 96 and `maxWidth` 136, a fixed 24 x 24 icon and a `fill` label
// (14 px, one line, with ellipsis). The `label` field is the chip's.
//
// What it draws, with the MCP's measurer (the app's real fonts differ by a few px). The width is the
// padding (24), the icon (24), the gap (8) and the label, between 96 and 136; the height is 40:
//   label `Ok`           -> 96  (the minimum)
//   label `Settings`     -> 107 (its content)
//   label of 40 letters  -> 136 (the maximum; the text is cut with an ellipsis)
// With `two`, a second `fill` label (the `leadingIconDescription` field) goes after the first and the row
// gets one more gap (8). The frame measures the smallest width at which the equal split gives each label
// its content, never below 96 nor above 136:
//   `Ok` and `Ok`        -> 100
//   `Open` and `Edit`    -> 133 (the longer one sets both; `Open` and `Ok` gives the same)
//   `Settings` and `Ok`  -> 136 (the cap)
import fs from 'node:fs';

const two = process.argv[3] === 'two';
const file = process.argv[2] + '/components/chip.json';

const label = (key) => ({
  type: 'text',
  name: key,
  text: { $field: key, default: '' },
  width: 'fill',
  height: 'hug',
  font: { size: 14, lineHeight: 20, wrap: 'none', ellipsis: true },
});

const chip = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'chip',
  name: 'Chip',
  size: { width: 104, height: 40 },
  minSize: { width: 96, height: 40 },
  sizing: { width: 'hug' },
  template: {
    type: 'frame',
    fill: '#EEEEEE',
    minWidth: 96,
    maxWidth: 136,
    layout: { type: 'row', align: 'center', gap: 8, padding: [8, 12] },
    children: [
      { type: 'rect', name: 'icon', width: 24, height: 24, fill: '#6750A4' },
      label('label'),
      ...(two ? [label('leadingIconDescription')] : []),
    ],
  },
};
fs.writeFileSync(file, JSON.stringify(chip, null, 2));
