<script lang="ts">
	import { getAllByStatus } from '$lib/db/operationsDb';
	import type { Operation } from '$lib/privacy/types';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import type { Column } from '$lib/ui/PaginatedTable.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { wrapWithToast } from '$lib/utils/toast';
	import { fromWei } from '$lib/utils/toWei';
	import { Car, Redo } from 'lucide-svelte';

	interface DisplayOperation extends Omit<Operation, 'data'> {
		data: {
			tokenAddress: string;
			amount: string | bigint;
		};
		displayAmount: string;
	}
	let deposits: DisplayOperation[] = [];

	function isPricedOp(op: Operation): op is Omit<Operation, 'data'> & {
		data: { tokenAddress: string; amount: string | bigint };
	} {
		return (
			op.data !== undefined &&
			typeof op.data === 'object' &&
			typeof (op.data as any).tokenAddress === 'string' &&
			(typeof (op.data as any).amount === 'string' || typeof (op.data as any).amount === 'bigint')
		);
	}

	let selectionMode: 'merge1' | 'merge2' | 'fee' = 'merge1';

	let selectedMerge1Key: number | null = null;
	let selectedMerge1Deposit: DisplayOperation | null = null;
	let selectedMerge2Key: number | null = null;
	let selectedMerge2Deposit: DisplayOperation | null = null;
	let selectedFeeKey: number | null = null; //
	let selectedFeeDeposit: DisplayOperation | null = null;

	let isLoading = false;

	const columns: Column<DisplayOperation>[] = [
		{ label: 'Index', field: 'index' },
		{ label: 'Amount', field: (d) => d.displayAmount }
	];

	$: if ($selectedToken) {
		loadDepositsForSelectedToken();
	}

	async function loadDepositsForSelectedToken() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				const ops = await getAllByStatus('confirmed');
				const pricedOps = ops.filter(isPricedOp);

				const uniqueAddrs = Array.from(new Set(pricedOps.map((o) => o.data.tokenAddress)));
				const decimalsMap: Record<string, number> = {};
				await Promise.all(
					uniqueAddrs.map(async (addr) => {
						decimalsMap[addr] = await fetchTokenDecimals(addr);
					})
				);

				deposits = pricedOps
					.filter((op) => op.data.tokenAddress === $selectedToken && BigInt(op.data.amount) > 0n)
					.sort((a, b) => a.index - b.index)
					.map((op) => {
						const { tokenAddress, amount } = op.data;
						const wei = typeof amount === 'bigint' ? amount : BigInt(amount);
						return {
							...op,
							data: { tokenAddress, amount },
							displayAmount: fromWei(wei, decimalsMap[tokenAddress])
						};
					});
			},
			{ loading: '⏳ Loading…', success: '', error: '❌ Load error' }
		);
		isLoading = false;
	}

	function handleRowClick(globalIdx: number) {
		const selectedKey = deposits[globalIdx].index;
		const selectedDeposit = deposits.find((d) => d.index === selectedKey) ?? null;

		if (selectionMode === 'merge1') {
			selectedMerge1Key = selectedKey;
			selectedMerge1Deposit = selectedDeposit;
		} else if (selectionMode === 'merge2') {
			selectedMerge2Key = selectedKey;
			selectedMerge2Deposit = selectedDeposit;
		} else {
			selectedFeeKey = selectedKey;
			selectedFeeDeposit = selectedDeposit;
		}
	}

	$: disabledKeys = [
		...(selectionMode !== 'merge1' && selectedMerge1Key !== null ? [selectedMerge1Key] : []),
		...(selectionMode !== 'merge2' && selectedMerge2Key !== null ? [selectedMerge2Key] : []),
		...(selectionMode !== 'fee' && selectedFeeKey !== null ? [selectedFeeKey] : [])
	];

	function resetAll() {
		selectedMerge1Key = null;
		selectedMerge1Deposit = null;
		selectedMerge2Key = null;
		selectedMerge2Deposit = null;
		selectedFeeKey = null;
		selectedFeeDeposit = null;
	}
</script>

