import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import ViteRestart from 'vite-plugin-restart';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [
		ViteRestart({
			restart: ['./src/styles/**/*.css'],
		}),
		tsConfigPaths({
			projects: ['./tsconfig.json'],
		}),
		tailwindcss(),
		tanstackStart({
			tsr: {
				srcDirectory: 'src',
			},
			target: 'cloudflare-module',
			customViteReactPlugin: true,
		}),
		viteReact(),
	],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			// Force node: prefix for built-ins
			path: 'node:path',
			fs: 'node:fs',
			os: 'node:os',
			crypto: 'node:crypto',
		},
	},
	ssr: {
		external: ['node:path', 'node:fs', 'node:os', 'node:crypto'],
		// Don't externalize these without node: prefix
		noExternal: ['path', 'fs', 'os', 'crypto'],
	},
});
