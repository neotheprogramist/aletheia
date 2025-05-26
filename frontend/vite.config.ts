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
	// Prevent bb.js from being pre-bundled by Vite’s optimizer
	optimizeDeps: {
		exclude: ['@aztec/bb.js']
	},

	// Allow Vite dev server to read worker files from node_modules
	server: {
		fs: {
			allow: ['node_modules/@aztec/bb.js/dest/browser']
		}
	},

	plugins: [
		tailwindcss(),

		// === bb.js worker fix for dev mode ===
		{
			...serveStatic([
				{
					// match both unhashed and hashed main.worker files
					pattern: /main\.worker.*\.js$/,
					resolve: 'node_modules/@aztec/bb.js/dest/browser/main.worker.js'
				},
				{
					// match thread.worker if used
					pattern: /thread\.worker.*\.js$/,
					resolve: 'node_modules/@aztec/bb.js/dest/browser/thread.worker.js'
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
