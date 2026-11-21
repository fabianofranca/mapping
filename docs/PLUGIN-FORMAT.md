# File format plugin contract

The contract (`contract` 1) between Mapping and the **plugin** of a file format. A specialization declares its file formats in `fileFormats` (`formatVersion` 20, see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "File formats (`formatVersion` 20)"); each format points to a plugin, a `.js` file of the package. The core knows no concrete format (not JSON, YAML or CSV): the specialization knows it, through the plugin.

A plugin **generates** a file from the project (`generate`) and **reads** a file back into the project (`parse`). It only ever runs **isolated**: it sees only its input, has no disk, network or storage, and has a time limit. The MCP server runs it in QuickJS (WebAssembly); the app's executor comes later (#2035) and runs the same shape.

The contract is fixed and versioned: the plugin declares `contract: 1`, and `FormatInput.contract` says the same. A future contract 2 would be a new number, never a change of 1.

## The script

One JavaScript file, a **classic script**, ES2020:

- no `import` or `export`, and no top-level `await`;
- it defines `generate` and/or `parse` at the top level, as function declarations or as `globalThis.generate = …`. A bundler output with a library inside (for example `esbuild --format=iife`) is fine;
- both functions are **synchronous** and pure: returning a `Promise` is the error `plugin-output-invalid`;
- only the ECMAScript built-ins exist: there is no `fetch`, `require`, `import()`, timer, file or storage API. `console.log`, `console.warn` and `console.error` exist and do nothing;
- every call runs in a new context: nothing stays between calls (no state, no cache).

Each function is optional: a format may only generate (an export) or only read (an import). Calling a missing one is the error `plugin-failed` ("the plugin of data-model/csv does not define parse").

```js
function generate(input) {
  // → string
}

function parse(text, input) {
  // → { operations: Operation[], warnings?: string[] }
}
```

`generate(input)` returns the **text** of the file. `parse(text, input)` receives the text of the file and the projection of the project **as it is now**, and returns operations that update the project. Re-reading a file **updates what exists** (the input carries the current items, so the plugin matches them and emits `update_marking` or `update_annotation`) and never deletes anything.

## The input

`input` is a stable, versioned **projection** of the project, built by the core in the shape of the MCP answers and not the raw `mapping.json`. It is plain JSON: the same project gives the same JSON, in the order of the project.

```ts
interface FormatInput {
  contract: 1;
  format: {
    ref: string; // "<specId>/<formatId>", e.g. "data-model/openapi"
    id: string;
    specId: string;
    name: string;
    extension: string;
    scope: 'project' | 'container';
  };
  /** The format's specialization, as the project's copy stores it (`docs/SPEC-FORMAT.md`). */
  specialization: Specialization;
  project: { name: string };
  /** Scope `container`: the container the call is about. `null` with scope `project`. */
  target: { container: string } | null;
  containers: {
    ref: string;
    code: string;
    name: string | null;
    page: string | null; // the name of the container's page
    width: number;
    height: number;
    background: string | null; // "#RRGGBB" of a background-only container
    source: { system: string; id: string; url: string | null } | null;
  }[];
  markings: {
    ref: string;
    code: string;
    container: string | null; // reference of the container; null on the canvas
    parent: string | null; // the nearest ancestor that is also in the input
    rect: { x: number; y: number; width: number; height: number };
    name: string | null;
    slot: { id: string; name: string } | null; // the slot of its mother it sits in
    anchor: {
      to: string;
      side?: 'top' | 'bottom' | 'start' | 'end';
      align?: 'start' | 'center' | 'end' | 'corner-start' | 'corner-end';
      offset?: { main: number; cross: number };
    } | null;
    source: { system: string; id: string; url: string | null } | null;
  }[];
  annotations: {
    ref: string;
    code: string;
    host: string; // the marking or arrow that holds it
    type: string; // type id, in `specialization`
    layer: string; // layer id, in `specialization`
    name: string | null;
    owner: string | null; // reference of the owner annotation
    role: string | null;
    values: Record<string, unknown>; // the fields that are not tables
    rows: Record<string, { ref: string; values: Record<string, unknown> }[]>; // each `table` field, by key
  }[];
  arrows: {
    ref: string;
    code: string;
    from: string;
    to: string;
    name: string | null;
  }[];
}
```

