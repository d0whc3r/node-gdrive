import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

const external = [...builtinModules, ...builtinModules.map((m) => `node:${m}`), ...Object.keys(pkg.dependencies ?? {})];

export default defineConfig({
  build: {
    target: 'node26',
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['cjs', 'es'],
      fileName: (format) => (format === 'cjs' ? 'gdrive.cjs.js' : 'gdrive.esm.js')
    },
    rolldownOptions: {
      platform: 'node',
      external
    }
  }
});
