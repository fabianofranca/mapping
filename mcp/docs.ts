import { SPEC_FORMAT_VERSION } from '../src/model/spec';
import { SCHEMA_VERSION } from '../src/model/types';
import agentGuide from '../docs/AGENT-GUIDE.md?raw';
import commentFormat from '../docs/COMMENT-FORMAT.md?raw';
import componentFormat from '../docs/COMPONENT-FORMAT.md?raw';
import format from '../docs/FORMAT.md?raw';
import signatureFormat from '../docs/SIGNATURE-FORMAT.md?raw';
import specFormat from '../docs/SPEC-FORMAT.md?raw';

/** Documentation served as MCP resources. The text is embedded in the single file at build time. */
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
    title: 'Agent guide',
    description:
      'How to use the Mapping tools: typical flow, mapping:// references, cropping best practices.',
    text: agentGuide,
  },
  {
    name: 'format',
    uri: 'mapping-docs://FORMAT.md',
    title: 'mapping.json format',
    description: `Reference for mapping.json (schema v${SCHEMA_VERSION}): images, markings, layers, annotations, code references and external source.`,
    text: format,
  },
  {
    name: 'spec-format',
    uri: 'mapping-docs://SPEC-FORMAT.md',
    title: 'Specialization format',
    description: `Format of the specialization file (formatVersion 1 to ${SPEC_FORMAT_VERSION}): layers, annotation types, fields, references, platforms, sources and, in v4, the library package (components, documents, examples, sources, executable sources and version contract) and, in v8, suggestions in text fields; in v16, the signature sheets, fieldModels, calls and formats.`,
    text: specFormat,
  },
  {
    name: 'signature-format',
    uri: 'mapping-docs://SIGNATURE-FORMAT.md',
    title: 'Signature sheet format',
    description:
      'Format of a component\'s signature sheet (mapping-signature, formatVersion 1): the source, the parameters with role, type, default and value, the factories and the documentation; the v16 specialization cites it in code.signature.',
    text: signatureFormat,
  },
  {
    name: 'component-format',
    uri: 'mapping-docs://COMPONENT-FORMAT.md',
    title: 'Component format',
    description:
      'Format of the library component file (mapping-component): template, sizes and sizing, expressions and warnings of the rendering engine.',
    text: componentFormat,
  },
  {
    name: 'comment-format',
    uri: 'mapping-docs://COMMENT-FORMAT.md',
    title: 'Conversation format',
    description:
      'Format of the anchored conversation (mapping-thread, formatVersion 1): the file in comments/, the messages, the nine anchors, what is derived (awaiting, subject, orphan), who writes what, the reference grammar and the citation.',
    text: commentFormat,
  },
];
