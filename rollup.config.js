// import babel from 'rollup-plugin-babel';
import json from 'rollup-plugin-json';
import builtins from 'rollup-plugin-node-builtins';
import nodeResolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import commonjs from 'rollup-plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import builtinModules from 'builtin-modules';
import pkg from './package.json';

function parseName(name) {
  return name
      .replace('@', '')
      .replace('/', '-')
      .split('-')
      .map((x, i) => (i > 0 ? x[0].toUpperCase() + x.slice(1) : x))
      .join('');
}

const extensions = ['.ts', '.js', '.mjs'];
const resolveOptions = {
  mainFields: ['collection:main', 'jsnext:main', 'es2017', 'es2015', 'module', 'main'],
  preferBuiltins: true,
  extensions,
  modulesOnly: true,
  browser: true,
};
const plugins = {
  json: json({
    exclude: 'node_modules/**',
    preferConst: true,
    indent: '  ',
  }),
  nodeResolve: nodeResolve(resolveOptions),
  builtins: builtins(),
  typescript: typescript({
    useTsconfigDeclarationDir: false,
    objectHashIgnoreUnknownHack: true,
  }),
  commonjs: commonjs(),
};

function rollupConfig(pkg, options = {}) {
  const output = [
    { file: pkg.main, format: 'cjs', sourcemap: false },
    { file: pkg.module, format: 'es', sourcemap: false }];
  const outputMin = [];
  if (pkg.iife) {
    outputMin.push({ file: pkg.iife, name: parseName(pkg.name), format: 'iife', sourcemap: true });
  }
  if (pkg.umd) {
    outputMin.push({ file: pkg.umd, name: parseName(pkg.name), format: 'umd', sourcemap: true });
  }

  const baseBuild = {
    input: 'src/index.ts',
    output,
    treeshake: true,
    plugins: Object.values(plugins),
    external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {}), ...builtinModules],
  };

  const buildSrc = {
    ...baseBuild,
  };
  const buildCli = {
    ...baseBuild,
    input: 'cli/cli.ts',
    output: { file: 'bin/cli.js', format: 'cjs', sourcemap: false },
  };

  const result = [
    {
      ...buildSrc,
      ...options,
    },
    {
      ...buildCli,
      ...options,
    },
  ];

  if (outputMin.length) {
    result.push({
      ...baseBuild,
      external: [],
      output: outputMin,
      plugins: [...Object.values(plugins), terser()],
      ...options,
    });
  }

  return result;
}

export default rollupConfig(pkg);
