import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const external = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    target: 'node26',
    outDir: 'dist',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: 'cli/cli.ts',
      formats: ['cjs'],
      fileName: () => 'cli.sea.cjs'
    },
    rolldownOptions: {
      platform: 'node',
      external,
      output: {
        codeSplitting: false
      }
    }
  }
});
