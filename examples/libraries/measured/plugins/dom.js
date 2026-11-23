// Measured-page plugin of the `measured` package (stage #2035, AF7). A classic script (no
// import/export); `parse` is the contract-1 entry point (docs/PLUGIN-FORMAT.md). The format only
// reads: it has no `generate`.
//
// The file is the measured tree of a page (JSON), either bare or wrapped:
//   { type, id?, classes?, rect: { x, y, width, height }, props?, children? }
//   { tree: <the bare tree>, scale?: number, offset?: { x, y } }
//
// Each node is matched against the `sources` of the types of `input.specialization` (system `dom`):
// the node's `id` against the source's `id`, then each class against its `name`, and finally the
// node's `type` against its `name`. Each field is read from the node's `props` by its source's
// `path`, with `values` translating an `enum`. The rectangles are multiplied by `scale` and moved by
// `offset`. Ownership never comes from the tree: the markings go in pre-order and the geometry
// decides who contains whom. A node with no type, or with an empty rectangle, becomes a warning and
// its children carry on.
//
// With a target container the markings are created in it; without one the plugin creates a
// background-only container as large as the root.

var SYSTEM = 'dom';
var BACKGROUND = '#FFFFFF';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

function sourceOf(sources, system) {
  return (sources || []).filter(function (s) {
    return s.system === system;
  })[0];
}

// ----- the specialization -----

/** `{ byId, byName }`: the first type that declares the node id / name in `sources`. */
function typeIndex(specialization) {
  var byId = {};
  var byName = {};
  ((specialization && specialization.layers) || []).forEach(function (layer) {
    (layer.annotationTypes || []).forEach(function (type) {
      (type.sources || []).forEach(function (source) {
        if (source.system !== SYSTEM) return;
        if (
          source.id !== undefined &&
          !Object.prototype.hasOwnProperty.call(byId, source.id)
        ) {
          byId[source.id] = type;
        }
        if (
          source.name !== undefined &&
          !Object.prototype.hasOwnProperty.call(byName, source.name)
        ) {
          byName[source.name] = type;
        }
      });
    });
  });
  return { byId: byId, byName: byName };
}

function lookup(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

function findType(index, node) {
  var fromId = typeof node.id === 'string' ? lookup(index.byId, node.id) : undefined;
  if (fromId) return fromId;
  var classes = Array.isArray(node.classes) ? node.classes : [];
  for (var i = 0; i < classes.length; i++) {
    var fromClass =
      typeof classes[i] === 'string' ? lookup(index.byName, classes[i]) : undefined;
    if (fromClass) return fromClass;
  }
  return typeof node.type === 'string' ? lookup(index.byName, node.type) : undefined;
}

// ----- the values -----

/** `a.b[0].c` → ['a', 'b', 0, 'c'], or null for a path that cannot be read (`[*]`, empty). */
function segmentsOf(path) {
  var segments = [];
  var parts = String(path).split('.');
  for (var i = 0; i < parts.length; i++) {
    var match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(parts[i]);
    if (!match || (match[1] === '' && match[2] === '')) return null;
    if (match[1] !== '') segments.push(match[1]);
    var indexes = match[2].match(/\d+/g) || [];
    for (var j = 0; j < indexes.length; j++) segments.push(Number(indexes[j]));
  }
  return segments;
}

/** The value at `path` in `root`, or undefined when it is missing, null or the path is invalid. */
function readPath(root, path) {
  var segments = segmentsOf(path);
  if (segments === null) return undefined;
  var current = root;
  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i];
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return undefined;
    } else if (
      !isObject(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = current[segment];
  }
  return current === null ? undefined : current;
}

