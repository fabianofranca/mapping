// SDUI plugin of the `sdui-backend` package (stage #1923, FP6). A classic script (no import/export);
// `generate` and `parse` are the contract-1 entry points (docs/PLUGIN-FORMAT.md).
//
// Scope `container`: one container is one SDUI screen. The JSON is the fictional backend's:
//   { version, screen: { id, title, background, device: { width, height } },
//     content, bottomBar?, floating?: [{ type, anchor, margin, props }], modal? }
// and every node is `{ type, props, children }`. The types and their props come from the `sources`
// of `input.specialization` (system `sdui`), so the plugin follows the specialization.
//
// Where things sit in the container (the plugin computes the `rect` of the roots; the children of a
// Column go into its slot, with no `rect`):
//   content    the root at the top, as wide as the screen and as tall as what the bottom bar leaves;
//   bottomBar  a root that ends at the bottom of the container (a fixed height);
//   floating   the FABs, placed by `anchor` and `margin` inside the content area;
//   modal      the Bottom sheet. It is left out on reading (with a warning): no modal and no scrim.

var SYSTEM = 'sdui';
var SPEC_ID = 'sdui-backend';
var BAR_HEIGHT = 72;
var FLOATING_TYPE = 'sdui-fab';
var SHEET_TYPE = 'sdui-sheet';
var SCRIM_TYPE = 'sdui-scrim';
var SIZES = { 'sdui-fab': { width: 56, height: 56 } };
var BACKGROUNDS = { surface: '#FEF7FF' };
var DEFAULT_BACKGROUND = '#FFFFFF';
var ANCHORS = [
  'top-start',
  'top',
  'top-end',
  'start',
  'center',
  'end',
  'bottom-start',
  'bottom',
  'bottom-end',
];

// ----- the specialization -----

/** `{ byType: type id → { id, sduiType, fields, ignore }, bySdui: SDUI type → type id }`. */
function typeTable(input) {
  var byType = {};
  var bySdui = {};
  ((input.specialization && input.specialization.layers) || []).forEach(function (layer) {
    (layer.annotationTypes || []).forEach(function (type) {
      var source = (type.sources || []).filter(function (s) {
        return s.system === SYSTEM;
      })[0];
      if (!source) return;
      var fields = [];
      (type.fields || []).forEach(function (field) {
        var fieldSource = (field.sources || []).filter(function (s) {
          return s.system === SYSTEM && s.path;
        })[0];
        if (fieldSource) {
          fields.push({
            key: field.key,
            path: fieldSource.path,
            type: field.type,
            options: field.options || null,
          });
        }
      });
      byType[type.id] = {
        id: type.id,
        sduiType: source.name,
        fields: fields,
        ignore: source.ignore || [],
      };
      bySdui[source.name] = type.id;
    });
  });
  return { byType: byType, bySdui: bySdui };
}

function isBoolean(field) {
  return (
    field.options !== null &&
    field.options.length === 2 &&
    field.options.indexOf('yes') >= 0 &&
    field.options.indexOf('no') >= 0
  );
}

// ----- generate -----

function propsOf(annotation, entry) {
  var props = {};
  entry.fields.forEach(function (field) {
    var value = annotation.values[field.key];
    if (value === undefined || value === null || value === '') return;
    props[field.path] = isBoolean(field) ? value === 'yes' : value;
  });
  return props;
}

function nodeOf(marking, ctx) {
  var annotation = ctx.annotationOf[marking.ref];
  var entry = ctx.table.byType[annotation.type];
  var node = { type: entry.sduiType };
  var props = propsOf(annotation, entry);
  if (Object.keys(props).length > 0) node.props = props;
  var children = (ctx.childrenOf[marking.ref] || []).map(function (child) {
    return nodeOf(child, ctx);
  });
  if (children.length > 0) node.children = children;
  return node;
}

function anchorOf(rect, area, margin) {
  var left = rect.x - area.x;
  var right = area.x + area.width - (rect.x + rect.width);
  var top = rect.y - area.y;
  var bottom = area.y + area.height - (rect.y + rect.height);
  var column = Math.abs(left - margin) <= Math.abs(right - margin) ? 'start' : 'end';
  if (Math.abs(left - right) <= 1) column = 'center';
  var row = Math.abs(top - margin) <= Math.abs(bottom - margin) ? 'top' : 'bottom';
  if (Math.abs(top - bottom) <= 1) row = 'center';
  if (row === 'center' && column === 'center') return 'center';
  if (row === 'center') return column;
  if (column === 'center') return row;
  return row + '-' + column;
}

