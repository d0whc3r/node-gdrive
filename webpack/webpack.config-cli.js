const merge = require('webpack-merge');
const path = require('path');
const basicConfig = require('./basic');

module.exports = merge(basicConfig, {
  entry: './cli/cli.ts',
  output: {
    filename: 'cli.js',
    path: path.resolve(__dirname, '..', 'bin'),
  },
});