function isScalar(value) {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

/** The value of one field from the node's props, or undefined when the node does not bring it. */
function fieldValue(field, props, where, warnings) {
  var source = sourceOf(field.sources, SYSTEM);
  if (!source || source.path === undefined) return undefined;
  var raw = readPath(props, source.path);
  if (raw === undefined) return undefined;
  var at = where + '.props.' + source.path;
  if (!isScalar(raw)) {
    warnings.push(at + ': the value is not a text, number or boolean and was left out');
    return null;
  }
  var table = source.values;
  var key = String(raw);
  var value = raw;
  if (table && Object.prototype.hasOwnProperty.call(table, key)) {
    value = table[key];
  } else if (typeof raw === 'number' && field.type !== 'number') {
    value = key;
  } else if (typeof raw === 'boolean') {
    value = key;
  }
  if (
    field.type === 'enum' &&
    field.options &&
    field.options.indexOf(String(value)) < 0
  ) {
    warnings.push(
      at + ': "' + String(value) + '" is not an option of "' + field.key + '"',
    );
  }
  return value;
}

function valuesOf(type, props, where, warnings) {
  var values = {};
  (type.fields || []).forEach(function (field) {
    if (field.type === 'table' || field.type === 'ref') return;
    var value = fieldValue(field, props, where, warnings);
    if (value !== undefined) values[field.key] = value;
  });
  return values;
}

// ----- the tree -----

function scaledRect(raw, scale, offset) {
  if (!isObject(raw)) return null;
  if (![raw.x, raw.y, raw.width, raw.height].every(isNumber)) return null;
  return {
    x: Math.round(raw.x * scale + offset.x),
    y: Math.round(raw.y * scale + offset.y),
    width: Math.round(raw.width * scale),
    height: Math.round(raw.height * scale),
  };
}

function describe(node) {
  var parts = [];
  if (typeof node.type === 'string') parts.push(node.type);
  if (typeof node.id === 'string') parts.push('#' + node.id);
  (Array.isArray(node.classes) ? node.classes : []).forEach(function (c) {
    if (typeof c === 'string') parts.push('.' + c);
  });
  return parts.join(' ');
}

function place(node, rect, where, state) {
  var type = findType(state.index, node);
  if (!type) {
    var label = describe(node);
    state.warnings.push(
      where +
        ': no type matches the node' +
        (label ? ' (' + label + ')' : '') +
        ' and it was skipped',
    );
    return;
  }
  if (rect.width < 1 || rect.height < 1) {
    state.warnings.push(
      where +
        ': the rectangle is empty (' +
        rect.width +
        ' x ' +
        rect.height +
        ') and it was skipped',
    );
    return;
  }
  var props = isObject(node.props) ? node.props : {};
  state.operations.push({
    op: 'create_marking',
    container: state.container,
    rect: rect,
    annotation: {
      type: state.specId + '/' + type.id,
      values: valuesOf(type, props, where, state.warnings),
    },
  });
}

function visit(node, where, state) {
  if (!isObject(node)) {
    state.warnings.push(where + ': the node is not an object and was skipped');
    return;
  }
  var rect = scaledRect(node.rect, state.scale, state.offset);
  if (rect === null) {
    state.warnings.push(where + '.rect: expected { x, y, width, height } with numbers');
  } else {
    place(node, rect, where, state);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(function (child, i) {
      visit(child, where + '.children[' + i + ']', state);
    });
  } else if (node.children !== undefined && node.children !== null) {
    state.warnings.push(where + '.children: expected a list');
  }
}

/** The file: a bare tree or `{ tree, scale?, offset? }`. */
function readFile(text) {
  var data = JSON.parse(text);
  if (!isObject(data))
    throw new Error('the measured tree must be an object (the root node)');
  var wrapped = isObject(data.tree) && data.rect === undefined;
  var tree = wrapped ? data.tree : data;
  if (!isObject(tree.rect)) {
    throw new Error('the root node has no rect: expected { x, y, width, height }');
  }
  var scale = wrapped && data.scale !== undefined ? data.scale : 1;
  if (!isNumber(scale) || scale <= 0)
    throw new Error('scale must be a number above zero');
  var offset = { x: 0, y: 0 };
  if (wrapped && data.offset !== undefined) {
    if (!isObject(data.offset) || !isNumber(data.offset.x) || !isNumber(data.offset.y)) {
      throw new Error('offset must be { x, y } with numbers');
    }
    offset = { x: data.offset.x, y: data.offset.y };
  }
  return { tree: tree, scale: scale, offset: offset };
}

function parse(text, input) {
  var file = readFile(text);
  var operations = [];
  var container = input.target ? input.target.container : '$page';
  if (!input.target) {
    var root = scaledRect(file.tree.rect, file.scale, file.offset);
    if (root === null)
      throw new Error('the root rect needs numbers: { x, y, width, height }');
    operations.push({
      op: 'add_container',
      as: container,
      name:
        typeof file.tree.id === 'string' && file.tree.id ? file.tree.id : 'Measured page',
      width: Math.max(1, root.x + root.width),
      height: Math.max(1, root.y + root.height),
      background: BACKGROUND,
    });
  }
  var state = {
    specId: input.format.specId,
    index: typeIndex(input.specialization),
    scale: file.scale,
    offset: file.offset,
    container: container,
    operations: operations,
    warnings: [],
  };
  visit(file.tree, 'root', state);
  return { operations: operations, warnings: state.warnings };
}
