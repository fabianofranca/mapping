import type { Signature } from '../src/model/signatures';
import { extractFigma } from './figma/reader';
import { extractKotlin } from './kotlin/reader';
import type { CodeRequest, DesignRequest } from './request';
import { extractSwift } from './swift/reader';

// Os leitores, por nome. Os de código (`kotlin`, `swift`) leem um arquivo-fonte e um símbolo; o de
// design (`figma`) lê o JSON de um nó. `options` são as opções que cada um aceita (a CLI recusa as
// outras como erro de uso).

export type ReaderDef =
  | {
      readonly kind: 'code';
      readonly options: readonly string[];
      readonly read: (request: CodeRequest) => Signature;
    }
  | {
      readonly kind: 'design';
      readonly options: readonly string[];
      readonly read: (request: DesignRequest) => Signature;
    };

const CODE_OPTIONS = ['--file', '--symbol', '--path', '--ref', '--also', '--out'];

export const READERS: Readonly<Record<string, ReaderDef>> = {
  kotlin: {
    kind: 'code',
    options: [...CODE_OPTIONS, '--overload'],
    read: extractKotlin,
  },
  swift: { kind: 'code', options: [...CODE_OPTIONS, '--init'], read: extractSwift },
  figma: { kind: 'design', options: ['--file', '--node', '--out'], read: extractFigma },
};

export const READER_NAMES = Object.keys(READERS);
