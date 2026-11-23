// slots.mjs: the R17.55 batch and the R17.57 and R17.58 calls (docs/TESTING.md, R17), as a calls file for
// the stdio client. Output goes to standard output.
//
//   node slots.mjs propose                > calls-55.json   (R17.55: one `propose_changes` in `screen-m3`)
//   node slots.mjs render <list.out>      > calls-57.json   (R17.57: 24 `render_marking`)
//   node slots.mjs a11y <list.out> [58a|58b] > calls-58.json (R17.58: the 4 `render_marking` of the a- run, or of the b- run)
//   node slots.mjs names <57 | 58a | 58b>                   (the step's file names, one per line, in call order)
//
// Each `render_marking` call carries `save`, the name `names` gives at its position, so the client writes the
// PNGs already named (no hand rename).
//
// `<list.out>` is the stdio client's output for `list_markings` of the **Slots** container.
//
// What `propose` creates: the **Slots** container (400 x 2400, blank, #FFFFFF) and, for the type k (in the
// order below) in a band of 400 px, a `<Type> bare` at (20, 400k + 20) and a `<Type> full` at (20, 400k + 200),
// each with an annotation of `material3-compose/<type>` and empty `values`. The children's offsets are (x, y)
// from the parent's top-left corner; each child's rect is the parent's (x, y) plus the offset.
//   k  type              size      children (size at offset)
//   0  bottom-app-bar    360 x 80  icon-button 48 x 48 at (+4, +16) and (+56, +16)
//   1  top-app-bar       360 x 64  icon-button 48 x 48 at (+4, +8), (+260, +8) and (+308, +8)
//   2  scaffold          360 x 240 top-app-bar 352 x 56 at (+4, +4); button 140 x 48 at (+110, +120);
//                                  fab 56 x 56 at (+288, +176)
//   3  switch            52 x 32   icon 24 x 24 at (+14, +4)
//   4  swipe-to-dismiss  360 x 72  list-item 344 x 56 at (+8, +8)
//   5  bottom-sheet      360 x 160 text 200 x 24 at (+16, +80)
import fs from 'node:fs';

const PROJECT = 'screen-m3';
const SPEC = 'material3-compose';
const BAND = 400;

const TYPES = [
  {
    id: 'bottom-app-bar',
    name: 'Bottom app bar',
    width: 360,
    height: 80,
    kids: [
      {
        id: 'icon-button',
        name: 'Bottom app bar icon 1',
        dx: 4,
        dy: 16,
        width: 48,
        height: 48,
      },
      {
        id: 'icon-button',
        name: 'Bottom app bar icon 2',
        dx: 56,
        dy: 16,
        width: 48,
        height: 48,
      },
    ],
  },
  {
    id: 'top-app-bar',
    name: 'Top app bar',
    width: 360,
    height: 64,
    kids: [
      {
        id: 'icon-button',
        name: 'Top app bar icon 1',
        dx: 4,
        dy: 8,
        width: 48,
        height: 48,
      },
      {
        id: 'icon-button',
        name: 'Top app bar icon 2',
        dx: 260,
        dy: 8,
        width: 48,
        height: 48,
      },
      {
        id: 'icon-button',
        name: 'Top app bar icon 3',
        dx: 308,
        dy: 8,
        width: 48,
        height: 48,
      },
    ],
  },
  {
    id: 'scaffold',
    name: 'Scaffold',
    width: 360,
    height: 240,
    kids: [
      {
        id: 'top-app-bar',
        name: 'Scaffold top app bar',
        dx: 4,
        dy: 4,
        width: 352,
        height: 56,
      },
      { id: 'button', name: 'Scaffold button', dx: 110, dy: 120, width: 140, height: 48 },
      { id: 'fab', name: 'Scaffold fab', dx: 288, dy: 176, width: 56, height: 56 },
    ],
  },
  {
    id: 'switch',
    name: 'Switch',
    width: 52,
    height: 32,
    kids: [{ id: 'icon', name: 'Switch icon', dx: 14, dy: 4, width: 24, height: 24 }],
  },
  {
    id: 'swipe-to-dismiss',
    name: 'Swipe to dismiss',
    width: 360,
    height: 72,
    kids: [
      {
        id: 'list-item',
        name: 'Swipe to dismiss item',
        dx: 8,
        dy: 8,
        width: 344,
        height: 56,
      },
    ],
  },
  {
    id: 'bottom-sheet',
    name: 'Bottom sheet',
    width: 360,
    height: 160,
    kids: [
      { id: 'text', name: 'Bottom sheet text', dx: 16, dy: 80, width: 200, height: 24 },
    ],
  },
];

