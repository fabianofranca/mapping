export declare const BLOCK_BEGIN: string;
export declare const BLOCK_END: string;
export declare const WORKSPACE_SOURCES: readonly string[];
export declare function extractBlock(agents: string): string;
export declare function checksumLine(name: string, content: string | Buffer): string;
export declare function buildWorkspaceAssets(outDir: string, root: string): string[];
