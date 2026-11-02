export declare const EXAMPLE_DIR: string;
export declare const EXAMPLE_ZIP: string;
export declare const EXAMPLE_SPECS: readonly {
  target: string;
  source: string;
  exclude?: string[];
  indent?: boolean;
}[];
export declare function folderFiles(
  root: string,
  skip?: (relative: string) => boolean,
): Promise<Map<string, Buffer>>;
export declare function exampleFiles(root?: string): Promise<Map<string, Buffer>>;
export declare function folderZip(root: string): Promise<Buffer>;
export declare function exampleZip(root?: string): Promise<Buffer>;
export declare function materializeSpecs(root?: string): Promise<number>;
