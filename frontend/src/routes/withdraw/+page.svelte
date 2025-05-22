<script lang="ts">
	import { getAllByStatus } from '$lib/db/operations';
	import { onMount } from 'svelte';
	import { wrapWithToast } from '$lib/utils/toast';
	import { Redo } from 'lucide-svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import PaginatedTable, { type Column } from '$lib/ui/PaginatedTable.svelte';
	import type { Operation } from '$lib/privacy/types';

	let deposits: Operation[] = [];
	let selectionMode: 'withdraw' | 'fee' = 'withdraw';

	let selectedWithdrawIndex: number | null = null;
	let selectedWithdrawDeposit: Operation | null = null;
	let selectedFeeIndex: number | null = null;
	let selectedFeeDeposit: Operation | null = null;

	let recipient = '';
	let amount = '';
	let isLoading = false;

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
		await wrapWithToast(
			async () => {
				const ops = await getAllByStatus('confirmed');
				deposits = ops.sort((a, b) => a.index - b.index);
			},
			{ loading: '⏳ Loading…', success: '', error: '❌ Load error' }
		);
	});

	function handleRowClick(globalIdx: number) {
		if (selectionMode === 'withdraw') {
			selectedWithdrawIndex = globalIdx;
			selectedWithdrawDeposit = deposits[globalIdx];
			// reset form
			recipient = '';
			amount = '';
		} else {
			selectedFeeIndex = globalIdx;
			selectedFeeDeposit = deposits[globalIdx];
		}
	}

	$: disabledIndexes =
		selectionMode === 'withdraw'
			? selectedFeeIndex !== null
				? [selectedFeeIndex]
				: []
			: selectedWithdrawIndex !== null
				? [selectedWithdrawIndex]
				: [];

	function resetAll() {
		selectedWithdrawIndex = null;
		selectedWithdrawDeposit = null;
		selectedFeeIndex = null;
		selectedFeeDeposit = null;
	}

	async function withdrawHandler() {
		// your withdraw logic here...
		isLoading = true;
		try {
			// call your API, etc.
			alert(`Withdrawing ${amount} to ${recipient}`);
		} catch (e) {
			console.error(e);
		}
		isLoading = false;
	}
</script>

<div class="mx-auto p-6">
	<!-- Toggle -->
	<div class="mb-6 flex items-center justify-between">
		<!-- left: withdraw/fee toggle -->
		<div class="inline-flex">
			<button
				class="rounded-l-md px-4 py-2 {selectionMode === 'withdraw'
					? 'bg-blue-400 text-white'
					: 'bg-gray-100 text-gray-700'}"
				on:click={() => (selectionMode = 'withdraw')}
			>
				Withdraw
			</button>
			<button
				class="-ml-px rounded-r-md px-4 py-2 {selectionMode === 'fee'
					? 'bg-blue-400 text-white'
					: 'bg-gray-100 text-gray-700'}"
				on:click={() => (selectionMode = 'fee')}
			>
				Fee
			</button>
		</div>

		<!-- right: reset all selections -->
		<button
			on:click={resetAll}
			title="Reset selections"
			class="rounded-full p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
			aria-label="Reset selections"
		>
			<Redo size="20" />
		</button>
	</div>

	<!-- Instruction -->
	<p class="mb-4 font-medium">
		{#if selectionMode === 'withdraw'}
			Select a deposit to <strong>withdraw</strong> from:
		{:else}
			Select a deposit to pay <strong>fee</strong>:
		{/if}
	</p>

	<!-- Table -->
	<PaginatedTable
		{columns}
		items={deposits}
		pageSize={5}
		keyField="index"
		{disabledIndexes}
		onRowClick={handleRowClick}
		activeIndex={selectionMode === 'withdraw' ? selectedWithdrawIndex : selectedFeeIndex}
		inactiveIndex={selectionMode === 'withdraw' ? selectedFeeIndex : selectedWithdrawIndex}
		hoverClass="hover:bg-green-600"
	/>
	{#if selectedWithdrawDeposit && selectedFeeDeposit}
		<div class="mt-6 grid w-full grid-cols-1 justify-items-center">
			<Card title="Withdraw">
				<form on:submit|preventDefault={withdrawHandler} class="mt-6 flex flex-col gap-4">
					<Input bind:value={recipient} required placeholder="Recipient Address" class_="w-full" />
					<Input bind:value={amount} required placeholder="Amount to Withdraw" class_="w-full" />
					<Button text="Withdraw" class_="mt-2 w-full" loading={isLoading} type="submit" />
				</form>
			</Card>
		</div>
	{/if}
	<!-- Selected‐Deposit Cards -->
	<div class="mt-6 grid w-full grid-cols-1 justify-items-center gap-4 md:grid-cols-2">
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
