import { initShaper } from '../../mcp/image/harfbuzz';

// `setupFiles` of the MCP test projects (`mcp`, `perf-mcp`, `scale-mcp`): HarfBuzz starts from the embedded bytes
// before each test file, as `mcp/main.ts` does at startup, so the synchronous face API is ready.
await initShaper();
