module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:prettier/recommended', 'plugin:sonarjs/recommended'],
  plugins: ['sonarjs'],
  parserOptions: {
    ecmaVersion: 2019,
    sourceType: 'module',
    project: `./tsconfig.json`
  },
  env: {
    browser: true,
    node: true,
    es6: true
  },
  overrides: [
    {
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'prettier/@typescript-eslint'
      ],
      rules: {
        // Resets
        '@typescript-eslint/camelcase': 0,
        // '@typescript-eslint/explicit-function-return-type': 0,
        '@typescript-eslint/ban-ts-ignore': 0,
        '@typescript-eslint/no-this-alias': 0,
        '@typescript-eslint/no-non-null-assertion': 0,
        // '@typescript-eslint/no-unused-vars': 0,
        '@typescript-eslint/no-empty-interface': 0,
        '@typescript-eslint/no-use-before-define': 0,
        // '@typescript-eslint/no-explicit-any': 0,
        'no-constant-condition': 0,

        // General formatting
        '@typescript-eslint/semi': 2,
        '@typescript-eslint/brace-style': 2,
        '@typescript-eslint/func-call-spacing': 2,

        // tslint
        '@typescript-eslint/explicit-member-accessibility': [
          0,
          {
            overrides: {
              constructors: 0
            }
          }
        ],
        // '@typescript-eslint/no-empty-interface': 2,
        '@typescript-eslint/no-inferrable-types': 2,
        '@typescript-eslint/no-misused-new': 2,
        // '@typescript-eslint/no-non-null-assertion': 2,
        // '@typescript-eslint/no-use-before-define': 2,
        '@typescript-eslint/prefer-function-type': 2,
        // '@typescript-eslint/type-annotation-spacing': 2,
        '@typescript-eslint/unified-signatures': 2,
        '@typescript-eslint/no-shadow': 0,
        '@typescript-eslint/array-type': 2,
        // tsrules
        'require-await': 0,
        '@typescript-eslint/require-await': 0,
        '@typescript-eslint/no-unused-vars': [
          2,
          {
            vars: 'all',
            args: 'after-used',
            ignoreRestSiblings: false,
            varsIgnorePattern: 'h|Host',
            caughtErrors: 'all',
            caughtErrorsIgnorePattern: '^_'
          }
        ],
        '@typescript-eslint/explicit-function-return-type': 0,
        '@typescript-eslint/no-explicit-any': 0,
        '@typescript-eslint/interface-name-prefix': 0,
        '@typescript-eslint/unbound-method': [
          2,
          {
            ignoreStatic: true
          }
        ],
        'no-empty-function': 0,
        '@typescript-eslint/no-empty-function': 2,
        '@typescript-eslint/no-unnecessary-type-assertion': 2
      }
    },
    // Spec files
    {
      files: ['**/*.spec.ts'],
      rules: {
        '@typescript-eslint/unbound-method': 0
      }
    },
    // Test Files
    {
      files: ['**/*.e2e.ts', '**/*.spec.ts'],
      rules: {
        'sonarjs/no-duplicate-string': 0,
        'sonarjs/cognitive-complexity': 0
      },
      env: {
        jest: true
      }
    }
  ],
  rules: {
    // Best practices
    'no-shadow': 2,
    'require-atomic-updates': 2,
    'no-var': 2,
    'prefer-object-spread': 2,
    'no-nested-ternary': 2,
    'no-duplicate-imports': 2,
    // General formatting
    indent: [2, 2, { SwitchCase: 1 }],
    'no-trailing-spaces': 2,
    curly: [2, 'all'],
    'comma-spacing': 2,
    'comma-style': 2,
    'computed-property-spacing': 2,
    // 'func-style': [2, 'expression', { 'allowArrowFunctions': true }],
    'multiline-ternary': [2, 'always-multiline'],
    'operator-linebreak': [2, 'after', { overrides: { '?': 'before', ':': 'before' } }],
    // 'linebreak-style': 2,
    'space-in-parens': 2,

    // 'arrow-body-style': [2, 'as-needed', { 'requireReturnForObjectLiteral': true }],
    'constructor-super': 2,
    'dot-notation': 0,
    // 'eol-last': 2,
    'guard-for-in': 2,
    'no-bitwise': 0,
    'no-caller': 2,
    'no-console': [1],
    'no-debugger': 2,
    'no-empty': 0,
    'no-empty-function': 2,
    'no-fallthrough': 2,
    'no-new-wrappers': 2,
    'no-throw-literal': 2,
    'no-undef-init': 2,
    'no-unused-labels': 2,
    'prefer-const': 2,
    radix: 2,
    'no-shadowed-variable': 0,
    'max-params': [2, 4]
  },
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.vue']
    },
    'import/resolver': {
      typescript: {}
    }
  }
};
