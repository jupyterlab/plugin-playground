const eslintJs = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const jupyterPlugin = require('@jupyter/eslint-plugin');
const eslintConfigPrettier = require('eslint-config-prettier');

const tsEslintRecommendedOverrides =
  tsPlugin.configs['eslint-recommended'].overrides?.[0]?.rules ?? {};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'lib/**',
      'coverage/**',
      'jupyterlab_plugin_playground/labextension/**',
      '**/*.d.ts',
      'tests/**',
      'src/modules.ts',
      'docs/content/**',
      'docs/_contents/**',
      'docs/_build/**',
      'extension-examples/**',
      'ui-tests/test-results/**'
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      jupyter: jupyterPlugin
    },
    rules: {
      ...eslintJs.configs.recommended.rules,
      ...tsEslintRecommendedOverrides,
      ...tsPlugin.configs.recommended.rules,
      ...jupyterPlugin.configs.recommended.rules,
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: true
          }
        }
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-use-before-define': 'off',
      quotes: [
        'error',
        'single',
        { avoidEscape: true, allowTemplateLiterals: false }
      ],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'smart'],
      'prefer-arrow-callback': 'error',
      'jupyter/command-described-by': 'warn',
      'jupyter/plugin-description': 'warn'
    }
  },
  eslintConfigPrettier
];
