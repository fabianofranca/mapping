import { SPEC_FORMAT_VERSION } from '../src/model/spec';
import { SCHEMA_VERSION } from '../src/model/types';
import agentGuide from '../docs/AGENT-GUIDE.md?raw';
import commentFormat from '../docs/COMMENT-FORMAT.md?raw';
import componentFormat from '../docs/COMPONENT-FORMAT.md?raw';
import format from '../docs/FORMAT.md?raw';
import signatureFormat from '../docs/SIGNATURE-FORMAT.md?raw';
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
    description: `Referência do mapping.json (schema v${SCHEMA_VERSION}): imagens, marcações, camadas, anotações, referências de código e origem externa.`,
    text: format,
  },
  {
    name: 'spec-format',
    uri: 'mapping-docs://SPEC-FORMAT.md',
    title: 'Formato da especialização',
    description: `Formato do arquivo de especialização (formatVersion 1 a ${SPEC_FORMAT_VERSION}): camadas, tipos de anotação, campos, referências, plataformas, origens e, na v4, o pacote da biblioteca (componentes, documentos, exemplos, fontes, origens executáveis e contrato de versão) e, na v8, sugestões nos campos de texto; na v16, as fichas de assinatura, fieldModels, calls e formats.`,
    text: specFormat,
  },
  {
    name: 'signature-format',
    uri: 'mapping-docs://SIGNATURE-FORMAT.md',
    title: 'Formato da ficha de assinatura',
    description:
      'Formato da ficha de assinatura de um componente (mapping-signature, formatVersion 1): a origem, os parâmetros com papel, tipo, padrão e valor, as fábricas e a documentação; a especialização v16 a cita em code.signature.',
    text: signatureFormat,
  },
  {
    name: 'component-format',
    uri: 'mapping-docs://COMPONENT-FORMAT.md',
    title: 'Formato do componente',
    description:
      'Formato do arquivo de componente da biblioteca (mapping-component): template, tamanhos e dimensionamento, expressões e avisos do motor de desenho.',
    text: componentFormat,
  },
  {
    name: 'comment-format',
    uri: 'mapping-docs://COMMENT-FORMAT.md',
    title: 'Formato da conversa',
    description:
      'Formato da conversa ancorada (mapping-thread, formatVersion 1): o arquivo em comments/, as mensagens, as nove âncoras, o que é derivado (aguardando, assunto, órfã), quem grava o quê, a gramática da referência e a citação.',
    text: commentFormat,
  },
];