What enters:

- `format` says which format the call is about (`ref` is `<specId>/<formatId>`), `project` carries the project's name, and `target` is the container of a scope `container` call.
- **Only the typed annotations of the format's own specialization.** The annotations of other specializations and those of free layers are left out, and so is every marking, arrow and container that holds none of them. The `specialization` key carries the types, fields and layers the plugin reads.
- `annotations` are those typed annotations; `markings` and `arrows` are the items that hold one of them; `containers` are the containers of those markings. An annotation on an arrow has the arrow as its `host`.
- `parent` is the nearest included ancestor (or `null`): a marking that is not in the input is skipped. `slot` is the slot of its mother the marking sits in, as `get_marking` reports it (`null` outside a slot, or in a slot without an `id`).
- Scope `project`: the whole project. Scope `container`: only the `target` container and what it holds.
- **References** are `mapping://<project>/<letter>/<code>`, as in the MCP (`m` marking or arrow, `i` container, `a` annotation; a row is `…/a/<code>/f/<field>/r/<code>`). `code` is the last segment. Everything that names another item is a reference: `container`, `parent`, `host`, `owner`, `from`, `to` and `anchor.to`.
- `values` holds the fields that are not tables, by `key`. A `ref` field holds the target's **reference** (or `null` when empty). `rows` holds each `table` field as a list of `{ ref, values }`; a `ref` column holds a reference too.

- **Writing a reference back.** The projection hands a `ref` field as a reference text, but the operations take the MCP form of a `ref` value: an object. Wrap the reference: `{ "annotation": "mapping://shop/a/3f2a9c1e" }` for the whole annotation, `{ "annotation": …, "key": "attributes" }` for a field and `{ "annotation": …, "key": "attributes", "row": "<row code>" }` for a row (`/f/<field>` and `/r/<code>` of the text are the `key` and the `row`). `null` clears the value. A row created in the same operation is cited by its alias (`"row": "$row"`, the row has `_as`).
- **What a plugin can cite.** The items of the input and the items the input mentions (the end of an arrow, an anchor target, an owner or a `ref` value may point at an item that holds nothing of the format, so it is not listed but is a valid reference). A container that holds nothing of the format is not in a scope `project` input: to write into an existing container, use scope `container` (the target is always there); otherwise `add_container` creates a new one.

The order is the project's, so the output is deterministic. The serialized projection has at most 16 MiB (`projectionBytes`).

## The result of `parse`

`parse` returns `{ operations, warnings? }`. `operations` is a list of operations from a **fixed subset of the batch operations** (the ones of `propose_changes`, see [`AGENT-GUIDE.md`](AGENT-GUIDE.md)), without deleting:

| Operation           | Keys (besides `op`)                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `add_container`     | `as`, `name`, `width`, `height`, `background`, `source`, `drawingMode`, `direction`, `density`, `center`, `beside`, `page` |
| `create_marking`    | `as`, `annotationAs`, `container`, `near`, `inside`, `slot`, `page`, `rect`, `name`, `source`, `anchor`, `annotation`      |
| `update_marking`    | `marking`, `name`, `source`, `anchor`, `rect`, `container`, `floating`, `move`, `locked`, `confirmReview`                  |
| `create_annotation` | `as`, `marking`, `type`, `layer`, `name`, `entries`, `values`, `owner`, `role`                                             |
| `update_annotation` | `annotation`, `name`, `entries`, `values`, `owner`, `role`                                                                 |
| `create_arrow`      | `as`, `from`, `to`, `style`, `name`                                                                                        |

Each operation has the keys of the MCP operation of the same name (their meaning and values are in the guide), **minus**:

- what brings an image: `file`, `base64` and `fileName`. `add_container` creates a **background-only** container, so `width`, `height` and `background` are required;
- the legacy keys: `image` and `parent` (the parent always comes from the geometry) and `inherit`;
- the route of an arrow (`points`), which belongs to the person.

