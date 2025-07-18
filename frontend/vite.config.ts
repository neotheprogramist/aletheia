import { config } from 'dotenv-safe';
config({
	example: '.env.example',
	path: '.env'
});

import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import serveStatic from 'vite-plugin-serve-static';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig } from 'vite';

export default defineConfig({
	define: {
		global: 'globalThis'
	},
	resolve: {
		alias: {
			// Pino error fix
			pino: 'pino/browser.js'
		}
	},

	// Prevent bb.js from being pre-bundled by Vite's optimizer
	optimizeDeps: {
		exclude: ['@aztec/bb.js', '@noir-lang/noirc_abi', '@noir-lang/acvm_js'],
		include: ['pino', 'garaga', '@noir-lang/noir_wasm', '@noir-lang/noir_js']
	},

	// Allow Vite dev server  read worker files from node_modules
	server: {
		host: '0.0.0.0',
		port: 5173,
		fs: {
			allow: ['node_modules/@aztec/bb.js/dest/browser']
		}
	},

	plugins: [
		// Dodaj polyfille Node.js na początku listy pluginów
		nodePolyfills({
			globals: {
				Buffer: true,
				global: true,
				process: true
			},
			protocolImports: true
		}),

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
