// @vitest-environment node
// Closure of the `mapping-viewer` package declarations: every package that the `.d.ts` of the two
// entries import must be in `dependencies` or `peerDependencies` of the manifest, otherwise the
// host with `skipLibCheck: false` gets TS2307 (and with `true` the types silently become `any`).
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
// @ts-expect-error build .mjs module, without declarations
import { packageJson } from '../../viewer/packageManifest.mjs';

const manifest = packageJson as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** Emits the declarations of the two entries in memory (nothing goes to disk). */
function emitDeclarations(): Map<string, string> {
  const configPath = ts.findConfigFile('viewer', ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('viewer/tsconfig.json not found');
  const config = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      },
    },
  );
  if (!config) throw new Error('invalid viewer tsconfig');
  const program = ts.createProgram(config.fileNames, config.options);
  const out = new Map<string, string>();
  program.emit(undefined, (fileName, text) => {
    if (fileName.endsWith('.d.ts')) out.set(posix.normalize(fileName), text);
  });
  return out;
}

/** Specifiers of `import`/`export ... from` and `import("...")` of a declaration. */
function specifiersOf(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      found.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `konva/lib/Core` → `konva`; `@preact/signals/x` → `@preact/signals`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

function resolveRelative(from: string, specifier: string, all: Map<string, string>) {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  return [`${base}.d.ts`, posix.join(base, 'index.d.ts')].find((c) => all.has(c));
}

describe('mapping-viewer declarations', () => {
  it('every package reachable from the two entries is declared in the manifest', () => {
    const all = emitDeclarations();
    const roots = [...all.keys()].filter(
      (f) => f.endsWith('/viewer/index.d.ts') || f.endsWith('/viewer/react.d.ts'),
    );
    expect(roots).toHaveLength(2);
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const seen = new Set<string>();
    const queue = [...roots];
    const undeclared = new Map<string, string>();
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of specifiersOf(file, all.get(file)!)) {
        if (specifier.startsWith('./') || specifier.startsWith('../')) {
          const next = resolveRelative(file, specifier, all);
          if (next) queue.push(next);
          continue;
        }
        const name = packageName(specifier);
        if (!declared.has(name) && !undeclared.has(name)) undeclared.set(name, file);
      }
    }
    expect(
      [...undeclared].map(([name, file]) => `${name} (in ${file})`),
      'packages imported by the declarations and missing from the manifest',
    ).toEqual([]);
  }, 60_000);
});