There is **no** `delete_*`, no `add_image` and no layer or specialization operation: a plugin never deletes anything. Any of them is refused, with the path of the operation.

Rules the core checks (`checkFormatResult`):

- **Shape:** the result is an object with `operations` (a list) and, optionally, `warnings` (a list of texts); another key is refused. A non-object, or a `Promise` (or any object with a `then`), is refused.
- **Aliases** (`as`, `annotationAs` and the `_as` of a table row in `values`) start with `$`, have letters, numbers, `_` or `-`, and are **local** to the import. An operation may cite an alias only after the operation that creates it (and never its own).
- **References:** an operation cites the input's references and codes (`mapping://<project>/m/<code>`, `m/<code>` or just the `code`) and the aliases created before it. A reference that is neither in the input nor mentioned by it is refused.
- **A marking without `rect`** exists only for a type with a component (the MCP rule): for a type without one, the plugin computes the `rect`.
- The checked operations then go through the usual batch: the settle of the hierarchy, slots, roles and the other rules of the model apply as in any proposal, and a refusal comes as the batch's usual error at `operations[i].result[j]`.

```js
function parse(text, input) {
  const [header, ...lines] = text.trim().split('\n');
  const operations = [
    {
      op: 'add_container',
      as: '$page',
      name: 'Data model',
      width: 800,
      height: 600,
      background: '#FFFFFF',
    },
  ];
  lines.forEach((line, i) => {
    const [name, type] = line.split(',');
    operations.push({
      op: 'create_marking',
      container: '$page',
      rect: { x: 20, y: 20 + i * 70, width: 200, height: 60 },
      annotation: { type: 'class', name, values: { name } },
    });
  });
  return { operations, warnings: header === 'class,type' ? [] : ['unexpected header'] };
}
```

**Warnings** are texts for the person (what was left out, what was guessed). At most 100 are kept, of up to 500 characters each: the rest is cut, with one warning saying so.

## Limits

The limits of a call, the same in the MCP and in the app (`FORMAT_PLUGIN_LIMITS`):

| Limit                | Value  | What it limits                                                         |
| -------------------- | ------ | ---------------------------------------------------------------------- |
| `timeoutMs`          | 5,000  | Time of one call, in milliseconds.                                     |
| `memoryBytes`        | 64 MiB | Memory of the QuickJS runtime.                                         |
| `stackBytes`         | 1 MiB  | Stack of the QuickJS runtime.                                          |
| `pluginBytes`        | 1 MiB  | Size of the plugin file.                                               |
| `parseTextBytes`     | 4 MiB  | Size of the text `parse` reads.                                        |
| `generatedTextBytes` | 4 MiB  | Size of the text `generate` returns.                                   |
| `projectionBytes`    | 16 MiB | Size of the serialized input.                                          |
| `operations`         | 5,000  | Operations in a `parse` result.                                        |
| `warnings`           | 100    | Warnings kept from a `parse` result (the rest is cut, with a warning). |
| `warningChars`       | 500    | Characters of a warning (the rest is cut).                             |

## Errors

The MCP codes of a call (no error brings the server down):

| Code                    | When                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format-not-found`      | The `<specId>/<formatId>` is not declared by an applied specialization (`details.formats` lists the available ones).                                                            |
| `plugin-failed`         | The plugin threw, or does not define the function: the message, the plugin path and `line:column` when QuickJS gives them.                                                      |
| `plugin-timeout`        | The call went past `timeoutMs`.                                                                                                                                                 |
| `plugin-limit`          | Memory, size or count went past a limit (the error says which).                                                                                                                 |
| `plugin-output-invalid` | The return value does not fit the contract: the message carries the path **inside the result**, for example `operations[3].op: not allowed in a plugin result: delete_marking`. |

## Examples

A format may carry `examples` (`{ name, file }`, a text in the format) that the library validator runs: with both functions, **round trip** (`parse` on an empty project, then `generate`, must give the example text back, line endings normalized and one final newline ignored); with only `parse`, the operations must apply without error; with only `generate`, `{ name, input, file }`, where `input` is a `.json` projection in the package and `generate(input)` must equal `file`.
