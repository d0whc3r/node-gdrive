const merge = require('webpack-merge');
const path = require('path');
const basicConfig = require('./basic');

module.exports = merge(basicConfig, {
  entry: './src/index.ts',
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, '..', 'dist'),
  },
});