function marginOf(rect, area, anchor) {
  var gaps = [];
  if (anchor.indexOf('start') >= 0) gaps.push(rect.x - area.x);
  if (anchor.indexOf('end') >= 0) gaps.push(area.x + area.width - (rect.x + rect.width));
  if (anchor.indexOf('top') === 0) gaps.push(rect.y - area.y);
  if (anchor.indexOf('bottom') === 0)
    gaps.push(area.y + area.height - (rect.y + rect.height));
  return gaps.length > 0 ? Math.min.apply(null, gaps) : 0;
}

function slug(text) {
  return String(text || 'screen')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generate(input) {
  var table = typeTable(input);
  var target = input.target ? input.target.container : null;
  var container = input.containers.filter(function (c) {
    return c.ref === target;
  })[0];
  if (!container) throw new Error('the container to export is missing from the input');

  var ctx = { table: table, annotationOf: {}, childrenOf: {} };
  input.annotations.forEach(function (annotation) {
    if (table.byType[annotation.type]) ctx.annotationOf[annotation.host] = annotation;
  });
  var markings = input.markings.filter(function (m) {
    return m.container === container.ref && ctx.annotationOf[m.ref];
  });
  var roots = [];
  var floating = [];
  var modal = null;
  markings.forEach(function (m) {
    var type = ctx.annotationOf[m.ref].type;
    if (type === FLOATING_TYPE) floating.push(m);
    else if (type === SHEET_TYPE) modal = m;
    else if (type === SCRIM_TYPE) return;
    else if (m.parent === null) roots.push(m);
    else (ctx.childrenOf[m.parent] = ctx.childrenOf[m.parent] || []).push(m);
  });

  var bar = null;
  var content = null;
  roots.forEach(function (m) {
    var atBottom = m.rect.y > 0 && m.rect.y + m.rect.height === container.height;
    if (atBottom && !bar) bar = m;
    else if (!content) content = m;
  });
  var contentArea = {
    x: 0,
    y: 0,
    width: container.width,
    height: bar ? bar.rect.y : container.height,
  };

  var json = {
    version: '1.0',
    screen: {
      id: (container.source && container.source.id) || slug(container.name),
      title: container.name || 'Screen',
      background: backgroundName(container.background),
      device: { width: container.width, height: container.height },
    },
  };
  if (content) json.content = nodeOf(content, ctx);
  if (bar) json.bottomBar = nodeOf(bar, ctx);
  if (floating.length > 0) {
    json.floating = floating.map(function (m) {
      var node = nodeOf(m, ctx);
      var anchor = anchorOf(m.rect, contentArea, 0);
      var out = {
        type: node.type,
        anchor: anchor,
        margin: marginOf(m.rect, contentArea, anchor),
      };
      if (node.props) out.props = node.props;
      return out;
    });
  }
  if (modal) json.modal = nodeOf(modal, ctx);
  return JSON.stringify(json, null, 2) + '\n';
}

function backgroundName(background) {
  if (!background) return 'surface';
  var hex = String(background).toUpperCase();
  var found = Object.keys(BACKGROUNDS).filter(function (name) {
    return BACKGROUNDS[name] === hex;
  })[0];
  return found || hex;
}

// ----- parse -----

function valuesOf(props, entry, warnings, where) {
  var values = {};
  Object.keys(props || {}).forEach(function (path) {
    var field = entry.fields.filter(function (f) {
      return f.path === path;
    })[0];
    if (!field) {
      if (entry.ignore.indexOf(path) < 0) {
        warnings.push(where + ': the prop "' + path + '" has no field and was left out');
      }
      return;
    }
    var value = props[path];
    if (isBoolean(field)) value = value === true ? 'yes' : value === false ? 'no' : value;
    if (field.options && field.options.indexOf(value) < 0) {
      warnings.push(where + ': "' + value + '" is not a value of "' + field.key + '"');
      return;
    }
    values[field.key] = value;
  });
  return values;
}

function colorOf(name) {
  if (name === undefined || name === null) return DEFAULT_BACKGROUND;
  return BACKGROUNDS[name] || String(name);
}

function existingTree(input, container) {
  var ctx = { annotationOf: {}, childrenOf: {}, roots: [] };
  input.annotations.forEach(function (annotation) {
    ctx.annotationOf[annotation.host] = annotation;
  });
  input.markings.forEach(function (m) {
    if (m.container !== container.ref || !ctx.annotationOf[m.ref]) return;
    if (m.parent === null) ctx.roots.push(m);
    else (ctx.childrenOf[m.parent] = ctx.childrenOf[m.parent] || []).push(m);
  });
  return ctx;
}

function sameValues(current, values) {
  return Object.keys(values).every(function (key) {
    return JSON.stringify(current[key]) === JSON.stringify(values[key]);
  });
}

/** Creates (or, when the marking exists with the same type, updates) the node and its children. */
function emitNode(node, state, where, parent, existing) {
  var warnings = state.warnings;
  var typeId = state.table.bySdui[node && node.type];
  if (!typeId) {
    warnings.push(
      where + ': the type "' + (node && node.type) + '" is not known and was left out',
    );
    return null;
  }
  var entry = state.table.byType[typeId];
  var values = valuesOf(node.props, entry, warnings, where);
  var alias = '$n' + state.count++;
  var marking =
    existing && state.old.annotationOf[existing.ref].type === typeId ? existing : null;
  if (marking) {
    var current = state.old.annotationOf[marking.ref];
    if (!sameValues(current.values, values)) {
      state.operations.push({
        op: 'update_annotation',
        annotation: current.ref,
        values: values,
      });
    }
    alias = marking.ref;
  } else {
    var create = {
      op: 'create_marking',
      as: alias,
      annotation: { type: SPEC_ID + '/' + typeId, values: values },
    };
    if (parent) {
      create.inside = parent;
    } else {
      create.container = state.container;
      create.rect = state.nextRect(typeId);
    }
    state.operations.push(create);
  }
  var olds = (marking && state.old.childrenOf[marking.ref]) || [];
  (node.children || []).forEach(function (child, i) {
    emitNode(child, state, where + '.children[' + i + ']', alias, olds[i]);
  });
  return alias;
}

function floatingRect(node, area, state, where) {
  var size = SIZES[state.table.bySdui[node.type]] || { width: 56, height: 56 };
  var anchor = node.anchor || 'bottom-end';
  if (ANCHORS.indexOf(anchor) < 0) {
    state.warnings.push(
      where + ': the anchor "' + anchor + '" is not valid; "bottom-end" used',
    );
    anchor = 'bottom-end';
  }
  var margin = typeof node.margin === 'number' ? node.margin : 0;
  var x = (area.width - size.width) / 2;
  var y = (area.height - size.height) / 2;
  if (anchor.indexOf('start') >= 0) x = margin;
  if (anchor.indexOf('end') >= 0) x = area.width - size.width - margin;
  if (anchor.indexOf('top') === 0) y = margin;
  if (anchor.indexOf('bottom') === 0) y = area.height - size.height - margin;
  return { x: x, y: y, width: size.width, height: size.height };
}

function parse(text, input) {
  var json = JSON.parse(text);
  var screen = json.screen || {};
  var device = screen.device || {};
  var width = device.width;
  var height = device.height;
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new Error('screen.device.width and screen.device.height are required');
  }
  var table = typeTable(input);
  var warnings = [];
  var existing = input.containers.filter(function (c) {
    return c.source && c.source.system === SYSTEM && c.source.id === screen.id;
  })[0];
  var operations = [];
  var containerRef = existing ? existing.ref : '$screen';
  if (!existing) {
    var add = {
      op: 'add_container',
      as: '$screen',
      name: screen.title || 'Screen',
      width: width,
      height: height,
      background: colorOf(screen.background),
    };
    if (screen.id) add.source = { system: SYSTEM, id: String(screen.id) };
    operations.push(add);
  }
  var barHeight = json.bottomBar ? BAR_HEIGHT : 0;
  var area = { x: 0, y: 0, width: width, height: height - barHeight };
  var old = existing
    ? existingTree(input, existing)
    : { annotationOf: {}, childrenOf: {}, roots: [] };
  var state = {
    table: table,
    warnings: warnings,
    operations: operations,
    container: containerRef,
    old: old,
    count: 0,
    nextRect: function () {
      return area;
    },
  };

  var oldRoots = old.roots.filter(function (m) {
    return old.annotationOf[m.ref].type !== FLOATING_TYPE;
  });
  var oldBar = oldRoots.filter(function (m) {
    return m.rect.y > 0 && m.rect.y + m.rect.height === height;
  })[0];
  var oldContent = oldRoots.filter(function (m) {
    return m !== oldBar;
  })[0];
  if (json.content) emitNode(json.content, state, 'content', null, oldContent);
  if (json.bottomBar) {
    state.nextRect = function () {
      return { x: 0, y: height - BAR_HEIGHT, width: width, height: BAR_HEIGHT };
    };
    emitNode(json.bottomBar, state, 'bottomBar', null, oldBar);
  }
  var oldFloating = old.roots
    .concat(
      Object.keys(old.childrenOf).reduce(function (all, key) {
        return all.concat(old.childrenOf[key]);
      }, []),
    )
    .filter(function (m) {
      return old.annotationOf[m.ref].type === FLOATING_TYPE;
    });
  (json.floating || []).forEach(function (node, i) {
    var where = 'floating[' + i + ']';
    var rect = floatingRect(node, area, state, where);
    state.nextRect = function () {
      return rect;
    };
    emitNode({ type: node.type, props: node.props }, state, where, null, oldFloating[i]);
  });
  if (json.modal) {
    warnings.push('modal: the modal and its scrim are not mapped and were left out');
  }
  return { operations: operations, warnings: warnings };
}
