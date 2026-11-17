import { defineConfig } from 'vitest/config';
export default defineConfig({
  define: { __DEV__: 'false', __DEV_TOKEN__: '""', __DEV_PORT__: '0', __BUILD_ID__: '"test"' },
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
});
