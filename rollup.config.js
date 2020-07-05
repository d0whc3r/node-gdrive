import autoExternal from 'rollup-plugin-auto-external';
import esbuild from 'rollup-plugin-esbuild';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import builtinModules from 'builtin-modules';
import pkgJson from './package.json';

export default function odpRollupConfig(options) {
  const resolveOptions = {
    mainFields: ['jsnext:main', 'es2020', 'es2018', 'es2017', 'es2015', 'module', 'main'],
    preferBuiltins: true,
    extensions: ['.ts', '.js', '.mjs', '.node'],
    modulesOnly: false,
    browser: false
  };
  const plugins = [
    json(),
    autoExternal({
      builtins: true,
      peerDependencies: true,
      dependencies: true
    }),
    nodeResolve(resolveOptions),
    esbuild({
      minify: true,
      target: 'esnext'
    })
  ];

  const external = [...builtinModules];
  const outputMain = {
    input: 'src/index.ts',
    treeshake: true,
    output: [{ sourcemap: false, file: pkgJson.main, format: 'cjs' }],
    plugins,
    external,
    ...options
  };
  const outputModule = {
    ...outputMain,
    output: [{ sourcemap: false, file: pkgJson.module, format: 'esm' }]
  };
  return [
    outputMain,
    outputModule,
    {
      ...outputMain,
      input: 'cli/cli.ts',
      output: [{ sourcemap: false, file: 'bin/cli.js', format: 'cjs', banner: '#!/usr/bin/env node' }]
    }
  ];
}
