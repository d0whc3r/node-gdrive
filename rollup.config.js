import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import findNodeModules from 'find-node-modules';
import builtinModules from 'builtin-modules';
import pkgJson from './package.json';
import fs from 'fs';
import path from 'path';

let CHECKED_DEPS = [];

export default function odpRollupConfig(options) {
  const extensions = ['.ts', '.js', '.mjs'];
  const resolveOptions = {
    mainFields: ['jsnext:main', 'es2017', 'es2015', 'module', 'main'],
    preferBuiltins: true,
    extensions,
    modulesOnly: true,
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
    nodeResolve(resolveOptions),
    typescript({
      useTsconfigDeclarationDir: false,
      tsconfigOverride: {
        compilerOptions: { module: 'esnext' }
      }
    }),
    commonjs(),
    terser()
  ];

  function getContent(dir) {
    return JSON.parse(fs.readFileSync(dir, 'utf8'));
  }

  function getDependencies(pkg) {
    return [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})];
  }

  function getAllDependencies(dep) {
    let result = [];
    findNodeModules()
      .map((dir) => path.resolve(process.cwd(), dir))
      .forEach((dir) => {
        const depPkg = path.join(dir, dep, 'package.json');
        if (fs.existsSync(depPkg)) {
          const content = getContent(depPkg);
          const deps = getDependencies(content);
          deps.forEach((d) => {
            if (!CHECKED_DEPS.includes(d)) {
              CHECKED_DEPS = [...CHECKED_DEPS, d];
              result = [...result, ...getAllDependencies(d)];
            }
          });
          result = [...result, ...deps];
        }
      });
    return result;
  }

  function filterDependencies(pkg, deps) {
    const { devDependencies } = pkg;
    let result = [...deps];
    if (devDependencies) {
      result = result.filter((d) => !Object.keys(devDependencies).includes(d));
    }
    return result.filter((dep, index, array) => array.indexOf(dep) === index);
  }

  function getRecursiveDependencies(pkg) {
    const deps = getDependencies(pkg);
    let result = [...deps];
    deps.forEach((dep) => {
      CHECKED_DEPS = [...CHECKED_DEPS, dep];
      result = [...result, ...getAllDependencies(dep)];
    });
    return filterDependencies(pkg, result);
  }

  const external = [...getRecursiveDependencies(pkgJson), ...builtinModules];
  const outputConfig = { sourcemap: false, globals: {} };
  const output = {
    input: 'src/index.ts',
    treeshake: true,
    output: [
      { ...outputConfig, file: pkgJson.main, format: 'cjs' },
      { ...outputConfig, file: pkgJson.module, format: 'es' }
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
