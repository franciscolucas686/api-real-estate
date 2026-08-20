import pkg from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';
const { FlatESLintConfig } = pkg;

export default /** @type {FlatESLintConfig} */ [
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**'],
  },
  {
    // `test/**` entra aqui de propósito: o glob do script de lint sempre incluiu os e2e,
    // mas sem esta linha nenhum bloco de config casava com eles e o ESLint os tratava como
    // arquivos sem regra alguma — cinco specs passando pelo portão sem serem lintados.
    files: ['src/**/*.ts', 'src/**/*.tsx', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
];
