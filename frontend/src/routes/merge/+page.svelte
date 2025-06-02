<script lang="ts">
	import { PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS } from '$env/static/public';
	import { getOperationDetails } from '$lib/db/operations';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { confirmOperation } from '$lib/privacy/confirmOperation';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { generateProof } from '$lib/privacy/generateProof';
	import { nullifyOperation } from '$lib/privacy/nullifyOperation';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { merkleTree } from '$lib/services/depositProcessor';
	import { paymasterWallet } from '$lib/stores/paymaster';
	import { provider } from '$lib/stores/provider';
	import { toastStore } from '$lib/stores/toast';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import { zkLibraries } from '$lib/stores/zkLibraries';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Instructions, { type MergeMode } from '$lib/ui/Instructions.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { fetchMergeFee } from '$lib/utils/fetchFeeForExtension';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import {
		getDisplayDepositsForToken,
		type DisplayOperation
	} from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns } from '$lib/utils/sharedColumns';
	import { wrapWithToast } from '$lib/utils/toast';
	import { fromWei } from '$lib/utils/toWei';
	import { Contract } from 'starknet';
	import { get } from 'svelte/store';

	let deposits: DisplayOperation[] = [];
	let selectionMode: MergeMode = 'merge1';

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

	let mergeRefundHash: string | null = null;
	let feeRefundHash: string | null = null;
	let feeWeiHex = '';

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

	function resetAll() {
		selectedMerge1Key = null;
		selectedMerge1Deposit = null;
		selectedMerge2Key = null;
		selectedMerge2Deposit = null;
		selectedFeeKey = null;
		selectedFeeDeposit = null;
	}

	function handleSelectionChange(value: string) {
		selectionMode = value as 'merge1' | 'merge2' | 'fee';
	}

	/** Step 1: Validate*/
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
				loading: '⏳ Executing Merge',
				success: '✅ Merge ready!',
				error: '❌ Merge failed'
			},
			async (err) => {
				isLoading = false;
			}
		);
	}

	/** Step 2: Proving & Execution */
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
				const mergeRefund = merge1NoteBalanceWei + merge2NoteBalanceWei;
				const mergeOpResult = await generateOperation({
					data: { tokenAddress: mergeNote1.tokenAddress, amount: mergeRefund }
				});
				mergeRefundHash = mergeOpResult.hash;
				const mergeRefundCommitmentHash = garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(mergeRefundHash), mergeRefund),
					BigInt(mergeNote1.tokenAddress)
				);

				const feeRefund = feeNoteBalanceWei - feeWei;
				const feeOpResult = await generateOperation({
					data: { tokenAddress: feeNote.tokenAddress, amount: feeRefund }
				});
				feeRefundHash = feeOpResult.hash;

				const feeRefundCommitmentHash = garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(feeRefundHash), feeRefund),
					BigInt(feeNote.tokenAddress)
				);

				// 6) Fetch details for all operations from the database
				const merge1Op = await getOperationDetails(selectedMerge1Deposit.hash);
				const merge2Op = await getOperationDetails(selectedMerge2Deposit.hash);
				const feeOp = await getOperationDetails(selectedFeeDeposit.hash);
				const mergeRefundOp = await getOperationDetails(mergeRefundHash);
				const feeRefundOp = await getOperationDetails(feeRefundHash);

				if (!merge1Op || !merge2Op || !feeOp || !mergeRefundOp || !feeRefundOp) {
					throw new Error('One or more operations not found');
				}

				// 7) Build the witness input object for proof
				const witnessInput = {
					// First deposit
					secret_1: `0x${BigInt(merge1Op.secret).toString(16)}`,
					nullifier_1: `0x${BigInt(merge1Op.nullifier).toString(16)}`,
					commitment_amount_1: `0x${BigInt(merge1Op.amount).toString(16)}`,
					token_address_1: merge1Op.tokenAddress,
					hashpath_1: merge1ProofData.path[0].map((e) => `0x${e.toString(16)}`),
					index_1: `0x${BigInt(merge1ProofData.index).toString(16)}`,
					root_1: `0x${merge1ProofData.root.toString(16)}`,
					// Second deposit
					secret_2: `0x${BigInt(merge2Op.secret).toString(16)}`,
					nullifier_2: `0x${BigInt(merge2Op.nullifier).toString(16)}`,
					commitment_amount_2: `0x${BigInt(merge2Op.amount).toString(16)}`,
					token_address_2: merge2Op.tokenAddress,
					hashpath_2: merge2ProofData.path[0].map((e) => `0x${e.toString(16)}`),
					index_2: `0x${BigInt(merge2ProofData.index).toString(16)}`,
					root_2: `0x${merge2ProofData.root.toString(16)}`,
					// Fee deposit
					secret_3: `0x${BigInt(feeOp.secret).toString(16)}`,
					nullifier_3: `0x${BigInt(feeOp.nullifier).toString(16)}`,
					commitment_amount_3: `0x${BigInt(feeOp.amount).toString(16)}`,
					token_address_3: feeOp.tokenAddress,
					hashpath_3: feeProofData.path[0].map((e) => `0x${e.toString(16)}`),
					index_3: `0x${BigInt(feeProofData.index).toString(16)}`,
					root_3: `0x${feeProofData.root.toString(16)}`,
					gas_fee: `0x${feeWei.toString(16)}`,
					// Refund fee deposit
					refund_secret_1: `0x${BigInt(feeRefundOp.secret).toString(16)}`,
					refund_nullifier_1: `0x${BigInt(feeRefundOp.nullifier).toString(16)}`,
					refund_amount_1: `0x${feeRefund.toString(16)}`,
					refund_commitment_hash_1: `0x${feeRefundCommitmentHash.toString(16)}`,
					// Refund for merge deposits
					refund_secret_2: `0x${BigInt(mergeRefundOp.secret).toString(16)}`,
					refund_nullifier_2: `0x${BigInt(mergeRefundOp.nullifier).toString(16)}`,
					refund_amount_2: `0x${mergeRefund.toString(16)}`,
					refund_commitment_hash_2: `0x${mergeRefundCommitmentHash.toString(16)}`
				};

				// 8) Generate the zk proof and prepare it as calldata
				const proofToastId = toastStore.addToast({
					type: 'info',
					message: '⏳ Generating zk proof, this may take ~15 seconds…'
				});

				const honkCalldataHex = await generateProof(witnessInput, {
					jsonUrl: 'circuits/merge.json',
					vkUrl: 'circuits/vk_merge.bin'
				});

				const honkCalldataWithLen = [
					`0x${BigInt(honkCalldataHex.length).toString(16)}`,
					...honkCalldataHex
				];

				toastStore.removeToast(proofToastId);

				// 9) Prepare for the StarkNet transaction
				const rpc = get(provider);
				if (!rpc) throw new Error('Missing Provider');

				const account = get(paymasterWallet);
				if (!account) throw new Error('Missing Account');

				const { abi: privacyAbi } = await rpc.getClassAt(PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS);
				if (!privacyAbi) throw new Error('Missing ABI');

				const privacy = new Contract(privacyAbi, PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS, rpc);
				privacy.connect(account);

				// 10) Prepare Starknet call
				const call = {
					contractAddress: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
					entrypoint: 'merge',
					calldata: honkCalldataWithLen
				};

				const tx = await account.execute(call);
				const receipt = await rpc.waitForTransaction(tx.transaction_hash);

				// 10) Check receipt status and throw on failure
				if (receipt.isSuccess()) {
				} else if (receipt.isReverted()) {
					throw new Error(`Transaction reverted: ${receipt.value}`);
				} else {
					throw new Error(`Transaction error: ${receipt.value}`);
				}

				// 11) Confirm and nullify operations in the database
				await confirmOperation(mergeRefundHash);
				await confirmOperation(feeRefundHash);
				await nullifyOperation(selectedMerge1Deposit.hash);
				await nullifyOperation(selectedMerge2Deposit.hash);
				await nullifyOperation(selectedFeeDeposit.hash);

				// 12) Reset component state after successful withdrawal
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

				if (mergeRefundHash) {
					try {
						await abortOperation(mergeRefundHash);
						console.warn('🧯 Aborted merge refund operation:', mergeRefundHash);
					} catch (abortError) {
						console.error('🚨 Failed to abort merge refund:', abortError);
					}
				}

				if (feeRefundHash) {
					try {
						await abortOperation(feeRefundHash);
						console.warn('🧯 Aborted fee refund operation:', feeRefundHash);
					} catch (abortError) {
						console.error('🚨 Failed to abort fee refund:', abortError);
					}
				}

				isLoading = false;
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
			<SelectionToggle
				options={[
					{ label: 'First', value: 'merge1', isFirst: true },
					{ label: 'Second', value: 'merge2' },
					{ label: 'Fee', value: 'fee', isLast: true }
				]}
				selected={selectionMode}
				onChange={handleSelectionChange}
				onReset={resetAll}
			/>
			<Instructions action="merge" mode={selectionMode} />
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
				disabledKeys={undefined}
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
