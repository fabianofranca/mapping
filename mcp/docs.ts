import agentGuide from '../docs/AGENT-GUIDE.md?raw';
import format from '../docs/FORMAT.md?raw';
import specFormat from '../docs/SPEC-FORMAT.md?raw';

/** Documentação servida como recursos MCP. O texto é embutido no arquivo único no build. */
export interface DocResource {
  readonly name: string;
  readonly uri: string;
  readonly title: string;
  readonly description: string;
  readonly text: string;
}

export const DOC_RESOURCES: readonly DocResource[] = [
  {
    name: 'agent-guide',
    uri: 'mapping-docs://AGENT-GUIDE.md',
    title: 'Guia do agente',
    description:
      'Como usar as tools do Mapping: fluxo típico, referências mapping://, boas práticas de recorte.',
    text: agentGuide,
  },
  {
    name: 'format',
    uri: 'mapping-docs://FORMAT.md',
    title: 'Formato do mapping.json',
    description:
      'Referência do mapping.json (schema v8): imagens, marcações, camadas, anotações, referências de código e origem externa.',
    text: format,
  },
  {
    name: 'spec-format',
    uri: 'mapping-docs://SPEC-FORMAT.md',
    title: 'Formato da especialização',
    description:
      'Formato do arquivo de especialização (camadas, tipos de anotação, campos e referências).',
    text: specFormat,
  },
];
