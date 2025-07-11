<script lang="ts">
	import { browser } from '$app/environment';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import Card from '$lib/ui/Card.svelte';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import {
		loadDeposits,
		loadEmptyDeposits,
		type DisplayOperation
	} from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns } from '$lib/utils/sharedColumns';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
		import { supportedTokens } from '$lib/config/tokens';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';
	import { wrapWithToast } from '$lib/utils/toast';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import Input from '$lib/ui/Input.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { fromWei, toWei } from '$lib/utils/toWei';
	import { fetchExtensionFee } from '$lib/utils/fetchFeeForExtension';
	import {
		PUBLIC_EKUBO_BORROW_EXTENSION_CONTRACT_ADDRESS,
		PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS
	} from '$env/static/public';
import { autoSelectCompleteProcess, type AutoSelectedFee } from '$lib/utils/autoSelectFeeDeposit';

	const STRK_ADDRESS = supportedTokens[0].address;

	let deposits: DisplayOperation[] = [];
	let isLoading = false;

	// Selection
	let selectionMode: 'collateral' | 'debt' = 'collateral';

	let selectedCollateralKey: number | null = null;
	let selectedCollateralDeposit: DisplayOperation | null = null;

	let selectedCollateralFeeKey: number | null = null;
	let selectedCollateralFeeDeposit: DisplayOperation | null = null;

	let selectedDebtKey: number | null = null;
	let selectedDebtDeposit: DisplayOperation | null = null;

	let selectedDebtFeeKey: number | null = null;
	let selectedDebtFeeDeposit: DisplayOperation | null = null;

	// Auto-selected fee information
	let autoSelectedCollateralFeeInfo: AutoSelectedFee | null = null;
	let autoSelectedDebtFeeInfo: AutoSelectedFee | null = null;
	let collateralFeePreloadError: string | null = null;
	let debtFeePreloadError: string | null = null;

	let collateralNote: NoteData | null = null;
	let feeCollateralNote: NoteData | null = null;
	let debtNote: NoteData | null = null;
	let feeDebtNote: NoteData | null = null;
	let collateralNoteBalanceWei: bigint | null = null;
	let feeCollateralNoteBalanceWei: bigint | null = null;
	let debtNoteBalanceWei: bigint | null = null;
	let feeDebtNoteBalanceWei: bigint | null = null;

	let feeWei: bigint | null = null;
	let feeWeiHex = '';

	let collateralAmount = '';
	let userCollateralAmountWei: bigint | null = null;
	let debtAmount = '';
	let userDebtAmountWei: bigint | null = null;

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
		autoSelectedCollateralFeeInfo = null;
		autoSelectedDebtFeeInfo = null;
		collateralFeePreloadError = null;
		debtFeePreloadError = null;
	}

	function handleSelectionChange(value: string) {
		selectionMode = value as 'collateral' | 'debt';
	}

	/** Auto-select collateral fee deposit when collateral deposit is chosen */
	async function autoSelectCollateralFeeDeposit() {
		if (!selectedCollateralDeposit) return;
		
		collateralFeePreloadError = null;
		
		try {
			// Get fee info and auto-select the best STRK deposit
			const excludeDeposits = [selectedCollateralDeposit];
			if (selectedDebtDeposit) excludeDeposits.push(selectedDebtDeposit);
			
			autoSelectedCollateralFeeInfo = await autoSelectCompleteProcess(
				'borrow',
				PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				PUBLIC_EKUBO_BORROW_EXTENSION_CONTRACT_ADDRESS,
				excludeDeposits
			);
			
			// Set the auto-selected collateral fee deposit
			if (autoSelectedCollateralFeeInfo.feeDeposit) {
				selectedCollateralFeeDeposit = autoSelectedCollateralFeeInfo.feeDeposit;
				selectedCollateralFeeKey = autoSelectedCollateralFeeInfo.feeDeposit.index;
			} else {
				selectedCollateralFeeDeposit = null;
				selectedCollateralFeeKey = null;
				
				if (!autoSelectedCollateralFeeInfo.hasEnoughBalance) {
					collateralFeePreloadError = `Insufficient STRK balance. Required: ${autoSelectedCollateralFeeInfo.feeInfo.formatted} STRK`;
				} else {
					collateralFeePreloadError = 'No available STRK deposits for collateral fee payment';
				}
			}
			
			// Also try to auto-select debt fee if debt deposit exists
			if (selectedDebtDeposit) {
				autoSelectDebtFeeDeposit();
			}
		} catch (error) {
			console.error('Error auto-selecting collateral fee deposit:', error);
			collateralFeePreloadError = 'Failed to load collateral fee information';
			autoSelectedCollateralFeeInfo = null;
		}
	}

	/** Auto-select debt fee deposit when debt deposit is chosen */
	async function autoSelectDebtFeeDeposit() {
		if (!selectedDebtDeposit) return;
		
		debtFeePreloadError = null;
		
		try {
			// Get fee info and auto-select the best STRK deposit
			const excludeDeposits = [selectedDebtDeposit];
			if (selectedCollateralDeposit) excludeDeposits.push(selectedCollateralDeposit);
			if (selectedCollateralFeeDeposit) excludeDeposits.push(selectedCollateralFeeDeposit);
			
			autoSelectedDebtFeeInfo = await autoSelectCompleteProcess(
				'borrow',
				PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				PUBLIC_EKUBO_BORROW_EXTENSION_CONTRACT_ADDRESS,
				excludeDeposits
			);
			
			// Set the auto-selected debt fee deposit
			if (autoSelectedDebtFeeInfo.feeDeposit) {
				selectedDebtFeeDeposit = autoSelectedDebtFeeInfo.feeDeposit;
				selectedDebtFeeKey = autoSelectedDebtFeeInfo.feeDeposit.index;
			} else {
				selectedDebtFeeDeposit = null;
				selectedDebtFeeKey = null;
				
				if (!autoSelectedDebtFeeInfo.hasEnoughBalance) {
					debtFeePreloadError = `Insufficient STRK balance. Required: ${autoSelectedDebtFeeInfo.feeInfo.formatted} STRK`;
				} else {
					debtFeePreloadError = 'No available STRK deposits for debt fee payment';
				}
			}
		} catch (error) {
			console.error('Error auto-selecting debt fee deposit:', error);
			debtFeePreloadError = 'Failed to load debt fee information';
			autoSelectedDebtFeeInfo = null;
		}
	}

	function handleRowClick(globalIdx: number) {
		const op = deposits[globalIdx];

		switch (selectionMode) {
			case 'collateral':
				selectedCollateralKey = op.index;
				selectedCollateralDeposit = op;
				// Auto-select collateral fee deposit
				autoSelectCollateralFeeDeposit();
				break;
			case 'debt':
				selectedDebtKey = op.index;
				selectedDebtDeposit = op;
				// Auto-select debt fee deposit
				autoSelectDebtFeeDeposit();
				break;
		}
	}

	async function initiateBorrow() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedCollateralDeposit || !selectedCollateralFeeDeposit || !autoSelectedCollateralFeeInfo) {
					throw new Error('Please select a collateral deposit first');
				}

				if (!selectedDebtDeposit || !selectedDebtFeeDeposit || !autoSelectedDebtFeeInfo) {
					throw new Error('Please select a debt deposit first');
				}

				// Parse collateral note
				collateralNote = NoteDataSchema.parse(selectedCollateralDeposit.data);
				const { tokenAddress: collateralTokenAddress, amount: collateralNoteBalance } =
					collateralNote;
				const collateralDecimals = await fetchTokenDecimals(collateralTokenAddress);
				collateralNoteBalanceWei = BigInt(collateralNoteBalance);
				userCollateralAmountWei = toWei(collateralAmount, collateralDecimals);

				if (
					collateralNoteBalanceWei <= 0n ||
					userCollateralAmountWei <= 0n ||
					userCollateralAmountWei > collateralNoteBalanceWei
				) {
					throw new Error('Invalid collateral amount');
				}

				// Parse collateral fee note (auto-selected)
				feeCollateralNote = NoteDataSchema.parse(selectedCollateralFeeDeposit.data);
				const { tokenAddress: feeCollateralTokenAddress, amount: feeCollateralNoteBalance } =
					feeCollateralNote;

				const feeNoteDecimals = await fetchTokenDecimals(feeCollateralTokenAddress);
				feeCollateralNoteBalanceWei = BigInt(feeCollateralNoteBalance);
				
				// Use pre-loaded fee info
				feeWei = autoSelectedCollateralFeeInfo.feeInfo.amount;
				feeWeiHex = autoSelectedCollateralFeeInfo.feeInfo.formatted;

				if (feeWei > feeCollateralNoteBalanceWei) {
					throw new Error(
						`Fee (${feeWeiHex}) exceeds your fee note balance (${fromWei(
							feeCollateralNoteBalanceWei,
							feeNoteDecimals
						)})`
					);
				}

				// Parse debt note
				debtNote = NoteDataSchema.parse(selectedDebtDeposit.data);
				const { tokenAddress: debtTokenAddress, amount: debtNoteBalance } = debtNote;
				const debtDecimals = await fetchTokenDecimals(debtTokenAddress);
				debtNoteBalanceWei = BigInt(debtNoteBalance);
				userDebtAmountWei = toWei(debtAmount, debtDecimals);

				if (
					debtNoteBalanceWei <= 0n ||
					userDebtAmountWei <= 0n ||
					userDebtAmountWei > debtNoteBalanceWei
				) {
					throw new Error('Invalid debt amount');
				}

				// Parse debt fee note (auto-selected)
				feeDebtNote = NoteDataSchema.parse(selectedDebtFeeDeposit.data);
				const { amount: feeDebtNoteBalance } = feeDebtNote;
				feeDebtNoteBalanceWei = BigInt(feeDebtNoteBalance);

				// Debt fee uses the same fee amount as collateral fee
				if (feeWei > feeDebtNoteBalanceWei) {
					throw new Error(
						`Fee (${feeWeiHex}) exceeds your debt fee note balance (${fromWei(
							feeDebtNoteBalanceWei,
							feeNoteDecimals
						)})`
					);
				}
			},
			{
				loading: '⏳ Executing Borrow',
				success: '✅ Borrow ready!',
				error: '❌ Borrow failed'
			},
			async (err) => {
				console.warn('❌ Borrow failed with error:', err);
				isLoading = false;
			}
		);
	}
