<script lang="ts">
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
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { generateProof } from '$lib/privacy/generateProof';
	import { getAllByStatus } from '$lib/db/operationsDb';
	import { getOperationDetails } from '$lib/db/operations';

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
	let withdrawNoteBalanceWei: bigint | null = null;
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
				withdrawNoteBalanceWei = BigInt(withdrawNoteBalance);
				userWithdrawAmountWei = toWei(withdrawAmount, withdrawDecimals);

				if (
					withdrawNoteBalanceWei <= 0n ||
					userWithdrawAmountWei <= 0n ||
					userWithdrawAmountWei > withdrawNoteBalanceWei
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
				if (!withdrawNoteBalanceWei || !userWithdrawAmountWei) {
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

				// Commitments
				const withdrawCommitment = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedWithdrawDeposit.hash), withdrawNoteBalanceWei),
						BigInt(withdrawNote.tokenAddress)
					)
				);
				const feeCommitment = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedFeeDeposit.hash), feeNoteBalanceWei),
						BigInt(feeNote.tokenAddress)
					)
				);

				console.log('withdraw commitment:', withdrawCommitment);
				console.log('fee commitment:', feeCommitment);

				// Refunds
				const withdrawRefund = withdrawNoteBalanceWei - userWithdrawAmountWei;
				const { hash: withdrawRefundHash } = await generateOperation({
					data: {
						tokenAddress: withdrawNote.tokenAddress,
						amount: withdrawRefund
					}
				});
				const feeRefund = feeNoteBalanceWei - feeWei;
				const { hash: feeRefundHash } = await generateOperation({
					data: {
						tokenAddress: feeNote.tokenAddress,
						amount: feeRefund
					}
				});
				const withdrawRefundCommitmentHash = garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(withdrawRefundHash), withdrawRefund),
					BigInt(withdrawNote.tokenAddress)
				);
				const feeRefundCommitmentHash = garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(feeRefundHash), feeRefund),
					BigInt(feeNote.tokenAddress)
				);

				// 1) Get operations details
				const withdrawOp = await getOperationDetails(selectedWithdrawDeposit.hash);
				const feeOp = await getOperationDetails(selectedFeeDeposit.hash);
				const withdrawRefundOp = await getOperationDetails(withdrawRefundHash);
				const feeRefundOp = await getOperationDetails(feeRefundHash);

				if (!withdrawOp || !feeOp || !withdrawRefundOp || !feeRefundOp) {
					throw new Error('One or more operations not found');
				}

				console.log('withdrawOp', withdrawOp);
				console.log('feeOp', feeOp);
				console.log('withdrawRefundOp', withdrawRefundOp);
				console.log('feeRefundOp', feeRefundOp);
				// 2) Prepare witness input
				const witnessInput = {
					// Deposit data
					root_1: `0x${withdrawCommitment.root.toString(16)}`,
					secret_1: `0x${BigInt(withdrawOp.secret).toString(16)}`,
					nullifier_1: `0x${BigInt(withdrawOp.nullifier).toString(16)}`,
					commitment_amount_1: `0x${BigInt(withdrawOp.amount).toString(16)}`,
					token_address_1: withdrawOp.tokenAddress,
					hashpath_1: withdrawCommitment.path[0].map((e) => `0x${e.toString(16)}`),
					index_1: `0x${BigInt(withdrawCommitment.index).toString(16)}`,
					amount: `0x${userWithdrawAmountWei.toString(16)}`,
					// Fee deposit
					root_2: `0x${feeCommitment.root.toString(16)}`,
					secret_2: `0x${BigInt(feeOp.secret).toString(16)}`,
					nullifier_2: `0x${BigInt(feeOp.nullifier).toString(16)}`,
					commitment_amount_2: `0x${BigInt(feeOp.amount).toString(16)}`,
					token_address_2: feeOp.tokenAddress,
					hashpath_2: feeCommitment.path[0].map((e) => `0x${e.toString(16)}`),
					index_2: `0x${BigInt(feeCommitment.index).toString(16)}`,
					gas_fee: `0x${feeWei.toString(16)}`,
					// refund data for deposit 1
					refund_secret_1: `0x${BigInt(withdrawRefundOp.secret).toString(16)}`,
					refund_nullifier_1: `0x${BigInt(withdrawRefundOp.nullifier).toString(16)}`,
					refund_amount_1: `0x${withdrawRefund.toString(16)}`,
					refund_commitment_hash_1: `0x${withdrawRefundCommitmentHash.toString(16)}`,
					// refund data for fee deposit
					refund_secret_2: `0x${BigInt(feeRefundOp.secret).toString(16)}`,
					refund_nullifier_2: `0x${BigInt(feeRefundOp.nullifier).toString(16)}`,
					refund_amount_2: `0x${feeRefund.toString(16)}`,
					refund_commitment_hash_2: `0x${feeRefundCommitmentHash.toString(16)}`,
					// Recipient
					_recipient: withdrawRecipient
				};
				console.log('witnessInput', witnessInput);
				downloadWitnessInput(witnessInput);

				const honkCalldataHex = await generateProof(witnessInput, {
					jsonUrl: 'circuits/extension.json',
					vkUrl: 'circuits/vk_extension.bin'
				});
				console.log('honkCalldataHex', honkCalldataHex);

				// const extensionCalldata = [
				// 	PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				// 	withdrawRecipient,
				// 	selectedWithdrawDeposit.data.tokenAddress,
				// 	selectedFeeDeposit.data.amount
				// ];

				// const dataToGenerateWitness = {
				// 	root_1: withdrawCommitment.root,
				// 	secret_1: selectedWithdrawDeposit.secret
				// };
			},
			{
				loading: '⏳ Sending Withdraw Tx',
				success: '✅ Withdraw sent!',
				error: '❌ Withdraw failed'
			}
		);

		isLoading = false;
	}

	function downloadWitnessInput(input: Record<string, any>, filename = 'witnessInput.json') {
		const jsonStr = JSON.stringify(input, null, 2);
		const blob = new Blob([jsonStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();

		URL.revokeObjectURL(url);
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
