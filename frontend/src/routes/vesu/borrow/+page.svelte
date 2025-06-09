<script lang="ts">
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import Card from '$lib/ui/Card.svelte';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import {
		loadDeposits,
		loadEmptyDeposits,
		loadEmptyDisplayDeposits,
		type DisplayOperation
	} from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns } from '$lib/utils/sharedColumns';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import Instructions, { type BorrowMode } from '$lib/ui/Instructions.svelte';
	import { supportedTokens } from '$lib/config/tokens';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';

	const STRK_ADDRESS = supportedTokens[0].address;

	let deposits: DisplayOperation[] = [];
	let isLoading = false;

	// Selection
	let selectionMode: BorrowMode = 'collateral';

	let selectedCollateralKey: number | null = null;
	let selectedCollateralDeposit: DisplayOperation | null = null;

	let selectedCollateralFeeKey: number | null = null;
	let selectedCollateralFeeDeposit: DisplayOperation | null = null;

	let selectedDebtKey: number | null = null;
	let selectedDebtDeposit: DisplayOperation | null = null;

	let selectedDebtFeeKey: number | null = null;
	let selectedDebtFeeDeposit: DisplayOperation | null = null;

	$: if (browser && $selectedToken) {
		if (selectionMode === 'debt') {
			loadEmptyDeposits(
				$selectedToken,
				(d) => (deposits = d),
				(b) => (isLoading = b)
			);
		} else {
			loadDeposits(
				$selectedToken,
				(d) => (deposits = d),
				(b) => (isLoading = b)
			);
		}
	}

	function resetAll() {
		selectedCollateralKey = null;
		selectedCollateralDeposit = null;
		selectedCollateralFeeKey = null;
		selectedCollateralFeeDeposit = null;
		selectedDebtKey = null;
		selectedDebtDeposit = null;
		selectedDebtFeeKey = null;
		selectedDebtFeeDeposit = null;
	}

	function handleSelectionChange(value: string) {
		selectionMode = value as BorrowMode;

		if (value === 'fee' || value == 'debtFee') {
			selectedToken.set(STRK_ADDRESS);
		}
	}

	function handleRowClick(globalIdx: number) {
		const op = deposits[globalIdx];

		switch (selectionMode) {
			case 'collateral':
				selectedCollateralKey = op.index;
				selectedCollateralDeposit = op;
				break;
			case 'fee':
				selectedCollateralFeeKey = op.index;
				selectedCollateralFeeDeposit = op;
				break;
			case 'debt':
				selectedDebtKey = op.index;
				selectedDebtDeposit = op;
				break;
			case 'debtFee':
				selectedDebtFeeKey = op.index;
				selectedDebtFeeDeposit = op;
				break;
		}
	}
</script>

<ProtectedRoute>
	<div class="mx-auto p-6">
		<Card>
			{#if !deposits.length}
				<h2 class="text-center">Please make a deposit first!</h2>
			{:else}
				<SelectionToggle
					options={[
						{ label: 'Collateral', value: 'collateral', isFirst: true },
						{ label: 'Collateral Fee', value: 'fee' },
						{ label: 'Debt', value: 'debt' },
						{ label: 'Debt Fee', value: 'debtFee', isLast: true }
					]}
					selected={selectionMode}
					onChange={handleSelectionChange}
					onReset={resetAll}
				/>
				<Instructions action="borrow" mode={selectionMode} />

				<TokenSelect
					tokens={$tokens}
					bind:value={$selectedToken}
					placeholder="Filter deposits by token"
					class_="mb-4 w-64"
					disabled={selectionMode === 'fee' || selectionMode == 'debtFee'}
				/>
				<PaginatedTable
					columns={defaultDepositColumns}
					items={deposits}
					pageSize={5}
					keyField="index"
					onRowClick={handleRowClick}
					activeKey={selectionMode === 'collateral'
						? selectedCollateralKey
						: selectionMode === 'fee'
							? selectedCollateralFeeKey
							: selectionMode === 'debt'
								? selectedDebtKey
								: selectedDebtFeeKey}
					inactiveKeys={[
						...(selectedCollateralKey != null && selectionMode !== 'collateral'
							? [selectedCollateralKey]
							: []),
						...(selectedCollateralFeeKey != null && selectionMode !== 'fee'
							? [selectedCollateralFeeKey]
							: []),
						...(selectedDebtKey != null && selectionMode !== 'debt' ? [selectedDebtKey] : []),
						...(selectedDebtFeeKey != null && selectionMode !== 'debtFee'
							? [selectedDebtFeeKey]
							: [])
					]}
					hoverClass="hover:bg-green-600"
				/>

				<SelectedDeposits
					items={[
						{ title: 'Collateral Deposit', deposit: selectedCollateralDeposit },
						{ title: 'Fee Collateral', deposit: selectedCollateralFeeDeposit },
						{ title: 'Debt Deposit', deposit: selectedDebtDeposit },
						{ title: 'Fee Debt', deposit: selectedDebtFeeDeposit }
					]}
				/>
			{/if}
		</Card>
	</div>
</ProtectedRoute>
