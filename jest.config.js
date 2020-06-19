module.exports = {
  moduleFileExtensions: ['js', 'jsx', 'json', 'ts', 'tsx'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testMatch: ['**/tests/**/*.spec.(js|jsx|ts|tsx)', '**/__tests__/*.(js|jsx|ts|tsx)'],
  testURL: 'http://localhost/',
  collectCoverage: false,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  cache: false,
  testResultsProcessor: 'jest-sonar-reporter',
  reporters: ['default', 'jest-junit'],
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['./jest.setup-after-env.js'],
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      // tsConfig: 'tsconfig.json',
      tsConfig: {
        sourceMap: true,
        inlineSourceMap: true
      },
      diagnostics: true
    }
    // 'ts-jest': {
    //   babelConfig: false,
    // },
  }
};
