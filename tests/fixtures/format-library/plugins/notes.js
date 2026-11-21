// Plugin of the format-library fixture (stage #1923, FP4): a tiny line format. One line per item
// (its `title`), then one indented `key=value` line per row of the `tags` table.
//
//   Alpha
//     color=red
//   Beta
//
// `generate` writes every annotation of the projection; `parse` creates the items in a container
// called "Notes" (created when the projection has none) and updates, by title, the ones that
// already exist.
function generate(input) {
  return (
    input.annotations
      .map(function (annotation) {
        const rows = (annotation.rows.tags || []).map(function (row) {
          return '  ' + row.values.key + '=' + row.values.value;
        });
        return [annotation.values.title || annotation.name || ''].concat(rows).join('\n');
      })
      .join('\n') + '\n'
  );
}

function parse(text, input) {
  const items = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (line.charAt(0) === ' ') {
      const cut = line.indexOf('=');
      items[items.length - 1].tags.push({
        key: line.slice(2, cut),
        value: line.slice(cut + 1),
      });
    } else {
      items.push({ title: line, tags: [] });
    }
  }
  const existing = {};
  input.annotations.forEach(function (annotation) {
    existing[annotation.values.title] = annotation;
  });
  const home = input.containers.filter(function (c) {
    return c.name === 'Notes';
  })[0];
  const operations = [];
  const target = home ? home.ref : '$notes';
  if (!home) {
    operations.push({
      op: 'add_container',
      as: '$notes',
      name: 'Notes',
      width: 400,
      height: 600,
      background: '#FFFFFF',
    });
  }
  const warnings = [];
  items.forEach(function (item, index) {
    const found = existing[item.title];
    if (found) {
      operations.push({
        op: 'update_annotation',
        annotation: found.ref,
        values: { tags: item.tags },
      });
    } else {
      operations.push({
        op: 'create_marking',
        container: target,
        rect: { x: 10, y: 10 + index * 60, width: 200, height: 50 },
        annotation: {
          type: 'format-lib/item',
          values: { title: item.title, tags: item.tags },
        },
      });
    }
  });
  if (items.length === 0) warnings.push('no items in the text');
  return { operations: operations, warnings: warnings };
}
