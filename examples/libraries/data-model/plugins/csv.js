// CSV plugin of the `data-model` package (stage #1923, FP5). A classic script (no import/export);
// `generate` and `parse` are the contract-1 entry points (docs/PLUGIN-FORMAT.md).
//
// One line per attribute of each class: `class,attribute,type,required,example` (RFC 4180 quoting:
// a field with a comma, a quote or a line break is wrapped in quotes and its quotes are doubled).
// Classes without attributes have no line. `parse` creates the classes in a container called
// "Data model" and updates, by class name, the attributes of the ones that already exist.

var HEADER = ['class', 'attribute', 'type', 'required', 'example'];
var TYPES = ['String', 'Int', 'Long', 'Double', 'Boolean', 'Date', 'List', 'Object'];
var CONTAINER_NAME = 'Data model';

function csvField(value) {
  var text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function csvLine(fields) {
  return fields.map(csvField).join(',');
}

function generate(input) {
  var lines = [csvLine(HEADER)];
  input.annotations.forEach(function (annotation) {
    if (annotation.type !== 'class') return;
    ((annotation.rows && annotation.rows.attributes) || []).forEach(function (row) {
      lines.push(
        csvLine([
          annotation.values.name,
          row.values.name,
          row.values.type,
          row.values.required || 'yes',
          row.values.example,
        ]),
      );
    });
  });
  return lines.join('\n') + '\n';
}

/** RFC 4180 reader: a list of records, each a list of fields. Blank lines are skipped. */
function csvRecords(text) {
  var records = [];
  var record = [];
  var field = '';
  var quoted = false;
  for (var i = 0; i < text.length; i++) {
    var char = text.charAt(i);
    if (quoted) {
      if (char === '"' && text.charAt(i + 1) === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(i + 1) === '\n') i++;
      record.push(field);
      field = '';
      if (record.length > 1 || record[0] !== '') records.push(record);
      record = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('the CSV ends inside a quoted field');
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
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

/** Grid placement of the new classes in a container (a cell per class, `taken` cells already used). */
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
  var records = csvRecords(text);
  var warnings = [];
  if (records.length > 0 && records[0][0] === HEADER[0]) {
    records.shift();
  } else {
    warnings.push(
      'the first line is not the header "' + HEADER.join(',') + '"; reading it as data',
    );
  }

  var names = [];
  var byName = {};
  records.forEach(function (record, index) {
    var name = record[0];
    if (!name || !record[1]) {
      warnings.push(
        'line ' + (index + 2) + ' skipped: it needs a class and an attribute',
      );
      return;
    }
    var type = record[2] || 'String';
    if (TYPES.indexOf(type) < 0) {
      warnings.push(
        'line ' + (index + 2) + ': unknown type "' + type + '", using String',
      );
      type = 'String';
    }
    var required = record[3] === 'no' ? 'no' : 'yes';
    if (!byName[name]) {
      byName[name] = [];
      names.push(name);
    }
    byName[name].push({
      name: record[1],
      type: type,
      required: required,
      example: record[4] || '',
    });
  });

  var existing = {};
  input.annotations.forEach(function (annotation) {
    if (annotation.type === 'class') existing[annotation.values.name] = annotation;
  });
  var container = input.containers.filter(function (c) {
    return c.name === CONTAINER_NAME;
  })[0];

  var operations = [];
  var fresh = [];
  names.forEach(function (name) {
    var found = existing[name];
    if (!found) {
      fresh.push(name);
    } else if (!sameRows(byName[name], found)) {
      operations.push({
        op: 'update_annotation',
        annotation: found.ref,
        values: { attributes: byName[name] },
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
        name: CONTAINER_NAME,
        width: 1100,
        height: grid.height,
        background: '#FFFFFF',
      });
    } else if (
      grid.rects.some(function (r) {
        return r.y + r.height > container.height;
      })
    ) {
      warnings.push(
        'some new classes fall below the end of the container "' + CONTAINER_NAME + '"',
      );
    }
    fresh.forEach(function (name, i) {
      operations.push({
        op: 'create_marking',
        container: target,
        rect: grid.rects[i],
        annotation: {
          type: 'data-model/class',
          values: { name: name, attributes: byName[name] },
        },
      });
    });
  }
  return { operations: operations, warnings: warnings };
}
