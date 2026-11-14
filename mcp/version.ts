/** MCP server version (the release tag is `mcp-v<version>`). One version per epic. */
export const SERVER_NAME = 'mapping';
export const SERVER_VERSION = '0.41.0';

declare const __MCP_BUILD_SUFFIX__: string | undefined;

/** Version the server announces: `SERVER_VERSION` plus the channel suffix (`-snapshot.pr172+abc1234`, `-rc.2`), set by the build; empty on the stable release. */
export const BUILD_VERSION =
  SERVER_VERSION + (typeof __MCP_BUILD_SUFFIX__ === 'string' ? __MCP_BUILD_SUFFIX__ : '');
