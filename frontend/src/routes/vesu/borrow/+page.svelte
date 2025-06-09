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
	import Instructions, { type BorrowMode } from '$lib/ui/Instructions.svelte';
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

	async function initiateBorrow() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedCollateralDeposit || !selectedCollateralFeeDeposit) {
					throw new Error('Please select both a collateral deposit and a collateral fee deposit');
				}

				if (!selectedDebtDeposit || !selectedDebtFeeDeposit) {
					throw new Error('Please select both a debt deposit and a debt fee deposit');
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

				// Parse collateral fee note
				feeCollateralNote = NoteDataSchema.parse(selectedCollateralFeeDeposit.data);
				const { tokenAddress: feeCollateralTokenAddress, amount: feeCollateralNoteBalance } =
					feeCollateralNote;

				const feeNoteDecimals = await fetchTokenDecimals(feeCollateralTokenAddress);
				feeCollateralNoteBalanceWei = BigInt(feeCollateralNoteBalance);
				feeWei = await fetchExtensionFee(
					PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
					PUBLIC_EKUBO_BORROW_EXTENSION_CONTRACT_ADDRESS
				);
				feeWeiHex = fromWei(feeWei, feeNoteDecimals);

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

				// Parse debt fee note
				feeDebtNote = NoteDataSchema.parse(selectedCollateralFeeDeposit.data);
				const { amount: feeDebtNoteBalance } = feeDebtNote;
				feeDebtNoteBalanceWei = BigInt(feeDebtNoteBalance);

				if (feeWei > feeDebtNoteBalanceWei) {
					throw new Error(
						`Fee (${feeWeiHex}) exceeds your fee note balance (${fromWei(
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
			{#if !deposits.length}
				<h2 class="text-center">Please make a deposit first!</h2>
			{:else}
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
			{/if}

			<SelectedDeposits
				items={[
					{ title: 'Collateral Deposit', deposit: selectedCollateralDeposit },
					{ title: 'Fee Collateral', deposit: selectedCollateralFeeDeposit },
					{ title: 'Debt Deposit', deposit: selectedDebtDeposit },
					{ title: 'Fee Debt', deposit: selectedDebtFeeDeposit }
				]}
			/>

			<!-- Withdraw Form -->
			{#if selectedCollateralDeposit && selectedCollateralFeeDeposit && selectedDebtDeposit && selectedDebtFeeDeposit}
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
							<Button text="Withdraw" class_="mt-2 w-full" loading={isLoading} type="submit" />
						</form>
					</Card>
				</div>
			{/if}
		</Card>
	</div>
</ProtectedRoute>
