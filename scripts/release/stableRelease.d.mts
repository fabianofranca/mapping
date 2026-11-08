export declare const STABLE_TAG: RegExp;
export declare function parseTags(text: string): string[];
export declare function readServerVersion(source: string): string;
export declare function compareVersions(a: string, b: string): number;
export declare function latestStable(tags: readonly string[]): string | null;
export interface ReleaseDecision {
  publish: boolean;
  tag: string;
  level: 'notice' | 'error';
  message: string;
}
export declare function decideRelease(input: {
  version: string;
  tags: readonly string[];
}): ReleaseDecision;
export interface EpicVerdict {
  ok: boolean;
  level: 'notice' | 'error';
  message: string;
}
export declare function checkEpicVersion(input: {
  version: string;
  tags: readonly string[];
  changed: readonly string[];
}): EpicVerdict;
