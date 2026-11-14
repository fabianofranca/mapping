// What the CLI hands to each reader: the texts already read and the argument values. The code
// readers (`kotlin`, `swift`) receive a source file and a symbol; the design one (`figma`), the
// saved JSON and the node id.

export interface FileText {
  /** The name as it came on the command line (goes in the messages). */
  readonly name: string;
  readonly text: string;
}

export interface CodeRequest {
  readonly file: FileText;
  readonly also: readonly FileText[];
  readonly symbol: string;
  /** `source.path`, already decided by the CLI. */
  readonly path: string;
  readonly ref?: string;
  /** `kotlin` only (`--overload`). */
  readonly overload?: number;
  /** `swift` only (`--init`). */
  readonly init?: number;
}

export interface DesignRequest {
  readonly file: FileText;
  /** The Figma node id (`12:34`; `12-34`, as in the URL, also works). */
  readonly node: string;
}
