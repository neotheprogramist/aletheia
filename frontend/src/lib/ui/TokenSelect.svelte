<script lang="ts">
	import type { TokenConfig } from '$lib/config/tokens';

	export let tokens: TokenConfig[] = [];
	export let value: string = '';
	export let placeholder: string = 'Select token';
	export let class_: string = '';

	let isOpen = false;

	function select(addr: string) {
		value = addr;
		isOpen = false;
	}
</script>

<div class={`relative w-full ${class_}`}>
	<button
		type="button"
		on:click={() => (isOpen = !isOpen)}
		class="input flex w-full items-center justify-between rounded p-2"
	>
		{#if value}
			{#each tokens as token (token.address)}
				{#if token.address === value}
					<div class="flex items-center gap-2">
						<img src={token.logoPath} alt="logo" class="h-5 w-5 object-contain" />
						<span class="text-sm">
							{token.symbol ?? token.address.slice(0, 6) + '…' + token.address.slice(-4)}
						</span>
					</div>
				{/if}
			{/each}
		{:else}
			<span class="text-sm text-gray-400">{placeholder}</span>
		{/if}
		<svg class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if isOpen}
		<div
			class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-card)] shadow"
		>
			{#each tokens as token (token.address)}
				<div
					role="button"
					tabindex="0"
					on:click={() => select(token.address)}
					on:keydown={(e) => e.key === 'Enter' && select(token.address)}
					class="flex cursor-pointer items-center gap-2 p-2 text-sm hover:bg-[var(--color-background)]"
					class:selected={value === token.address}
				>
					<img src={token.logoPath} alt="logo" class="h-5 w-5 object-contain" />
					<span>{token.symbol ?? token.address.slice(0, 6) + '…' + token.address.slice(-4)}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.selected {
		outline: 2px solid var(--color-primary);
	}
</style>
