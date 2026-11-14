import { z } from 'zod';

// The CSP does not allow `unsafe-eval` (docs/ARCHITECTURE.md, "CSP"). zod generates validators
// with `new Function` and tests whether that is possible; with `jitless` it does not even try and uses the
// interpreted path, with no CSP violation in the console. Imported first by `main.tsx`.
z.config({ jitless: true });
