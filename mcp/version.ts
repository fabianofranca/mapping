/** Versão do servidor MCP (a tag de release é `mcp-v<versão>`). Uma versão por épico. */
export const SERVER_NAME = 'mapping';
export const SERVER_VERSION = '0.9.1';

declare const __MCP_BUILD_SUFFIX__: string | undefined;

/** Versão que o servidor anuncia: `SERVER_VERSION` mais o sufixo do canal (`-snapshot.pr172+abc1234`, `-rc.2`), posto pelo build; vazio na estável. */
export const BUILD_VERSION =
  SERVER_VERSION + (typeof __MCP_BUILD_SUFFIX__ === 'string' ? __MCP_BUILD_SUFFIX__ : '');
