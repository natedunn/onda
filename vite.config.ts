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
			// Due to hydration issues, we need to restart the server on changes to the following files
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
		},
	},
});
