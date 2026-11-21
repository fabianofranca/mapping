// OpenAPI plugin of the `data-model` package (stage #1923, FP5). A classic script (no import/export);
// `generate` and `parse` are the contract-1 entry points (docs/PLUGIN-FORMAT.md).
//
// The data model becomes OpenAPI 3.0.3 YAML: the `class` annotations become `components.schemas`
// (the `attributes` table becomes `properties`, `required` and `example`) and the `endpoint`
// annotations become `paths` (`request` and `response` are `$ref`s to a class name, `timeoutMs` is
// `x-timeout-ms`). The YAML reader and writer below cover only the subset this plugin writes: block
// mappings, block sequences, plain, single-quoted and double-quoted scalars, `{}` and `[]`.

var HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
var REF_PREFIX = '#/components/schemas/';
var DEFAULT_TITLE = 'Data model';

// ---- YAML writer ------------------------------------------------------------------------------

function yamlScalar(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  var text = String(value);
  if (/[\n\r\t]/.test(text)) return JSON.stringify(text);
  var plain =
    (/^[A-Za-z_/$][A-Za-z0-9_/.{}$ -]*$/.test(text) && !/ $/.test(text)) ||
    /^\d+(\.\d+){2,}$/.test(text);
  if (plain && !/^(true|false|null|yes|no|on|off|y|n)$/i.test(text)) return text;
  return "'" + text.replace(/'/g, "''") + "'";
}

function isScalar(value) {
  return value === null || typeof value !== 'object';
}

/** Appends the lines of `value` (an object or an array) at `indent` spaces. */
function yamlEmit(value, indent, out) {
  var pad = new Array(indent + 1).join(' ');
  if (Array.isArray(value)) {
    value.forEach(function (item) {
      out.push(pad + '- ' + yamlScalar(item));
    });
    return;
  }
  Object.keys(value).forEach(function (key) {
    var item = value[key];
    var name = yamlScalar(key);
    if (isScalar(item)) {
      out.push(pad + name + ': ' + yamlScalar(item));
    } else if (Array.isArray(item) ? item.length === 0 : Object.keys(item).length === 0) {
      out.push(pad + name + ': ' + (Array.isArray(item) ? '[]' : '{}'));
    } else {
      out.push(pad + name + ':');
      yamlEmit(item, indent + 2, out);
    }
  });
}

function toYaml(document) {
  var out = [];
  yamlEmit(document, 0, out);
  return out.join('\n') + '\n';
}

// ---- YAML reader ------------------------------------------------------------------------------

function yamlLines(text) {
  var lines = [];
  text.split(/\r?\n/).forEach(function (raw) {
    if (/^\s*(#.*)?$/.test(raw) || /^---\s*$/.test(raw)) return;
    var indent = raw.match(/^ */)[0].length;
    lines.push({ indent: indent, text: raw.slice(indent).replace(/\s+$/, '') });
  });
  return lines;
}

function yamlValue(token) {
  if (token.charAt(0) === "'") {
    return token.slice(1, token.lastIndexOf("'")).replace(/''/g, "'");
  }
  if (token.charAt(0) === '"') {
    try {
      return JSON.parse(token);
    } catch {
      return token.slice(1, -1);
    }
  }
  var plain = token.replace(/\s+#.*$/, '').trim();
  if (plain === '{}') return {};
  if (plain === '[]') return [];
  if (plain === 'null' || plain === '~' || plain === '') return null;
  if (plain === 'true') return true;
  if (plain === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain);
  return plain;
}

/** Splits `key: rest`; the key may be quoted. Returns null when the line is not a mapping entry. */
function yamlEntry(text) {
  var key;
  var rest;
  var quote = text.charAt(0);
  if (quote === "'" || quote === '"') {
    var end = text.indexOf(quote, 1);
    while (quote === "'" && text.charAt(end + 1) === "'")
      end = text.indexOf(quote, end + 2);
    if (end < 0 || text.charAt(end + 1) !== ':') return null;
    key = yamlValue(text.slice(0, end + 1));
    rest = text.slice(end + 2).trim();
  } else {
    var found = /^(.*?):(?: +(.*))?$/.exec(text);
    if (!found) return null;
    key = found[1].trim();
    rest = (found[2] || '').trim();
  }
  return { key: String(key), rest: rest };
}

function fromYaml(text) {
  var lines = yamlLines(text);
  var pos = 0;

  function block(indent) {
    return lines[pos].text.charAt(0) === '-' ? sequence(indent) : mapping(indent);
  }

  function sequence(indent) {
    var list = [];
    while (
      pos < lines.length &&
      lines[pos].indent === indent &&
      lines[pos].text.charAt(0) === '-'
    ) {
      var rest = lines[pos].text.replace(/^-\s*/, '');
      if (rest === '') {
        pos++;
        list.push(
          pos < lines.length && lines[pos].indent > indent
            ? block(lines[pos].indent)
            : null,
        );
      } else if (yamlEntry(rest) && rest.charAt(0) !== "'" && rest.charAt(0) !== '"') {
        // `- key: value`: the entry becomes the first line of a mapping two spaces deeper.
        lines[pos] = { indent: indent + 2, text: rest };
        list.push(mapping(indent + 2));
      } else {
        pos++;
        list.push(yamlValue(rest));
      }
    }
    return list;
  }

  function mapping(indent) {
    var map = {};
    while (
      pos < lines.length &&
      lines[pos].indent === indent &&
      lines[pos].text.charAt(0) !== '-'
    ) {
      var entry = yamlEntry(lines[pos].text);
      if (!entry) throw new Error('unsupported YAML at "' + lines[pos].text + '"');
      pos++;
      if (entry.rest !== '') {
        map[entry.key] = yamlValue(entry.rest);
      } else if (pos < lines.length && lines[pos].indent > indent) {
        map[entry.key] = block(lines[pos].indent);
      } else if (
        pos < lines.length &&
        lines[pos].indent === indent &&
        lines[pos].text.charAt(0) === '-'
      ) {
        map[entry.key] = sequence(indent);
      } else {
        map[entry.key] = null;
      }
    }
    return map;
  }

  if (lines.length === 0) return {};
  var result = block(lines[0].indent);
  if (pos < lines.length)
    throw new Error('unsupported YAML at "' + lines[pos].text + '"');
  return result;
}

// ---- the data model ↔ OpenAPI -----------------------------------------------------------------

/** Class attribute type → OpenAPI `{ type, format?, items? }`. */
function schemaOfType(type) {
  switch (type) {
    case 'Int':
      return { type: 'integer', format: 'int32' };
    case 'Long':
      return { type: 'integer', format: 'int64' };
    case 'Double':
      return { type: 'number', format: 'double' };
    case 'Boolean':
      return { type: 'boolean' };
    case 'Date':
      return { type: 'string', format: 'date' };
    case 'List':
      return { type: 'array', items: { type: 'string' } };
    case 'Object':
      return { type: 'object' };
    default:
      return { type: 'string' };
  }
}

/** OpenAPI property → class attribute type. */
function typeOfSchema(property) {
  if (!property || typeof property !== 'object') return 'String';
  if (property.$ref) return 'Object';
  switch (property.type) {
    case 'integer':
      return property.format === 'int64' ? 'Long' : 'Int';
    case 'number':
      return 'Double';
    case 'boolean':
      return 'Boolean';
    case 'array':
      return 'List';
    case 'object':
      return 'Object';
    default:
      return property.format === 'date' ? 'Date' : 'String';
  }
}

function jsonContent(ref) {
  return { 'application/json': { schema: { $ref: REF_PREFIX + ref } } };
}

function classSchema(annotation) {
  var rows = (annotation.rows && annotation.rows.attributes) || [];
  var schema = { type: 'object' };
  if (annotation.values.description) schema.description = annotation.values.description;
  var required = rows
    .filter(function (row) {
      return row.values.required !== 'no';
    })
    .map(function (row) {
      return row.values.name;
    });
  if (required.length > 0) schema.required = required;
  if (rows.length > 0) {
    schema.properties = {};
    rows.forEach(function (row) {
      var property = schemaOfType(row.values.type);
      if (row.values.example) property.example = String(row.values.example);
      schema.properties[row.values.name] = property;
    });
  }
  return schema;
}

function operationOf(annotation) {
  var values = annotation.values;
  var operation = {};
  if (values.timeoutMs !== undefined && values.timeoutMs !== null) {
    operation['x-timeout-ms'] = values.timeoutMs;
  }
  if (values.request) {
    operation.requestBody = { required: true, content: jsonContent(values.request) };
  }
  var response = { description: 'OK' };
  if (values.response) response.content = jsonContent(values.response);
  operation.responses = { 200: response };
  return operation;
}

function ofType(input, type) {
  return input.annotations.filter(function (annotation) {
    return annotation.type === type;
  });
}

function titleOf(input, classes) {
  var host = classes.length > 0 ? classes[0].host : null;
  var marking = input.markings.filter(function (m) {
    return m.ref === host;
  })[0];
  var container = marking
    ? input.containers.filter(function (c) {
        return c.ref === marking.container;
      })[0]
    : null;
  return (container && container.name) || input.project.name || DEFAULT_TITLE;
}

function generate(input) {
  var classes = ofType(input, 'class');
  var document = {
    openapi: '3.0.3',
    info: { title: titleOf(input, classes), version: '1.0.0' },
    paths: {},
    components: { schemas: {} },
  };
  ofType(input, 'endpoint').forEach(function (annotation) {
    var path = annotation.values.path;
    var method = String(annotation.values.method || 'GET').toLowerCase();
    if (!path) return;
    document.paths[path] = document.paths[path] || {};
    document.paths[path][method] = operationOf(annotation);
  });
  classes.forEach(function (annotation) {
    if (annotation.values.name)
      document.components.schemas[annotation.values.name] = classSchema(annotation);
  });
  return toYaml(document);
}

// ---- parse ------------------------------------------------------------------------------------

function refName(schema) {
  var ref = schema && typeof schema === 'object' ? schema.$ref : null;
  return typeof ref === 'string' ? ref.replace(REF_PREFIX, '') : '';
}

function schemaOfContent(content) {
  var json = content && content['application/json'];
  return json ? refName(json.schema) : '';
}

function rowsOfSchema(schema) {
  var required = Array.isArray(schema.required) ? schema.required : [];
  var properties =
    schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  return Object.keys(properties).map(function (name) {
    var property = properties[name];
    var example =
      property && property.example !== undefined && property.example !== null
        ? property.example
        : '';
    return {
      name: name,
      type: typeOfSchema(property),
      required: required.indexOf(name) >= 0 ? 'yes' : 'no',
      example: String(example),
    };
  });
}

function classValues(name, schema) {
  var description = typeof schema.description === 'string' ? schema.description : '';
  return { name: name, description: description, attributes: rowsOfSchema(schema) };
}

function endpointValues(method, path, operation) {
  var responses =
    operation.responses && typeof operation.responses === 'object'
      ? operation.responses
      : {};
  var first = Object.keys(responses)[0];
  var values = {
    method: method.toUpperCase(),
    path: path,
    request: operation.requestBody ? schemaOfContent(operation.requestBody.content) : '',
    response: first ? schemaOfContent(responses[first] && responses[first].content) : '',
  };
  if (typeof operation['x-timeout-ms'] === 'number')
    values.timeoutMs = operation['x-timeout-ms'];
  return values;
}

function sameRows(rows, annotation) {
  var current = ((annotation.rows && annotation.rows.attributes) || []).map(
    function (row) {
      return [
        row.values.name,
        row.values.type,
        row.values.required || 'yes',
        row.values.example || '',
      ];
    },
  );
  var wanted = rows.map(function (row) {
    return [row.name, row.type, row.required, row.example];
  });
  return JSON.stringify(current) === JSON.stringify(wanted);
}

/** The keys of `values` that differ from what the annotation holds (an empty list: nothing to do). */
function changedValues(annotation, values) {
  var changed = {};
  Object.keys(values).forEach(function (key) {
    if (key === 'name' || key === 'method' || key === 'path') return;
    var current = annotation.values[key];
    if (current === undefined || current === null) current = '';
    var same =
      key === 'attributes'
        ? sameRows(values.attributes, annotation)
        : current === values[key];
    if (!same) changed[key] = values[key];
  });
  return changed;
}

/** Grid placement of the new items in a container (a cell per item, `taken` cells already used). */
function placement(container, taken, count) {
  var cell = { width: 220, height: 160, gap: 20 };
  var width = container ? container.width : 1100;
  var columns = Math.max(1, Math.floor((width - cell.gap) / (cell.width + cell.gap)));
  var rects = [];
  for (var i = 0; i < count; i++) {
    var index = taken + i;
    rects.push({
      x: cell.gap + (index % columns) * (cell.width + cell.gap),
      y: cell.gap + Math.floor(index / columns) * (cell.height + cell.gap),
      width: cell.width,
      height: cell.height,
    });
  }
  var rows = Math.ceil((taken + count) / columns);
  return {
    rects: rects,
    height: Math.max(400, cell.gap + rows * (cell.height + cell.gap)),
  };
}

function parse(text, input) {
  var document = fromYaml(text);
  if (!document || typeof document !== 'object' || !document.openapi) {
    throw new Error('not an OpenAPI document: the `openapi` key is missing');
  }
  var title = (document.info && document.info.title) || DEFAULT_TITLE;
  var container = input.containers.filter(function (c) {
    return c.name === title;
  })[0];
  var warnings = [];

  var classes = [];
  var schemas = (document.components && document.components.schemas) || {};
  Object.keys(schemas).forEach(function (name) {
    if (schemas[name] && typeof schemas[name] === 'object')
      classes.push(classValues(name, schemas[name]));
  });
  var endpoints = [];
  var paths = document.paths && typeof document.paths === 'object' ? document.paths : {};
  Object.keys(paths).forEach(function (path) {
    HTTP_METHODS.forEach(function (method) {
      if (paths[path] && paths[path][method])
        endpoints.push(endpointValues(method, path, paths[path][method]));
    });
  });

  var existingClasses = {};
  ofType(input, 'class').forEach(function (annotation) {
    existingClasses[annotation.values.name] = annotation;
  });
  var existingEndpoints = {};
  ofType(input, 'endpoint').forEach(function (annotation) {
    existingEndpoints[annotation.values.method + ' ' + annotation.values.path] =
      annotation;
  });

  var operations = [];
  var fresh = [];
  classes.forEach(function (values) {
    var found = existingClasses[values.name];
    if (!found) return fresh.push({ type: 'data-model/class', values: values });
    var changed = changedValues(found, values);
    if (Object.keys(changed).length > 0) {
      operations.push({
        op: 'update_annotation',
        annotation: found.ref,
        values: changed,
      });
    }
  });
  endpoints.forEach(function (values) {
    var found = existingEndpoints[values.method + ' ' + values.path];
    if (!found) return fresh.push({ type: 'data-model/endpoint', values: values });
    var changed = changedValues(found, values);
    if (Object.keys(changed).length > 0) {
      operations.push({
        op: 'update_annotation',
        annotation: found.ref,
        values: changed,
      });
    }
  });

  if (fresh.length > 0) {
    var taken = container
      ? input.markings.filter(function (m) {
          return m.container === container.ref;
        }).length
      : 0;
    var grid = placement(container, taken, fresh.length);
    var target = container ? container.ref : '$model';
    if (!container) {
      operations.unshift({
        op: 'add_container',
        as: '$model',
        name: title,
        width: 1100,
        height: grid.height,
        background: '#FFFFFF',
      });
    } else if (
      grid.rects.some(function (r) {
        return r.y + r.height > container.height;
      })
    ) {
      warnings.push('some new items fall below the end of the container "' + title + '"');
    }
    fresh.forEach(function (annotation, i) {
      operations.push({
        op: 'create_marking',
        container: target,
        rect: grid.rects[i],
        annotation: annotation,
      });
    });
  }
  return { operations: operations, warnings: warnings };
}