const MODES = ['light', 'dark'];
const A11Y_TYPES = ['top-app-bar', 'bottom-app-bar'];

function fail(message) {
  console.error(`[slots] ${message}`);
  process.exit(1);
}

function propose() {
  const operations = [
    {
      op: 'add_container',
      as: '$slots',
      name: 'Slots',
      width: 400,
      height: BAND * TYPES.length,
      background: '#FFFFFF',
    },
  ];
  const marking = (as, name, type, x, y, width, height) => {
    operations.push({
      op: 'create_marking',
      as,
      container: '$slots',
      name,
      rect: { x, y, width, height },
    });
    operations.push({
      op: 'create_annotation',
      marking: as,
      type: `${SPEC}/${type}`,
      values: {},
    });
  };
  TYPES.forEach((t, k) => {
    const y = BAND * k;
    marking(`$${k}b`, `${t.name} bare`, t.id, 20, y + 20, t.width, t.height);
    marking(`$${k}f`, `${t.name} full`, t.id, 20, y + 200, t.width, t.height);
    t.kids.forEach((c, i) => {
      marking(`$${k}c${i}`, c.name, c.id, 20 + c.dx, y + 200 + c.dy, c.width, c.height);
    });
  });
  return [
    {
      name: 'propose_changes',
      args: { project: PROJECT, title: 'Slots M3', operations },
    },
  ];
}

/** The `markings` rows of every `=== list_markings` section of the stdio client's output. */
function readRows(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    fail(`cannot read ${file}`);
  }
  const rows = [];
  for (const section of text
    .split(/^=== /m)
    .filter((s) => s.startsWith('list_markings'))) {
    try {
      const items = JSON.parse(section.slice(section.indexOf('\n') + 1));
      for (const item of Array.isArray(items) ? items : [items]) {
        const body = typeof item === 'string' ? JSON.parse(item) : item;
        rows.push(...(body.markings ?? []));
      }
    } catch {
      fail(`${file}: a list_markings section is not the stdio client's JSON`);
    }
  }
  if (rows.length === 0) fail(`${file}: no list_markings output found`);
  return rows;
}

const render = (ref, drawingMode, save) => ({
  name: 'render_marking',
  args: { project: PROJECT, ref, zoom: 1, padding: 16, background: 'none', drawingMode },
  save,
});

function refOf(rows, name) {
  const row = rows.find((r) => r.name === name);
  if (!row) fail(`marking not found in the list: ${name}`);
  return row.ref;
}

/** The (type, variant) pairs of R17.57 in call order; the light and the dark call of each. */
const pairs57 = () => TYPES.flatMap((t) => ['bare', 'full'].map((v) => ({ t, v })));

function names(step) {
  if (step === '57')
    return pairs57().flatMap(({ t, v }) => MODES.map((m) => `${t.id}-${v}-${m}.png`));
  if (step === '58a' || step === '58b')
    return A11Y_TYPES.flatMap((t) =>
      MODES.map((m) => `${step === '58a' ? 'a' : 'b'}-${t}-${m}.png`),
    );
  return fail('names takes 57, 58a or 58b');
}

const [command, arg, variant = '58a'] = process.argv.slice(2);
if (command === 'propose') {
  console.log(JSON.stringify(propose(), null, 2));
} else if (command === 'render' || command === 'a11y') {
  if (!arg) fail(`${command} takes the list_markings output file`);
  const rows = readRows(arg);
  const wanted =
    command === 'render'
      ? pairs57().map(({ t, v }) => `${t.name} ${v}`)
      : A11Y_TYPES.map((id) => `${TYPES.find((t) => t.id === id).name} bare`);
  if (command === 'a11y' && variant !== '58a' && variant !== '58b')
    fail('a11y takes 58a or 58b as its second argument');
  const saves = names(command === 'render' ? '57' : variant);
  const calls = wanted.flatMap((name, i) => {
    const ref = refOf(rows, name);
    return MODES.map((mode, m) => render(ref, mode, saves[i * MODES.length + m]));
  });
  console.log(JSON.stringify(calls, null, 2));
} else if (command === 'names') {
  console.log(names(arg).join('\n'));
} else {
  fail(
    'usage: node slots.mjs propose | render <list.out> | a11y <list.out> [58a|58b] | names <57|58a|58b>',
  );
}
