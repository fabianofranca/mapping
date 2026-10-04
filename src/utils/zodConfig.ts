import { z } from 'zod';

// A CSP não permite `unsafe-eval` (docs/ARCHITECTURE.md, "CSP"). O zod gera validadores
// com `new Function` e testa se isso é possível; com `jitless` ele nem tenta e usa o
// caminho interpretado, sem violação de CSP no console. Importado primeiro por `main.tsx`.
z.config({ jitless: true });
