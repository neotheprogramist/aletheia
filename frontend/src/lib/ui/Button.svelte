<script lang="ts">
	export let type: 'button' | 'submit' | 'reset' = 'button';
	export let text: string = 'Click';
	export let onClick: () => void = () => {};
	export let class_: string = '';
	export let loading: boolean = false;
	export let loadingText: string = 'Processing...';
</script>

<button
	{type}
	disabled={loading}
	class="button flex items-center justify-center gap-2 rounded px-4 py-2 transition-all
		{loading ? '!cursor-not-allowed opacity-50' : 'cursor-pointer'}
		{class_}"
	on:click={!loading ? onClick : undefined}
	aria-busy={loading}
	aria-disabled={loading}
>
	{#if loading}
		<svg
			class="h-4 w-4 animate-spin text-white"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
		>
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
			<path
				class="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			/>
		</svg>
	{/if}
	<span>{loading ? loadingText : text}</span>
</button>
