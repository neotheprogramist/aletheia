<script lang="ts">
	import { PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS } from '$env/static/public';
	import { getOperationDetails } from '$lib/db/operations';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { merkleTree } from '$lib/services/depositProcessor';
	import { selectedToken, tokens } from '$lib/stores/tokens';
	import { zkLibraries } from '$lib/stores/zkLibraries';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { fetchMergeFee } from '$lib/utils/fetchFeeForExtension';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import {
		getDisplayDepositsForToken,
		type DisplayOperation
	} from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns } from '$lib/utils/sharedColumns';
	import { wrapWithToast } from '$lib/utils/toast';
	import { fromWei, toWei } from '$lib/utils/toWei';
	import { Redo } from 'lucide-svelte';
	import { get } from 'svelte/store';

	let deposits: DisplayOperation[] = [];
	let selectionMode: 'transfer' | 'fee' = 'transfer';

	let selectedTransferKey: number | null = null;
	let selectedTransferDeposit: DisplayOperation | null = null;
	let selectedFeeKey: number | null = null;
	let selectedFeeDeposit: DisplayOperation | null = null;

	let transferNote: NoteData | null = null;
	let feeNote: NoteData | null = null;

	let transferSecretAndNullifierHash = '';
	let transferAmount = '';
	let transferRefundHash: string | null = null;
	let feeRefundHash: string | null = null;
	let feeWeiHex = '';

	let isLoading = false;
	let showFeeModal = false;

	// Confirmation data
	let transferNoteBalanceWei: bigint | null = null;
	let userTransferAmountWei: bigint | null = null;
	let feeNoteBalanceWei: bigint | null = null;
	let feeWei: bigint | null = null;

	$: if ($selectedToken) {
		getDisplayDepositsForToken($selectedToken, (v) => (isLoading = v)).then(
			(d) => (deposits = d ?? [])
		);
	}

	function handleRowClick(globalIdx: number) {
		if (selectionMode === 'transfer') {
			selectedTransferKey = deposits[globalIdx].index;
			selectedTransferDeposit = deposits.find((d) => d.index === selectedTransferKey) ?? null;
			transferSecretAndNullifierHash = '';
			transferAmount = '';
		} else {
			selectedFeeKey = deposits[globalIdx].index;
			selectedFeeDeposit = deposits.find((d) => d.index === selectedFeeKey) ?? null;
		}
	}

	function resetAll() {
		selectedTransferKey = null;
		selectedTransferDeposit = null;
		selectedFeeKey = null;
		selectedFeeDeposit = null;
	}

	/** Step 1: Validate*/
	async function initiateTransfer() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedTransferDeposit || !selectedFeeDeposit) {
					throw new Error('Please select both a transfer note and a fee note');
				}

				// — Parse transfer note
				transferNote = NoteDataSchema.parse(selectedTransferDeposit.data);
				const { tokenAddress: transferTokenAddress, amount: transferNoteBalance } = transferNote;

				const transferDecimals = await fetchTokenDecimals(transferTokenAddress);
				transferNoteBalanceWei = BigInt(transferNoteBalance);
				userTransferAmountWei = toWei(transferAmount, transferDecimals);

				if (
					transferNoteBalanceWei <= 0n ||
					userTransferAmountWei <= 0n ||
					userTransferAmountWei > transferNoteBalanceWei
				) {
					throw new Error('Invalid transfer amount');
				}

				// — Parse Fee note
				feeNote = NoteDataSchema.parse(selectedFeeDeposit.data);
				const { tokenAddress: feeTokenAddress, amount: feeNoteBalance } = feeNote;

				const feeNoteDecimals = await fetchTokenDecimals(feeTokenAddress);
				feeNoteBalanceWei = BigInt(feeNoteBalance);
				feeWei = await fetchMergeFee(PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS);
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
				loading: '⏳ Executing Transfer',
				success: '✅ Transfer ready!',
				error: '❌ Transfer failed'
			},
			async (err) => {
				console.warn('❌ Transfer failed with error:', err);
				isLoading = false;
			}
		);
	}

	/** Step 2: Proving & Execution */
	async function confirmTransfer() {
		// 1) Close the modal and start the toast
		showFeeModal = false;

		await wrapWithToast(
			async () => {
				// 2) Validate that note balances and calculated amounts are present
				if (!transferNoteBalanceWei || !userTransferAmountWei) {
					throw new Error('Cannot calculate refund – missing transfer amounts');
				}
				if (!feeNoteBalanceWei || !feeWei) {
					throw new Error('Cannot calculate refund – missing fee amounts');
				}

				// 3) Ensure zk library and merkle tree are initialized
				const { garaga } = get(zkLibraries);
				if (!garaga) throw new Error('Garaga not initialized');
				if (!feeNote || !selectedFeeDeposit || !transferNote || !selectedTransferDeposit) {
					throw new Error('Missing fee or transfer deposit');
				}
				const tree = merkleTree;
				if (!tree) throw new Error('Merkle tree does not exist');

				// 4) Compute commitments for the transfer and fee deposits
				// And get the data for proving
				const transferProofData = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedTransferDeposit.hash), transferNoteBalanceWei),
						BigInt(transferNote.tokenAddress)
					)
				);
				const feeProofData = tree.getProofData(
					garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(selectedFeeDeposit.hash), feeNoteBalanceWei),
						BigInt(feeNote.tokenAddress)
					)
				);

				// 5) Generate refund operations and compute their commitment hashes
				const transferRefund = transferNoteBalanceWei - userTransferAmountWei;
				const transferOpResult = await generateOperation({
					data: { tokenAddress: transferNote.tokenAddress, amount: transferRefund }
				});
				transferRefundHash = transferOpResult.hash;

				const feeRefund = feeNoteBalanceWei - feeWei;
				const feeOpResult = await generateOperation({
					data: { tokenAddress: feeNote.tokenAddress, amount: feeRefund }
				});
				feeRefundHash = feeOpResult.hash;

				const transferRefundCommitmentHash = garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(transferRefundHash), transferRefund),
					BigInt(transferNote.tokenAddress)
				);
				const feeRefundCommitmentHash = garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(feeRefundHash), feeRefund),
					BigInt(feeNote.tokenAddress)
				);

				// 6) Fetch details for all operations from the database
				const transferOp = await getOperationDetails(selectedTransferDeposit.hash);
				const feeOp = await getOperationDetails(selectedFeeDeposit.hash);
				const transferRefundOp = await getOperationDetails(transferRefundHash);
				const feeRefundOp = await getOperationDetails(feeRefundHash);

				if (!transferOp || !feeOp || !transferRefundOp || !feeRefundOp) {
					throw new Error('One or more operations not found');
				}

				const witnessInput = {};
			},
			{
				loading: '⏳ Sending Transfer Tx',
				success: '✅ Transfer sent!',
				error: '❌ Transfer failed'
			},
			async (err) => {
				console.warn('❌ Transfer failed with error:', err);
			}
		);
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
						class="rounded-l-md px-4 py-2 {selectionMode === 'transfer'
							? 'bg-blue-400 text-white'
							: 'bg-gray-100 text-gray-700'}"
						on:click={() => (selectionMode = 'transfer')}
					>
						Transfer
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
				{#if selectionMode === 'transfer'}
					Select deposit to <strong>transfer</strong> from:
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
			<!-- Deposits Table -->
			<PaginatedTable
				columns={defaultDepositColumns}
				items={deposits}
				pageSize={5}
				keyField="index"
				disabledKeys={undefined}
				onRowClick={handleRowClick}
				activeKey={selectionMode === 'transfer' ? selectedTransferKey : selectedFeeKey}
				inactiveKeys={selectionMode === 'transfer' && selectedFeeKey !== null
					? [selectedFeeKey]
					: selectionMode === 'fee' && selectedTransferKey !== null
						? [selectedTransferKey]
						: []}
				hoverClass="hover:bg-green-600"
			/>

			<!-- Selected‐deposit cards -->
			{#if selectedTransferDeposit || selectedFeeDeposit}
				<div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
					{#if selectedTransferDeposit}
						<Card title="Transfer Deposit">
							<div class="space-y-2 text-sm">
								<div><strong>Index:</strong> {selectedTransferDeposit.index}</div>
								<div>
									<strong>Amount:</strong>
									{selectedTransferDeposit.displayAmount}
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

			{#if selectedTransferDeposit && selectedFeeDeposit}
				<div class="mt-6 grid w-full grid-cols-1 justify-items-center">
					<Card>
						<form on:submit|preventDefault={initiateTransfer} class="mt-6 flex flex-col gap-4">
							<Input
								bind:value={transferSecretAndNullifierHash}
								required
								placeholder="Recipient Hash"
								class_="w-full"
							/>
							<Input
								bind:value={transferAmount}
								required
								placeholder="Amount to Transfer"
								class_="w-full"
							/>
							<Button text="Transfer" class_="mt-2 w-full" loading={isLoading} type="submit" />
						</form>
					</Card>
				</div>
			{/if}
		{/if}
	</Card>
</div>
