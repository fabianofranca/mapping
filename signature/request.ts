// O que a CLI entrega a cada leitor: os textos já lidos e os valores dos argumentos. Os leitores
// de código (`kotlin`, `swift`) recebem um arquivo-fonte e um símbolo; o de design (`figma`), o
// JSON salvo e o id do nó.

export interface FileText {
  /** O nome como veio na linha de comando (vai nas mensagens). */
  readonly name: string;
  readonly text: string;
}

export interface CodeRequest {
  readonly file: FileText;
  readonly also: readonly FileText[];
  readonly symbol: string;
  /** `source.path`, já decidido pela CLI. */
  readonly path: string;
  readonly ref?: string;
  /** Só do `kotlin` (`--overload`). */
  readonly overload?: number;
  /** Só do `swift` (`--init`). */
  readonly init?: number;
}

export interface DesignRequest {
  readonly file: FileText;
  /** O id do nó do Figma (`12:34`; `12-34`, como na URL, também vale). */
  readonly node: string;
}
