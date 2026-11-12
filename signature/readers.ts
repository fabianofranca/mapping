import type { Signature } from '../src/model/signatures';
import { extractKotlin, type ReadRequest } from './kotlin/reader';

// Os leitores, por nome. `swift` e `figma` são da fase seguinte (S4): hoje só há o `kotlin`.

export type Reader = (request: ReadRequest) => Signature;

export const READERS: Readonly<Record<string, Reader>> = {
  kotlin: extractKotlin,
};

export const READER_NAMES = Object.keys(READERS);
