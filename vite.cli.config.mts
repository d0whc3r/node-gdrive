import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

const external = [...builtinModules, ...builtinModules.map((m) => `node:${m}`), ...Object.keys(pkg.dependencies ?? {})];

export default defineConfig({
  build: {
    target: 'node26',
    outDir: 'bin',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: 'cli/cli.ts',
      formats: ['cjs'],
      fileName: () => 'cli.js'
    },
    rolldownOptions: {
      platform: 'node',
      external,
      output: {
        banner: '#!/usr/bin/env node'
      }
    }
  }
});
