// The signature in the library package (formatVersion 16; stage #1079, S1): `validateLibrary` checks the
// cited signature (it exists, is a valid `mapping-signature`, the symbol and the file match the `code`)
// and warns about a mapped parameter that the signature does not have.
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { isModelMessageTemplateCode } from '../../src/model/messages';
import { buttonSignature } from './signatures/fixtures';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC = 'm3.spec.json';
const SIG = 'signatures/button.compose.json';

function spec(edit?: (code: Json, spec: Json) => void): Json {
  const code: Json = {
    symbol: 'androidx.compose.material3.Button',
    path: 'compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt',
    signature: SIG,
    calls: { colors: 'androidx.compose.material3.ButtonDefaults.buttonColors' },
    ignore: ['onClick', 'modifier', 'shape', 'content'],
    params: { label: 'enabled', color: 'colors.containerColor' },
  };
  const s: Json = {
    format: 'mapping-spec',
    formatVersion: 16,
    id: 'm3',
    name: 'M3',
    version: 1,
    platforms: [
      {
        id: 'compose',
        name: 'Compose',
        language: 'kotlin',
        repo: { url: 'https://github.com/androidx/androidx' },
      },
    ],
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [
              { key: 'label', type: 'string' },
              { key: 'color', type: 'string' },
            ],
            code: { compose: code },
          },
        ],
      },
    ],
  };
  edit?.(code, s);
  return s;
}

function files(specJson: Json, signature: unknown = buttonSignature()): LibraryFile[] {
  const list: LibraryFile[] = [{ path: SPEC, text: JSON.stringify(specJson) }];
  if (signature !== null) list.push({ path: SIG, text: JSON.stringify(signature) });
  return list;
}

function issues(list: LibraryFile[]) {
  return validateLibrary({ files: list, level: 2 }).issues.map((i) => ({
    file: i.file,
    path: i.path,
    severity: i.severity,
    message: i.message,
  }));
}

describe('the signature in the library package', () => {
  it('a cited, valid signature passes with no error or warning, and is not left "unreferenced"', () => {
    expect(issues(files(spec()))).toEqual([]);
  });

  it('a cited signature that is not in the package is an error', () => {
    expect(issues(files(spec(), null))).toEqual([
      {
        file: SPEC,
        path: 'layers[0].annotationTypes[0].code.compose.signature',
        severity: 'error',
        message: `file not found: ${SIG}`,
      },
    ]);
  });

  it('an invalid signature is an error, with the path inside it', () => {
    const bad = buttonSignature((s) => (s.params[1].role = 'bogus'));
    const found = issues(files(spec(), bad)).filter((i) => i.severity === 'error');
    expect(found.map((i) => [i.file, i.path])).toEqual([[SIG, 'params[1].role']]);
  });

  it('a signature symbol different from the code is an error; so is the file', () => {
    const symbol = buttonSignature((s) => (s.source.symbol = 'x.Other'));
    expect(issues(files(spec(), symbol))).toEqual([
      expect.objectContaining({
        file: SPEC,
        path: 'layers[0].annotationTypes[0].code.compose.signature',
        severity: 'error',
        message: expect.stringContaining('x.Other'),
      }),
    ]);
    const path = buttonSignature((s) => (s.source.path = 'other/Button.kt'));
    expect(issues(files(spec(), path))).toEqual([
      expect.objectContaining({
        path: 'layers[0].annotationTypes[0].code.compose.signature',
        severity: 'error',
        message: expect.stringContaining('other/Button.kt'),
      }),
    ]);
  });

  it('a mapped parameter that the signature does not have is a "parameter outside the signature" warning', () => {
    const found = issues(
      files(
        spec((code) => {
          code.params = { label: 'enabled', color: 'removedParam' };
        }),
      ),
    );
    expect(found).toEqual([
      {
        file: SPEC,
        path: 'layers[0].annotationTypes[0].code.compose.params.color',
        severity: 'warning',
        message: 'parameter outside the signature: "removedParam"',
      },
    ]);
  });

  it('in a variants case, the symbol and the file compared are those of the case', () => {
    const outlined = buttonSignature((s) => {
      s.source.symbol = 'androidx.compose.material3.OutlinedButton';
    });
    const list = [
      ...files(
        spec((code) => {
          code.variants = {
            field: 'color',
            cases: {
              outlined: {
                symbol: 'androidx.compose.material3.OutlinedButton',
                signature: 'signatures/button.outlined.compose.json',
              },
            },
          };
        }),
      ),
      { path: 'signatures/button.outlined.compose.json', text: JSON.stringify(outlined) },
    ];
    // The test's `color` field is a string: `variants` asks for an enum; that is the only error.
    const found = issues(list).filter((i) => !i.path.endsWith('variants.field'));
    expect(found).toEqual([]);
  });

  it('a design signature in the type sources must exist and be valid', () => {
    const figma = {
      format: 'mapping-signature',
      formatVersion: 1,
      source: {
        kind: 'design',
        system: 'figma',
        id: '1:2',
        name: 'Button',
        extractor: 'agent',
      },
      params: [],
    };
    const withFigma = spec((_code, s) => {
      s.layers[0].annotationTypes[0].sources = [
        { system: 'figma', name: 'Button', signature: 'signatures/button.figma.json' },
      ];
    });
    const base = files(withFigma);
    expect(issues(base).map((i) => [i.severity, i.path])).toEqual([
      ['error', 'layers[0].annotationTypes[0].sources[0].signature'],
    ]);
    expect(
      issues([
        ...base,
        { path: 'signatures/button.figma.json', text: JSON.stringify(figma) },
      ]),
    ).toEqual([]);
  });
});

