// A ficha no pacote da biblioteca (formatVersion 16; etapa #1079, S1): `validateLibrary` confere a
// ficha citada (existe, é uma `mapping-signature` válida, o símbolo e o arquivo batem com o `code`)
// e avisa do parâmetro mapeado que a ficha não tem.
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
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

describe('a ficha no pacote da biblioteca', () => {
  it('uma ficha citada e válida passa sem erro nem aviso, e não fica "não referenciada"', () => {
    expect(issues(files(spec()))).toEqual([]);
  });

  it('a ficha citada que não está no pacote é erro', () => {
    expect(issues(files(spec(), null))).toEqual([
      {
        file: SPEC,
        path: 'layers[0].annotationTypes[0].code.compose.signature',
        severity: 'error',
        message: `arquivo não encontrado: ${SIG}`,
      },
    ]);
  });

  it('a ficha inválida é erro, com o caminho dentro dela', () => {
    const bad = buttonSignature((s) => (s.params[1].role = 'bogus'));
    const found = issues(files(spec(), bad)).filter((i) => i.severity === 'error');
    expect(found.map((i) => [i.file, i.path])).toEqual([[SIG, 'params[1].role']]);
  });

  it('o símbolo da ficha diferente do code é erro; o arquivo também', () => {
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

  it('parâmetro mapeado que a ficha não tem é aviso "parâmetro fora da ficha"', () => {
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
        message: 'parâmetro fora da ficha: "removedParam"',
      },
    ]);
  });

  it('no caso de variants, o símbolo e o arquivo comparados são os do caso', () => {
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
    // O campo `color` do teste é string: o `variants` pede enum; o erro é só esse.
    const found = issues(list).filter((i) => !i.path.endsWith('variants.field'));
    expect(found).toEqual([]);
  });

  it('a ficha de design na sources do tipo precisa existir e ser válida', () => {
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

describe('o caso de variants e a ficha (achados da revisão)', () => {
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

  it('o caso sem ficha própria confere os params dele contra a ficha da base', () => {
    const list = files(withCase({ params: { label: 'bogus' } }));
    expect(found(list)).toEqual([
      {
        file: SPEC,
        path: `${CASE_AT}.params.label`,
        severity: 'warning',
        message: 'parâmetro fora da ficha: "bogus"',
      },
    ]);
  });

  it('o caso com ficha própria confere também os params herdados da base', () => {
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
        message: 'parâmetro fora da ficha: "enabled"',
      },
    ]);
  });

  it('a ficha que falta é erro em cada lugar que a cita, não só no primeiro', () => {
    const list = files(withCase({ signature: SIG }), null);
    expect(found(list).map((i) => [i.severity, i.path])).toEqual([
      ['error', 'layers[0].annotationTypes[0].code.compose.signature'],
      ['error', `${CASE_AT}.signature`],
    ]);
  });
});
