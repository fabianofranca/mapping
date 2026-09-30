/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const base = {
  base: './',
  plugins: [preact(), viteSingleFile()],
};

export default defineConfig({
  ...base,
  test: {
    projects: [
      {
        ...base,
        // src/model/ precisa rodar em Node puro: será reutilizado pelo servidor MCP.
        test: {
          name: 'model',
          environment: 'node',
          include: ['tests/model/**/*.test.ts'],
        },
      },
      {
        ...base,
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: ['tests/model/**'],
        },
      },
    ],
  },
});
