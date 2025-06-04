<script context="module" lang="ts">
	export type WithdrawMode = 'withdraw' | 'fee';
	export type SwapMode = 'swap' | 'fee';
	export type TransferMode = 'transfer' | 'fee';
	export type MergeMode = 'merge1' | 'merge2' | 'fee';
</script>

<script lang="ts">
	export let mode: WithdrawMode | TransferMode | MergeMode | SwapMode = 'fee';
	export let action: 'withdraw' | 'transfer' | 'merge' | 'swap' = 'withdraw';
</script>

<p class="mb-4 font-medium">
	{#if action === 'withdraw'}
		{#if mode === 'withdraw'}
			Select a deposit to <strong>withdraw</strong> from:
		{:else}
			Select a deposit to pay <strong>fee</strong>:
		{/if}
	{:else if action === 'swap'}
		{#if mode === 'swap'}
			Select a deposit to <strong>swap</strong>:
		{:else}
			Select a deposit to pay <strong>fee</strong>:
		{/if}
	{:else if action === 'transfer'}
		{#if mode === 'transfer'}
			Select deposit to <strong>transfer</strong> from:
		{:else}
			Select a deposit to pay <strong>fee</strong>:
		{/if}
	{:else if mode === 'merge1'}
		Select <strong>first</strong> deposit to <strong>merge</strong>:
	{:else if mode === 'merge2'}
		Select <strong>second</strong> deposit to <strong>merge</strong>:
	{:else}
		Select a deposit to pay <strong>fee</strong>:
	{/if}
</p>

<p class="mb-2 text-sm text-gray-600 dark:text-gray-300">
	Select a token to filter the list of available deposits:
</p>
