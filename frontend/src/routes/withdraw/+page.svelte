<script lang="ts">
	import { onMount } from 'svelte';
	import PaginatedTable, { type Column } from '$lib/ui/PaginatedTable.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { wrapWithToast } from '$lib/utils/toast';
	import type { Operation } from '$lib/privacy/types';
	import { getAllByStatus } from '$lib/db/operations';

	let deposits: Operation[] = [];

	// tryb wyboru: 'withdraw' lub 'fee'
	let selectionMode: 'withdraw' | 'fee' = 'withdraw';

	// wybrany withdraw
	let selectedWithdrawIndex: number | null = null;
	let selectedWithdrawDeposit: Operation | null = null;

	// wybrany fee
	let selectedFeeIndex: number | null = null;
	let selectedFeeDeposit: Operation | null = null;

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

	function handleRowClick(event: CustomEvent<number>) {
		const idx = event.detail;
		if (selectionMode === 'withdraw') {
			selectedWithdrawIndex = idx;
			selectedWithdrawDeposit = deposits[idx];
		} else {
			selectedFeeIndex = idx;
			selectedFeeDeposit = deposits[idx];
		}
	}

	// gdy w trybie 'withdraw', wyłącz indeks z fee; w trybie 'fee' — wyłącz withdraw
	$: disabledIndexes =
		selectionMode === 'withdraw'
			? selectedFeeIndex !== null
				? [selectedFeeIndex]
				: []
			: selectedWithdrawIndex !== null
				? [selectedWithdrawIndex]
				: [];
</script>

<div class="mx-auto max-w-3xl p-6">
	<!-- Toggle trybu -->
	<div class="mb-6 inline-flex">
		<button
			class="rounded-l-md border border-gray-300 px-4 py-2
			   {selectionMode === 'withdraw' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}"
			on:click={() => (selectionMode = 'withdraw')}
		>
			Withdraw
		</button>
		<button
			class="-ml-px rounded-r-md border border-gray-300 px-4 py-2
			   {selectionMode === 'fee' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}"
			on:click={() => (selectionMode = 'fee')}
		>
			Fee
		</button>
	</div>

	<!-- Instrukcja -->
	<p class="mb-4 font-medium">
		{#if selectionMode === 'withdraw'}
			Select a deposit to <strong>withdraw</strong> from:
		{:else}
			Select a deposit to pay <strong>fee</strong>:
		{/if}
	</p>

	<!-- Tabela depozytów -->
	<PaginatedTable
		{columns}
		items={deposits}
		pageSize={5}
		keyField="index"
		{disabledIndexes}
		on:rowClick={handleRowClick}
	/>

	<!-- Karty z detalami -->
	<div class="mt-6 flex flex-col gap-4 md:flex-row">
		{#if selectedWithdrawDeposit}
			<Card title="Withdrawal Deposit">
				<div class="space-y-2 text-sm">
					<div><strong>Index:</strong> {selectedWithdrawDeposit.index}</div>
					<div><strong>Amount:</strong> {selectedWithdrawDeposit.data?.amount}</div>
					<div>
						<strong>Token:</strong>
						<code class="break-all">{selectedWithdrawDeposit.data?.tokenAddress}</code>
					</div>
				</div>
			</Card>
		{/if}

		{#if selectedFeeDeposit}
			<Card title="Fee Deposit">
				<div class="space-y-2 text-sm">
					<div><strong>Index:</strong> {selectedFeeDeposit.index}</div>
					<div><strong>Amount:</strong> {selectedFeeDeposit.data?.amount}</div>
					<div>
						<strong>Token:</strong>
						<code class="break-all">{selectedFeeDeposit.data?.tokenAddress}</code>
					</div>
				</div>
			</Card>
		{/if}
	</div>
</div>
