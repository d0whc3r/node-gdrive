import autoExternal from 'rollup-plugin-auto-external';
import esbuild from 'rollup-plugin-esbuild';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import builtinModules from 'builtin-modules';
import pkgJson from './package.json';

export default function odpRollupConfig(options) {
  const resolveOptions = {
    mainFields: ['jsnext:main', 'es2017', 'es2015', 'module', 'main'],
    preferBuiltins: true,
    extensions: ['.ts', '.js', '.mjs', '.node'],
    modulesOnly: false,
    browser: true
  };
  const plugins = [
    json({
      exclude: 'node_modules/**',
      preferConst: true,
      compact: true,
      namedExports: true,
      indent: '  '
    }),
    autoExternal({
      builtins: true,
      peerDependencies: true,
      dependencies: true
    }),
    nodeResolve(resolveOptions),
    esbuild({
      minify: true,
      target: 'esnext'
    }),
    commonjs()
  ];

  const external = [...builtinModules];
  const outputConfig = { sourcemap: false, globals: {} };
  const output = {
    input: 'src/index.ts',
    treeshake: true,
    output: [
      { ...outputConfig, file: pkgJson.main, format: 'cjs' },
      { ...outputConfig, file: pkgJson.module, format: 'esm' }
    ],
    plugins,
    external,
    ...options
  };
  return [
    output,
    {
      ...output,
      input: 'cli/cli.ts',
      output: [{ ...outputConfig, file: 'bin/cli.js', format: 'cjs', banner: '#!/usr/bin/env node' }]
    }
  ];
}
