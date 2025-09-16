import convexPlugin from '@convex-dev/eslint-plugin';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	{
		ignores: [
			'src/convex/_generated/**/*.{ts,tsx,js}',
			'.nitro/**/*.{ts,tsx,js}',
			'**/*/routeTree.gen.ts',
		],
	},
	// Other configurations
	...convexPlugin.configs.recommended,
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			parser: typescriptParser,
		},
		plugins: {
			'@typescript-eslint': typescriptPlugin,
		},
		rules: {
			// Disable the base rule as it can report incorrect errors
			'no-unused-vars': 'off',
			// The T-ESLint rule is more robust for TS/TSX
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					args: 'all',
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					ignoreRestSiblings: true,
				},
			],
		},
	},
]);
