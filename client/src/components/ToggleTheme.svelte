<script lang="ts">
	import { theme } from '$lib/stores/theme';
	import { Sun, Moon } from 'lucide-svelte';

	function toggleTheme() {
		theme.update((t) => {
			const newTheme = t === 'dark' ? 'light' : 'dark';
			document.documentElement.classList.toggle('light', newTheme === 'light');
			return newTheme;
		});
	}
</script>

<button
	on:click={toggleTheme}
	class="cursor-pointer rounded-full p-2 transition-colors hover:bg-gray-700 dark:hover:bg-gray-300"
	aria-label="Toggle theme"
>
	{#if $theme === 'dark'}
		<Moon size="24" class="text-white" />
	{:else}
		<Sun size="24" class="text-black" />
	{/if}
</button>
