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
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { fromWei, toWei } from '$lib/utils/toWei';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { fetchExtensionFee } from '$lib/utils/fetchFeeForExtension';
	import Modal from '$lib/ui/Modal.svelte';
	import {
		PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
		PUBLIC_WITHDRAW_EXTENSION_CONTRACT_ADDRESS
	} from '$env/static/public';
	import { get } from 'svelte/store';
	import { zkLibraries } from '$lib/stores/zkLibraries';

	let deposits: Operation[] = [];
	let selectionMode: 'withdraw' | 'fee' = 'withdraw';

	let selectedWithdrawIndex: number | null = null;
	let selectedWithdrawDeposit: Operation | null = null;
	let selectedFeeIndex: number | null = null;
	let selectedFeeDeposit: Operation | null = null;
	let withdrawNote: NoteData | null = null;
	let feeNote: NoteData | null = null;

	let withdrawRecipient = '';
	let withdrawAmount = '';

	let feeWeiHex = '';
	let modalWithdrawToken = '';
	let modalFeeToken = '';

	let isLoading = false;
	let showFeeModal = false;

	// Confirmation data
	let withdrawBalanceWei: bigint | null = null;
	let userWithdrawAmountWei: bigint | null = null;
	let feeNoteBalanceWei: bigint | null = null;
	let feeWei: bigint | null = null;

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
			// reset the form each time you choose a new withdraw note
			withdrawRecipient = '';
			withdrawAmount = '';
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

	/** First step: validate everything and show confirmation modal */
	async function initiateWithdraw() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedWithdrawDeposit || !selectedFeeDeposit) {
					throw new Error('Please pick both a withdraw note and a fee note');
				}

				// — Withdraw note parsing & validation
				withdrawNote = NoteDataSchema.parse(selectedWithdrawDeposit.data);
				const { tokenAddress: withdrawTokenAddress, amount: withdrawNoteBalance } = withdrawNote;
				modalWithdrawToken = withdrawTokenAddress;

				const withdrawDecimals = await fetchTokenDecimals(withdrawTokenAddress);
				withdrawBalanceWei = toWei(withdrawNoteBalance, withdrawDecimals);
				userWithdrawAmountWei = toWei(withdrawAmount, withdrawDecimals);

				if (
					withdrawBalanceWei <= 0n ||
					userWithdrawAmountWei <= 0n ||
					userWithdrawAmountWei > withdrawBalanceWei
				) {
					throw new Error('Invalid withdraw amount');
				}

				// — Fee note parsing & validation
				feeNote = NoteDataSchema.parse(selectedFeeDeposit.data);
				const { tokenAddress: feeTokenAddress, amount: feeNoteBalance } = feeNote;
				modalFeeToken = feeNote.tokenAddress;

				const feeNoteDecimals = await fetchTokenDecimals(feeTokenAddress);
				feeNoteBalanceWei = toWei(feeNoteBalance, feeNoteDecimals);
				feeWei = await fetchExtensionFee(
					PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
					PUBLIC_WITHDRAW_EXTENSION_CONTRACT_ADDRESS
				);
				feeWeiHex = fromWei(feeWei, feeNoteDecimals);

				if (feeWei > feeNoteBalanceWei) {
					throw new Error(
						`Fee (${feeWeiHex}) exceeds your fee note balance (${fromWei(feeNoteBalanceWei, feeNoteDecimals)})`
					);
				}
				// everything looks good → confirmation
				showFeeModal = true;
			},
			{
				loading: '⏳ Executing Withdraw',
				success: '✅ Withdraw complete!',
				error: '❌ Withdraw failed'
			},
			async (err) => {
				console.warn('❌ Withdraw failed with error:', err);
				isLoading = false;
			}
		);
	}

	/** After user confirms in the modal, actually run the tx */
	async function confirmWithdraw() {
		showFeeModal = false;

		await wrapWithToast(
			async () => {
				// Withdraw Note Refund
				if (!withdrawBalanceWei || !userWithdrawAmountWei)
					throw new Error(
						'Can not calculate refund - withdraw balance or user input does not exist.'
					);
				const withdrawRefund = withdrawBalanceWei - userWithdrawAmountWei;
				console.log(withdrawRefund);

				// Fee Note Refund
				if (!feeNoteBalanceWei || !feeWei)
					throw new Error(
						'Can not calculate refund - fee balance or calculated fee does not exist.'
					);
				const feeRefund = feeNoteBalanceWei - feeWei;
				console.log(feeRefund);

				// Deposit Note Commitment
				const { garaga } = get(zkLibraries);
				if (!garaga) throw new Error('Garaga not initialized');

				if (!feeNote || !selectedFeeDeposit || !withdrawNote || !selectedWithdrawDeposit)
					throw new Error('Missing fee or withdraw deposit.');
				console.log('depositNote', selectedWithdrawDeposit);

				const withdrawNoteIntermediateHash = garaga.poseidonHashBN254(
					BigInt(selectedWithdrawDeposit.hash),
					BigInt(feeNote.amount)
				);
				const withdrawNoteCommitment = garaga.poseidonHashBN254(
					withdrawNoteIntermediateHash,
					BigInt(feeNote.tokenAddress)
				);
				console.log('withdrawNoteCommitment', withdrawNoteCommitment);
			},
			{
				loading: '⏳ Executing Withdraw',
				success: '✅ Withdraw complete!',
				error: '❌ Withdraw failed'
			}
		);

		isLoading = false;
	}
</script>

<div class="mx-auto max-w-3xl p-6">
	{#if !deposits.length}
		<h2>Please make a deposit first!</h2>
	{:else}
		<!-- Toggle + Reset -->
		<div class="mb-6 flex items-center justify-between">
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
			<button
				on:click={resetAll}
				title="Reset selections"
				class="rounded-full p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
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

		<!-- Deposits table -->
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

		<!-- Withdraw form -->
		{#if selectedWithdrawDeposit && selectedFeeDeposit}
			<div class="mt-6 grid w-full grid-cols-1 justify-items-center">
				<Card title="Withdraw">
					<form on:submit|preventDefault={initiateWithdraw} class="mt-6 flex flex-col gap-4">
						<Input
							bind:value={withdrawRecipient}
							required
							placeholder="Recipient Address"
							class_="w-full"
						/>
						<Input
							bind:value={withdrawAmount}
							required
							placeholder="Amount to Withdraw"
							class_="w-full"
						/>
						<Button text="Review" class_="mt-2 w-full" loading={isLoading} type="submit" />
					</form>
				</Card>
			</div>
		{/if}

		<!-- Selected‐deposit cards -->
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
	{/if}

	<Modal
		show={showFeeModal}
		title="Confirm Withdraw"
		confirmText="Accept"
		cancelText="Reject"
		closeOnOutsideClick={false}
		onConfirm={confirmWithdraw}
		onCancel={() => {
			showFeeModal = false;
			isLoading = false;
		}}
		onClose={() => {
			showFeeModal = false;
			isLoading = false;
		}}
	>
		<p class="text-sm">
			You’re about to withdraw
			<strong class="break-words">
				{withdrawAmount} ({modalWithdrawToken})
			</strong>
			tokens, paying a fee of
			<strong class="break-words">
				{feeWeiHex} ({modalFeeToken})
			</strong>
			tokens. Proceed?
		</p>
	</Modal>
</div>
