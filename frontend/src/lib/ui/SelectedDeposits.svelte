<script lang="ts">
	import Card from '$lib/ui/Card.svelte';
	import type { DisplayOperation } from '$lib/utils/loadDepositsForToken';

	export let items: { title: string; deposit: DisplayOperation | null }[] = [];
</script>

{#if items.some((item) => item.deposit)}
	<div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
		{#each items as item (item.title)}
			{#if item.deposit}
				<Card title={item.title}>
					<div class="space-y-2 text-sm">
						<div>
							<strong>Index:</strong>
							{item.deposit.index}
						</div>
						<div>
							<strong>Amount:</strong>
							{item.deposit.displayAmount}
						</div>
					</div>
				</Card>
			{/if}
		{/each}
	</div>
{/if}
