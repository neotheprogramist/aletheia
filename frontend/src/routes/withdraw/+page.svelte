<script lang="ts">
	import { onMount } from 'svelte';
	import PaginatedTable, { type Column } from '$lib/ui/PaginatedTable.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { wrapWithToast } from '$lib/utils/toast';
	import type { Operation } from '$lib/privacy/types';
	import { getAllByStatus } from '$lib/db/operations';

	let deposits: Operation[] = [];
	let selectedKey: number | null = null;
	$: selectedDeposit = deposits.find((d) => d.index === selectedKey) ?? null;

	const columns: Column<Operation>[] = [
		{ label: 'Index', field: 'index' },
		{ label: 'Amount', field: (d) => d.data?.amount },
		{
			label: 'Token',
			field: (d) => d.data?.tokenAddress,
			render: (d) => `<code>${d.data?.tokenAddress}</code>`
		}
	];

	onMount(async () => {
		await wrapWithToast(async () => (deposits = await getAllByStatus('confirmed')), {
			loading: '⏳ Loading…',
			success: '',
			error: '❌ Load error'
		});
	});
</script>

<div class="flex flex-col items-center space-y-6">
	<div class="mx-auto w-full max-w-4xl">
		<PaginatedTable items={deposits} {columns} pageSize={5} keyField="index" bind:selectedKey />
	</div>

	{#if selectedDeposit}
		<Card title={`Selected Deposit #${selectedDeposit.index}`}>
			<div class="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
				<div class="text-muted font-medium">Index:</div>
				<div>{selectedDeposit.index}</div>

				<div class="text-muted font-medium">Amount:</div>
				<div>{selectedDeposit.data?.amount}</div>

				<div class="text-muted font-medium">Token Address:</div>
				<div class="overflow-x-auto">
					<code class="break-all">
						{selectedDeposit.data?.tokenAddress}
					</code>
				</div>
			</div>
		</Card>
	{/if}
</div>
