<script lang="ts">
	import {
		PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
		PUBLIC_WITHDRAW_EXTENSION_CONTRACT_ADDRESS
	} from '$env/static/public';
	import { getOperationDetails } from '$lib/db/operations';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { merkleTree } from '$lib/services/depositProcessor';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import { zkLibraries } from '$lib/stores/zkLibraries';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { fetchExtensionFee } from '$lib/utils/fetchFeeForExtension';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import {
		getDisplayDepositsForToken,
		type DisplayOperation
	} from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns } from '$lib/utils/sharedColumns';
	import { wrapWithToast } from '$lib/utils/toast';
	import { fromWei } from '$lib/utils/toWei';
	import { Redo } from 'lucide-svelte';
	import { get } from 'svelte/store';

	let deposits: DisplayOperation[] = [];
	let selectionMode: 'merge1' | 'merge2' | 'fee' = 'merge1';

	let selectedMerge1Key: number | null = null;
	let selectedMerge1Deposit: DisplayOperation | null = null;
	let selectedMerge2Key: number | null = null;
	let selectedMerge2Deposit: DisplayOperation | null = null;
	let selectedFeeKey: number | null = null;
	let selectedFeeDeposit: DisplayOperation | null = null;

	let mergeNote1: NoteData | null = null;
	let mergeNote2: NoteData | null = null;
	let feeNote: NoteData | null = null;

	let merge1Amount = '';
	let merge2Amount = '';

	let feeRefundHash: string | null = null;
	let feeWeiHex = '';

	let modalFeeToken = '';

	let isLoading = false;
	let showFeeModal = false;

	// Confirmation data
	let merge1NoteBalanceWei: bigint | null = null;
	let merge2NoteBalanceWei: bigint | null = null;
	let feeNoteBalanceWei: bigint | null = null;
	let feeWei: bigint | null = null;

	$: if ($selectedToken) {
		getDisplayDepositsForToken($selectedToken, (v) => (isLoading = v)).then(
			(d) => (deposits = d ?? [])
		);
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

	async function initiateMerge() {
		isLoading = true;

		await wrapWithToast(
			async () => {
				if (!selectedMerge1Deposit || !selectedMerge2Deposit || !selectedFeeDeposit) {
					throw new Error('Please select both merge notes and a fee note');
				}

				// — Parse first merge note
				mergeNote1 = NoteDataSchema.parse(selectedMerge1Deposit.data);
				const { tokenAddress: merge1TokenAddress, amount: merge1NoteBalance } = mergeNote1;
				merge1NoteBalanceWei = BigInt(merge1NoteBalance);
				const mergeTokenDecimals = await fetchTokenDecimals(merge1TokenAddress);
				merge1Amount = fromWei(merge1NoteBalanceWei, mergeTokenDecimals);
				if (merge1NoteBalanceWei <= 0n) {
					throw new Error('Invalid first deposit balance');
				}

				// — Parse second merge note
				mergeNote2 = NoteDataSchema.parse(selectedMerge2Deposit.data);
				const { tokenAddress: merge2TokenAddress, amount: merge2NoteBalance } = mergeNote2;
				merge2NoteBalanceWei = BigInt(merge2NoteBalance);
				merge2Amount = fromWei(merge2NoteBalanceWei, mergeTokenDecimals);
				if (merge2NoteBalanceWei <= 0n) {
					throw new Error('Invalid first deposit balance');
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
				loading: '⏳ Executing Merge',
				success: '✅ Merge ready!',
				error: '❌ Merge failed'
			},
			async (err) => {
				console.warn('❌ Merge failed with error:', err);
				isLoading = false;
			}
		);
	}

	/** Proving & Execution */
	async function confirmMerge() {
		// 1) Close the modal and start the toast
		showFeeModal = false;
		await wrapWithToast(
			async () => {
				// 2) Validate that note balances and calculated amounts are present
				if (!merge1NoteBalanceWei || !merge2NoteBalanceWei) {
					throw new Error('Cannot calculate refund – missing deposits amounts');
				}
				if (!feeNoteBalanceWei || !feeWei) {
					throw new Error('Cannot calculate refund – missing fee amounts');
				}

				// 3) Ensure zk library and merkle tree are initialized
				const { garaga } = get(zkLibraries);
				if (!garaga) throw new Error('Garaga not initialized');
				if (
					!feeNote ||
					!selectedFeeDeposit ||
					!selectedMerge1Deposit ||
					!selectedMerge2Deposit ||
					!mergeNote1 ||
					!mergeNote2
				) {
					throw new Error('Missing fee or merge deposits');
				}
				const tree = merkleTree;
				if (!tree) throw new Error('Merkle tree does not exist');

				// 4) Compute commitments for the merge and fee deposits
				// And get the data for proving
				const merge1ProofData = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedMerge1Deposit.hash), merge1NoteBalanceWei),
						BigInt(mergeNote1.tokenAddress)
					)
				);

				const merge2ProofData = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedMerge2Deposit.hash), merge2NoteBalanceWei),
						BigInt(mergeNote2.tokenAddress)
					)
				);

				const feeProofData = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedFeeDeposit.hash), feeNoteBalanceWei),
						BigInt(feeNote.tokenAddress)
					)
				);

				// 5) Generate fee refund operation commitment hashe
				const feeRefund = feeNoteBalanceWei - feeWei;
				const feeOpResult = await generateOperation({
					data: { tokenAddress: feeNote.tokenAddress, amount: feeRefund }
				});
				feeRefundHash = feeOpResult.hash;

				const feeRefundCommitmentHash = garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(feeRefundHash), feeRefund),
					BigInt(feeNote.tokenAddress)
				);

				// 6) Fetch details for all four operations from the database
				const merge1Op = await getOperationDetails(selectedMerge1Deposit.hash);
				const merge2Op = await getOperationDetails(selectedMerge2Deposit.hash);
				const feeOp = await getOperationDetails(selectedFeeDeposit.hash);
				const feeRefundOp = await getOperationDetails(feeRefundHash);

				if (!merge1Op || !merge2Op || !feeOp || !feeRefundOp) {
					throw new Error('One or more operations not found');
				}

				resetAll();
			},
			{
				loading: '⏳ Sending Merge Tx',
				success: '✅ Merge sent!',
				error: '❌ Merge failed'
			},
			async (err) => {
				// 13) On error: abort any created refund operations
				console.warn('❌ Merge failed with error:', err);
			}
		);
		isLoading = false;
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
				columns={defaultDepositColumns}
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
						<Card title="First">
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
						<Card title="Second">
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
						<Card title="Fee">
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
							<Button
								onClick={initiateMerge}
								text="Merge"
								class_="mt-2 w-full"
								loading={isLoading}
								type="submit"
							/>
						</form>
					</Card>
				</div>
			{/if}
		{/if}

		<!-- Modal Confirm -->
		<Modal
			show={showFeeModal}
			title="Confirm Merge"
			confirmText="Accept"
			cancelText="Reject"
			closeOnOutsideClick={false}
			onConfirm={confirmMerge}
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
				You’re about to merge
				<strong class="break-words">
					{merge1Amount} and {merge2Amount}
				</strong>
				tokens, paying a fee of
				<strong class="break-words">
					{feeWeiHex}
				</strong>
				tokens. Proceed?
			</p>
		</Modal>
	</Card>
</div>