<div class="mx-auto p-6">
	<Card>
		{#if !deposits.length}
			<h2>Please make a deposit first!</h2>
		{:else}
			<!-- Toggle + Reset -->
			<div class="mb-6 flex items-center justify-between">
				<div class="inline-flex">
					<button
						class="rounded-l-md px-4 py-2 {selectionMode === 'merge1'
							? 'bg-blue-400 text-white'
							: 'bg-gray-100 text-gray-700'}"
						on:click={() => (selectionMode = 'merge1')}
					>
						First
					</button>
					<button
						class="px-4 py-2 {selectionMode === 'merge2'
							? 'bg-blue-400 text-white'
							: 'bg-gray-100 text-gray-700'}"
						on:click={() => (selectionMode = 'merge2')}
					>
						Second
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
				<button
					on:click={resetAll}
					title="Reset selections"
					class="rounded-full p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
				>
					<Redo size="20" />
				</button>
			</div>
			<p class="mb-4 font-medium">
				{#if selectionMode === 'merge1'}
					Select <strong>first</strong> deposit to <strong>merge</strong>:
				{:else if selectionMode === 'merge2'}
					Select <strong>second</strong> deposit to <strong>merge</strong>:
				{:else}
					Select a deposit to pay <strong>fee</strong>:
				{/if}
			</p>
			<p class="mb-2 text-sm text-gray-600 dark:text-gray-300">
				Select a token to filter the list of available deposits:
			</p>
			<TokenSelect
				tokens={$tokens}
				bind:value={$selectedToken}
				placeholder="Filter deposits by token"
				class_="mb-4 w-64"
			/>
			<PaginatedTable
				{columns}
				items={deposits}
				pageSize={5}
				keyField="index"
				{disabledKeys}
				onRowClick={handleRowClick}
				activeKey={selectionMode === 'merge1'
					? selectedMerge1Key
					: selectionMode === 'merge2'
						? selectedMerge2Key
						: selectedFeeKey}
				inactiveKeys={[
					...(selectionMode !== 'merge1' && selectedMerge1Key !== null ? [selectedMerge1Key] : []),
					...(selectionMode !== 'merge2' && selectedMerge2Key !== null ? [selectedMerge2Key] : []),
					...(selectionMode !== 'fee' && selectedFeeKey !== null ? [selectedFeeKey] : [])
				]}
				hoverClass="hover:bg-green-600"
			/>

			{#if selectedMerge1Deposit || selectedMerge2Deposit || selectedFeeDeposit}
				<div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
					{#if selectedMerge1Deposit}
						<Card title="First Deposit">
							<div class="space-y-2 text-sm">
								<div><strong>Index:</strong> {selectedMerge1Deposit.index}</div>
								<div>
									<strong>Amount:</strong>
									{selectedMerge1Deposit.displayAmount}
								</div>
							</div>
						</Card>
					{/if}

					{#if selectedMerge2Deposit}
						<Card title="Second Deposit">
							<div class="space-y-2 text-sm">
								<div><strong>Index:</strong> {selectedMerge2Deposit.index}</div>
								<div>
									<strong>Amount:</strong>
									{selectedMerge2Deposit.displayAmount}
								</div>
							</div>
						</Card>
					{/if}

					{#if selectedFeeDeposit}
						<Card title="Fee Deposit">
							<div class="space-y-2 text-sm">
								<div><strong>Index:</strong> {selectedFeeDeposit.index}</div>
								<div>
									<strong>Amount:</strong>
									{selectedFeeDeposit.displayAmount}
								</div>
							</div>
						</Card>
					{/if}
				</div>
			{/if}
			{#if selectedMerge1Deposit && selectedMerge2Deposit && selectedFeeDeposit}
				<div class="mt-6 grid w-full grid-cols-1 justify-items-center">
					<Card>
						<form class="mt-6 flex flex-col gap-4">
							<Button text="Merge" class_="mt-2 w-full" loading={isLoading} type="submit" />
						</form>
					</Card>
				</div>
			{/if}
		{/if}
	</Card>
</div>