describe('the variants case and the signature (review findings)', () => {
  const OUT = 'signatures/button.outlined.compose.json';
  const CASE_AT = 'layers[0].annotationTypes[0].code.compose.variants.cases.outlined';
  const withCase = (kase: Json) =>
    spec((code, s) => {
      s.layers[0].annotationTypes[0].fields[1] = {
        key: 'color',
        type: 'enum',
        options: ['filled', 'outlined'],
      };
      code.variants = { field: 'color', cases: { outlined: kase } };
    });
  const found = (list: LibraryFile[]) => issues(list);

  it('a case without its own signature checks its params against the base signature', () => {
    const list = files(withCase({ params: { label: 'bogus' } }));
    expect(found(list)).toEqual([
      {
        file: SPEC,
        path: `${CASE_AT}.params.label`,
        severity: 'warning',
        message: 'parameter outside the signature: "bogus"',
      },
    ]);
  });

  it('a case with its own signature also checks the params inherited from the base', () => {
    const outlined = buttonSignature((s) => {
      s.params = s.params.filter((p: Json) => p.name !== 'enabled');
    });
    const list = [
      ...files(withCase({ signature: OUT })),
      { path: OUT, text: JSON.stringify(outlined) },
    ];
    expect(found(list)).toEqual([
      {
        file: SPEC,
        path: `${CASE_AT}.params.label`,
        severity: 'warning',
        message: 'parameter outside the signature: "enabled"',
      },
    ]);
  });

  it('CL2 R-2: a case without its own signature checks its symbol and file against the inherited signature', () => {
    const list = files(
      withCase({
        symbol: 'androidx.compose.material3.OutlinedButton',
        path: 'compose/OutlinedButton.kt',
      }),
    );
    expect(found(list).map((i) => [i.severity, i.path])).toEqual([
      ['error', `${CASE_AT}.symbol`],
      ['error', `${CASE_AT}.path`],
    ]);
    const codes = validateLibrary({ files: list, level: 2 })
      .issues.map((i) => i.code)
      .sort();
    expect(codes).toEqual([
      'library.signaturePathMismatch',
      'library.signatureSymbolMismatch',
    ]);
  });

  it('CL2 R-2: a case without its own symbol or file inherits the base ones and does not complain', () => {
    expect(found(files(withCase({ params: { label: 'enabled' } })))).toEqual([]);
  });

  it('a missing signature is an error in every place that cites it, not only the first', () => {
    const list = files(withCase({ signature: SIG }), null);
    expect(found(list).map((i) => [i.severity, i.path])).toEqual([
      ['error', 'layers[0].annotationTypes[0].code.compose.signature'],
      ['error', `${CASE_AT}.signature`],
    ]);
  });
});

describe('signature platform and problem codes (CL1: S5-b and S5-d)', () => {
  const at = 'layers[0].annotationTypes[0].code.compose.signature';

  it('S5-b: a code signature of another platform is an error with a clear problem', () => {
    const other = buttonSignature((s) => (s.source.platform = 'swiftui'));
    const found = issues(files(spec(), other));
    expect(found).toEqual([
      {
        file: SPEC,
        path: at,
        severity: 'error',
        message:
          'the signature is for the platform "swiftui", but the code is for the platform "compose"',
      },
    ]);
  });

  it('S5-d: every signature problem has a catalog code (and its text)', () => {
    const problems = [
      // not found
      validateLibrary({ files: files(spec(), null), level: 2 }),
      // signature invalid inside
      validateLibrary({
        files: files(
          spec(),
          buttonSignature((s) => (s.params[1].role = 'bogus')),
        ),
        level: 2,
      }),
      // symbol, file and platform
      validateLibrary({
        files: files(
          spec(),
          buttonSignature((s) => {
            s.source.symbol = 'x.Other';
            s.source.path = 'other/Button.kt';
            s.source.platform = 'swiftui';
          }),
        ),
        level: 2,
      }),
      // design signature in code
      validateLibrary({
        files: files(
          spec(),
          buttonSignature((s) => {
            s.source = {
              kind: 'design',
              system: 'figma',
              id: '1',
              name: 'B',
              extractor: 'agent',
            };
          }),
        ),
        level: 2,
      }),
      // code signature in the type sources
      validateLibrary({
        files: [
          ...files(
            spec((_c, sp) => {
              sp.layers[0].annotationTypes[0].sources = [
                { system: 'figma', name: 'Button', signature: SIG },
              ];
            }),
          ),
        ],
        level: 2,
      }),
      // parameter outside the signature
      validateLibrary({
        files: files(
          spec((code) => {
            code.params = { label: 'bogus' };
          }),
        ),
        level: 2,
      }),
    ].flatMap((r) => r.issues);
    expect(problems.length).toBeGreaterThanOrEqual(8);
    for (const issue of problems) {
      expect(isModelMessageTemplateCode(issue.code ?? ''), issue.message).toBe(true);
    }
  });
});
