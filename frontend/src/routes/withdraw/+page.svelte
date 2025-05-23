<script lang="ts">
	import { getAllByStatus } from '$lib/db/operations';
	import { onMount } from 'svelte';
	import { wrapWithToast } from '$lib/utils/toast';
	import { Redo } from 'lucide-svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
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
	import { merkleTree } from '$lib/services/depositProcessor';
	import Input from '$lib/ui/Input.svelte';

	interface DisplayOperation extends Omit<Operation, 'data'> {
		data: {
			tokenAddress: string;
			amount: string | bigint;
		};
		displayAmount: string;
	}

	let deposits: DisplayOperation[] = [];
	let selectionMode: 'withdraw' | 'fee' = 'withdraw';

	let selectedWithdrawIndex: number | null = null;
	let selectedWithdrawDeposit: DisplayOperation | null = null;
	let selectedFeeIndex: number | null = null;
	let selectedFeeDeposit: DisplayOperation | null = null;

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

	const columns: Column<DisplayOperation>[] = [
		{ label: 'Index', field: 'index' },
		{ label: 'Amount', field: (d) => d.displayAmount },
		{
			label: 'Token',
			field: (d) => d.data.tokenAddress,
			render: (d) => `<code>${d.data.tokenAddress}</code>`
		}
	];

	onMount(async () => {
		await wrapWithToast(
			async () => {
				const ops = await getAllByStatus('confirmed');

				// 1) Unique token addresses
				const uniqueAddrs = Array.from(new Set(ops.map((o) => o.data.tokenAddress)));

				// 2) Fetch decimals for each unique
				const decimalsMap: Record<string, number> = {};
				await Promise.all(
					uniqueAddrs.map(async (addr) => {
						decimalsMap[addr] = await fetchTokenDecimals(addr);
					})
				);

				// 3) Sort and add display amount (hex)
				deposits = ops
					.sort((a, b) => a.index - b.index)
					.map((op) => {
						const rawData = op.data as {
							tokenAddress: string;
							amount: string | bigint;
						};
						const rawWei =
							typeof rawData.amount === 'bigint' ? rawData.amount : BigInt(rawData.amount);

						return {
							...op,
							data: rawData,
							displayAmount: fromWei(rawWei, decimalsMap[rawData.tokenAddress])
						} as DisplayOperation;
					});
			},
			{ loading: '⏳ Loading…', success: '', error: '❌ Load error' }
		);
	});

	function handleRowClick(globalIdx: number) {
		if (selectionMode === 'withdraw') {
			selectedWithdrawIndex = globalIdx;
			selectedWithdrawDeposit = deposits[globalIdx];
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

	/** Step 1: Validate */
	async function initiateWithdraw() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedWithdrawDeposit || !selectedFeeDeposit) {
					throw new Error('Please pick both a withdraw note and a fee note');
				}

				// — Parse Withdraw note
				withdrawNote = NoteDataSchema.parse(selectedWithdrawDeposit.data);
				const { tokenAddress: withdrawTokenAddress, amount: withdrawNoteBalance } = withdrawNote;
				modalWithdrawToken = withdrawTokenAddress;

				const withdrawDecimals = await fetchTokenDecimals(withdrawTokenAddress);
				withdrawBalanceWei = BigInt(withdrawNoteBalance);
				userWithdrawAmountWei = toWei(withdrawAmount, withdrawDecimals);

				if (
					withdrawBalanceWei <= 0n ||
					userWithdrawAmountWei <= 0n ||
					userWithdrawAmountWei > withdrawBalanceWei
				) {
					throw new Error('Invalid withdraw amount');
				}

				// — Parse Fee note
				feeNote = NoteDataSchema.parse(selectedFeeDeposit.data);
				const { tokenAddress: feeTokenAddress, amount: feeNoteBalance } = feeNote;
				modalFeeToken = feeTokenAddress;

				const feeNoteDecimals = await fetchTokenDecimals(feeTokenAddress);
				feeNoteBalanceWei = BigInt(feeNoteBalance);
				feeWei = await fetchExtensionFee(
					PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
					PUBLIC_WITHDRAW_EXTENSION_CONTRACT_ADDRESS
				);
				feeWeiHex = fromWei(feeWei, feeNoteDecimals);

				if (feeWei > feeNoteBalanceWei) {
					throw new Error(
						`Fee (${feeWeiHex}) exceeds your fee note balance (${fromWei(
							feeNoteBalanceWei,
							feeNoteDecimals
						)})`
					);
				}

				showFeeModal = true;
			},
			{
				loading: '⏳ Executing Withdraw',
				success: '✅ Withdraw ready!',
				error: '❌ Withdraw failed'
			},
			async (err) => {
				console.warn('❌ Withdraw failed with error:', err);
				isLoading = false;
			}
		);
	}

	/** Proving */
	async function confirmWithdraw() {
		showFeeModal = false;

		await wrapWithToast(
			async () => {
				if (!withdrawBalanceWei || !userWithdrawAmountWei) {
					throw new Error('Can not calculate refund - missing withdraw amounts');
				}
				if (!feeNoteBalanceWei || !feeWei) {
					throw new Error('Can not calculate refund - missing fee amounts');
				}

				const { garaga } = get(zkLibraries);
				if (!garaga) throw new Error('Garaga not initialized');
				if (!feeNote || !selectedFeeDeposit || !withdrawNote || !selectedWithdrawDeposit) {
					throw new Error('Missing fee or withdraw deposit.');
				}
				const tree = merkleTree;
				if (!tree) throw new Error('Merkle tree does not exist');

				const withdrawCommitData = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedWithdrawDeposit.hash), withdrawBalanceWei),
						BigInt(withdrawNote.tokenAddress)
					)
				);
				const feeCommitData = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedFeeDeposit.hash), feeNoteBalanceWei!),
						BigInt(feeNote.tokenAddress)
					)
				);

				console.log('withdraw proof:', withdrawCommitData);
				console.log('fee proof:', feeCommitData);
			},
			{
				loading: '⏳ Sending Withdraw Tx',
				success: '✅ Withdraw sent!',
				error: '❌ Withdraw failed'
			}
		);

		isLoading = false;
	}
</script>

<div class="mx-auto p-6">
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

		<!-- Instructions -->
		<p class="mb-4 font-medium">
			{#if selectionMode === 'withdraw'}
				Select a deposit to <strong>withdraw</strong> from:
			{:else}
				Select a deposit to pay <strong>fee</strong>:
			{/if}
		</p>

		<!-- Deposits Table -->
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

		<!-- Selected‐deposit cards -->
		{#if selectedWithdrawDeposit || selectedFeeDeposit}
			<div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
				{#if selectedWithdrawDeposit}
					<Card title="Withdrawal Deposit">
						<div class="space-y-2 text-sm">
							<div><strong>Index:</strong> {selectedWithdrawDeposit.index}</div>
							<div>
								<strong>Amount:</strong>
								{selectedWithdrawDeposit.displayAmount}
							</div>
							<div>
								<strong>Token:</strong>
								<code class="break-all">{selectedWithdrawDeposit.data.tokenAddress}</code>
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
							<div>
								<strong>Token:</strong>
								<code class="break-all">{selectedFeeDeposit.data.tokenAddress}</code>
							</div>
						</div>
					</Card>
				{/if}
			</div>
		{/if}

		<!-- Withdraw Form -->
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
	{/if}

	<!-- Modal Confirm -->
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
