import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: undefined, // change to 'index.html' if needed SPA fallback
			precompress: true, // generates .gz i .br
			strict: true
		}),

		paths: {
			base: process.env.BASE_PATH ?? '' // eg. /privacy-playground pwith GitHub Pages
		},

		prerender: {
			entries: ['*'] // Renders all pages static
		}
	}
};

export default config;
