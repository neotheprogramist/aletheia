import { config } from 'dotenv-safe';
config({
	example: '.env.example',
	path: '.env'
});

import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import serveStatic from 'vite-plugin-serve-static';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),

		// === Garaga / bb.js worker fix for dev mode ===
		{
			...serveStatic([
				{
					pattern: /main\.worker\.js$/,
					resolve: 'node_modules/@aztec/bb.js/dest/browser/main.worker.js'
				}
			]),
			apply: 'serve'
		},

		sveltekit()
	],

	test: {
		workspace: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
