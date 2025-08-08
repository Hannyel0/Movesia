import neostandard, {
  resolveIgnoresFromGitignore,
  plugins
} from 'neostandard';

const tsEslintRules = plugins['typescript-eslint'].configs.recommended;

export default [
  ...neostandard({
    ts: true,
    semi: true,
    noStyle: true,                           // disable all stylistic rules
    ignores: resolveIgnoresFromGitignore()
  }),
  ...tsEslintRules,
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
      // No more @stylistic/... rules needed here
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