</script>

<ProtectedRoute>
	<div class="mx-auto p-6">
		<Card>
			<h2 class="text-2xl font-bold mb-4">Borrow</h2>
			<p class="text-gray-600 mb-6">
				Select collateral and debt deposits. Fee deposits will be automatically selected.
			</p>
			
			<SelectionToggle
				options={[
					{ label: 'Collateral', value: 'collateral', isFirst: true },
					{ label: 'Debt', value: 'debt', isLast: true }
				]}
				selected={selectionMode}
				onChange={handleSelectionChange}
				onReset={resetAll}
			/>

			<TokenSelect
				tokens={$tokens}
				bind:value={$selectedToken}
				placeholder="Filter deposits by token"
				class_="mb-4 w-64"
			/>
			{#if !deposits.length}
				<h2 class="text-center">Please make a deposit first!</h2>
			{:else}
				<PaginatedTable
					columns={defaultDepositColumns}
					items={deposits}
					pageSize={5}
					keyField="index"
					onRowClick={handleRowClick}
					activeKey={selectionMode === 'collateral' ? selectedCollateralKey : selectedDebtKey}
					inactiveKeys={[
						...(selectedCollateralKey != null && selectionMode !== 'collateral' ? [selectedCollateralKey] : []),
						...(selectedCollateralFeeKey != null ? [selectedCollateralFeeKey] : []),
						...(selectedDebtKey != null && selectionMode !== 'debt' ? [selectedDebtKey] : []),
						...(selectedDebtFeeKey != null ? [selectedDebtFeeKey] : [])
					]}
					hoverClass="hover:bg-green-600"
				/>
			{/if}

			<!-- Auto-selected fee information -->
			{#if autoSelectedCollateralFeeInfo || autoSelectedDebtFeeInfo}
				<div class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
					<h3 class="font-semibold text-blue-800 mb-2">Fee Information</h3>
					{#if autoSelectedCollateralFeeInfo}
						<p class="text-sm text-blue-700 mb-1">
							Collateral Fee: <strong>{autoSelectedCollateralFeeInfo.feeInfo.formatted} STRK</strong>
							{#if autoSelectedCollateralFeeInfo.feeDeposit}
								• Auto-selected: <strong>{autoSelectedCollateralFeeInfo.feeDeposit.displayAmount}</strong>
							{/if}
						</p>
					{/if}
					{#if autoSelectedDebtFeeInfo}
						<p class="text-sm text-blue-700">
							Debt Fee: <strong>{autoSelectedDebtFeeInfo.feeInfo.formatted} STRK</strong>
							{#if autoSelectedDebtFeeInfo.feeDeposit}
								• Auto-selected: <strong>{autoSelectedDebtFeeInfo.feeDeposit.displayAmount}</strong>
							{/if}
						</p>
					{/if}
				</div>
			{/if}

			<!-- Error messages -->
			{#if collateralFeePreloadError || debtFeePreloadError}
				<div class="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
					{#if collateralFeePreloadError}
						<p class="text-sm text-red-700 mb-1">Collateral Fee: {collateralFeePreloadError}</p>
					{/if}
					{#if debtFeePreloadError}
						<p class="text-sm text-red-700">Debt Fee: {debtFeePreloadError}</p>
					{/if}
				</div>
			{/if}

			<SelectedDeposits
				items={[
					{ title: 'Collateral Deposit', deposit: selectedCollateralDeposit },
					{ title: 'Collateral Fee (Auto-selected)', deposit: selectedCollateralFeeDeposit },
					{ title: 'Debt Deposit', deposit: selectedDebtDeposit },
					{ title: 'Debt Fee (Auto-selected)', deposit: selectedDebtFeeDeposit }
				]}
			/>

			<!-- Withdraw Form -->
			{#if selectedCollateralDeposit && selectedCollateralFeeDeposit && selectedDebtDeposit && selectedDebtFeeDeposit && !collateralFeePreloadError && !debtFeePreloadError}
				<div class="mt-6 grid w-full grid-cols-1 justify-items-center">
					<Card>
						<form on:submit|preventDefault={initiateBorrow} class="mt-6 flex flex-col gap-4">
							<Input
								bind:value={debtAmount}
								required
								placeholder="Amount to borrow"
								class_="w-full"
							/>
							<Input
								bind:value={collateralAmount}
								required
								placeholder="Collateral amount"
								class_="w-full"
							/>
							<Button text="Borrow" class_="mt-2 w-full" loading={isLoading} type="submit" />
						</form>
					</Card>
				</div>
			{/if}
		</Card>
	</div>
</ProtectedRoute>
