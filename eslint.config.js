import neo, { resolveIgnoresFromGitignore, plugins } from 'neostandard';

// const stylisticRules = plugins['@stylistic'].configs['all-flat'];
const typescriptEslintRules = plugins['typescript-eslint'].configs.recommended;

export default [
  ...neo({
    ts: true,
    semi: true,
    ignores: resolveIgnoresFromGitignore()
  }),
  // stylisticRules,
  ...typescriptEslintRules,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ],
      '@stylistic/no-trailing-spaces': 'off',
      '@stylistic/jsx-quotes': 'off',
      '@stylistic/space-before-function-paren': 'off',
      '@stylistic/quotes': 'off',
      '@typescript-eslint/quotes': 'off',
      '@stylistic/semi': 'off',
      '@stylistic/multiline-comment-style': 'off',
      '@stylistic/function-call-argument-newline': 'off',
      '@stylistic/lines-around-comment': 'off',
      '@stylistic/comma-dangle': 'off',
      '@stylistic/array-element-newline': 'off',
      '@stylistic/no-multiple-empty-lines': 'off',
      '@stylistic/jsx-closing-bracket-location': 'off',
      'import-x/order': [
        'warn',
        {
          'newlines-between': 'always',
          groups: [
            'builtin',
            'internal',
            'external',
            'sibling',
            'parent',
            'index'
          ],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true
          }
        }
      ]
    }
  }
];
