<script>
	import { theme } from '$lib/stores/theme';
	import { Sun, Moon } from 'lucide-svelte';

	function toggleTheme() {
		theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
		document.documentElement.classList.toggle('light');
	}
</script>

<button
	on:click={toggleTheme}
	class="rounded-full p-2 transition-all hover:bg-gray-600 dark:hover:bg-gray-400"
>
	{#if $theme === 'dark'}
		<Moon size="24" class="text-white" />
	{:else}
		<Sun size="24" class="text-black" />
	{/if}
</button>
