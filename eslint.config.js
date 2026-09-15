// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * DONNA V2 ESLint flat config.
 *
 * Beyond baseline TS linting, this encodes the architectural import
 * boundaries from the Greenfield V2 Technical Plan (§2). The rules are
 * scoped by path so they activate automatically as packages/apps are added
 * in later phases; nothing here depends on those packages existing yet.
 */
const PROVIDER_SDK_PATTERNS = [
  '@anthropic-ai/*',
  'openai',
  '@slack/*',
  'googleapis',
  '@octokit/*',
  'playwright',
  'playwright-core',
  'puppeteer',
  'ollama',
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', '**/.turbo/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Boundary: provider SDKs may only be imported inside packages/adapters/*.
    // Feature/domain packages talk to stable adapter contracts, never vendors.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: PROVIDER_SDK_PATTERNS,
              message:
                'Provider SDKs may only be imported inside packages/adapters/*. Depend on the adapter contract instead (see Technical Plan §7).',
            },
          ],
        },
      ],
    },
  },
  {
    // Adapters are the one place vendor SDKs are allowed.
    files: ['packages/adapters/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Boundary: core-domain is pure — no framework/runtime deps, no adapters.
    files: ['packages/core-domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@donna/*', ...PROVIDER_SDK_PATTERNS],
              message:
                'packages/core-domain must stay dependency-free (Technical Plan §2). Keep it pure domain logic.',
            },
          ],
        },
      ],
    },
  },
  {
    // Boundary: the web app calls the control-plane API; it never imports the
    // database or the policy engine directly.
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@donna/db', '@donna/db/*', '@donna/policy', '@donna/policy/*'],
              message:
                'apps/web must call the control-plane API, not import db/policy directly (Technical Plan §2).',
            },
          ],
        },
      ],
    },
  },
  {
    // Test files may be looser.
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
