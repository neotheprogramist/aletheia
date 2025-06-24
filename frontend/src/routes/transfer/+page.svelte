<script lang="ts">
	import { PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS } from '$env/static/public';
	import { getOperationDetails } from '$lib/db/operations';
	import { updateOperation } from '$lib/db/operationsDb';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { nullifyOperation } from '$lib/privacy/nullifyOperation';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { merkleTree } from '$lib/services/depositProcessor';
	import { paymasterWallet } from '$lib/stores/paymaster';
	import { provider } from '$lib/stores/provider';
	import { toastStore } from '$lib/stores/toast';
	import { selectedToken, tokens } from '$lib/stores/tokens';
	import { zkLibraries } from '$lib/stores/zkLibraries';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Instructions, { type TransferMode } from '$lib/ui/Instructions.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { fetchMergeFee } from '$lib/utils/fetchFeeForExtension';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import {
		loadDeposits,
		loadPendingEmptyDeposits,
		type DisplayOperation,
		type DisplayPendingEmptyOperation
	} from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns, defaultPendingDepositColumns } from '$lib/utils/sharedColumns';
	import { wrapWithToast } from '$lib/utils/toast';
	import { fromWei, toWei } from '$lib/utils/toWei';
	import { Copy, Trash2, Pen } from 'lucide-svelte';
	import { Contract } from 'starknet';
	import type { Component } from 'svelte';
	import { get } from 'svelte/store';
	import { supportedTokens } from '$lib/config/tokens';
	import { browser } from '$app/environment';
	import { generateHonkCalldata } from '$lib/privacy/generateProof';

	const STRK_ADDRESS = supportedTokens[0].address;

	// --- VIEW & TRANSFER STATE ---
	let viewMode: 'sender' | 'recipient' = 'sender';
	let deposits: DisplayOperation[] = [];
	let selectionMode: TransferMode = 'transfer';

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

	// --- PENDING‐EMPTY STATE & EDIT MODAL ---
	let pendingEmptyDeposits: DisplayPendingEmptyOperation[] | null = null;
	let showEditModal = false;
	let editRow: DisplayPendingEmptyOperation | null = null;
	let editToken: string = '';
	let editAmount: string = '';

	// Whenever viewMode = 'sender', load all confirmed deposits for selected token
	$: if (browser && viewMode === 'sender' && $selectedToken) {
		loadDeposits(
			$selectedToken,
			(d) => (deposits = d),
			(b) => (isLoading = b)
		);
	}

	// Whenever viewMode = 'recipient', load all pending‐empty deposits for selected token
	$: if (browser && viewMode === 'recipient' && $selectedToken) {
		loadPendingEmptyDeposits(
			$selectedToken,
			(ops) => (pendingEmptyDeposits = ops),
			(b) => (isLoading = b)
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

	function handleSelectionChange(value: string) {
		selectionMode = value as TransferMode;
		if (value === 'fee') {
			selectedToken.set(STRK_ADDRESS);
		}
	}

	/** Step 1: Validate user inputs for transfer */
	async function initiateTransfer() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedTransferDeposit || !selectedFeeDeposit) {
					throw new Error('Please select both a transfer note and a fee note');
				}

				// Parse transfer note details
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

				// Parse fee note details
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
				success: '✅ Transfer in progress!',
				error: '❌ Transfer failed'
			},
			async (err) => {
				console.warn('❌ Transfer failed with error:', err);
				isLoading = false;
			}
		);
	}

	/** Step 2: Build proof & send transfer tx */
	async function confirmTransfer() {
		showFeeModal = false;

		await wrapWithToast(
			async () => {
				if (!transferNoteBalanceWei || !userTransferAmountWei) {
					throw new Error('Cannot calculate refund – missing transfer amounts');
				}
				if (!feeNoteBalanceWei || !feeWei) {
					throw new Error('Cannot calculate refund – missing fee amounts');
				}

				// Ensure zk library / merkle tree are ready
				const { garaga } = get(zkLibraries);
				if (!garaga) throw new Error('Garaga not initialized');
				if (!feeNote || !selectedFeeDeposit || !transferNote || !selectedTransferDeposit) {
					throw new Error('Missing fee or transfer deposit');
				}
				const tree = merkleTree;
				if (!tree) throw new Error('Merkle tree does not exist');

				// Compute proof data for transfer + fee deposits
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

				// Generate refund operations
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

				// Fetch operation details from DB
				const transferOp = await getOperationDetails(selectedTransferDeposit.hash);
				const feeOp = await getOperationDetails(selectedFeeDeposit.hash);
				const transferRefundOp = await getOperationDetails(transferRefundHash);
				const feeRefundOp = await getOperationDetails(feeRefundHash);

				if (!transferOp || !feeOp || !transferRefundOp || !feeRefundOp) {
					throw new Error('One or more operations not found');
				}

				// Build witness input
				const transferInput = {
					// Deposit data
					root_1: `0x${transferProofData.root.toString(16)}`,
					secret_1: `0x${BigInt(transferOp.secret).toString(16)}`,
					nullifier_1: `0x${BigInt(transferOp.nullifier).toString(16)}`,
					commitment_amount_1: `0x${BigInt(transferOp.amount).toString(16)}`,
					token_address_1: transferOp.tokenAddress,
					hashpath_1: transferProofData.path[0].map((e) => `0x${e.toString(16)}`),
					index_1: `0x${BigInt(transferProofData.index).toString(16)}`,
					amount: `0x${userTransferAmountWei.toString(16)}`,
					// Fee deposit data
					root_2: `0x${feeProofData.root.toString(16)}`,
					secret_2: `0x${BigInt(feeOp.secret).toString(16)}`,
					nullifier_2: `0x${BigInt(feeOp.nullifier).toString(16)}`,
					commitment_amount_2: `0x${BigInt(feeOp.amount).toString(16)}`,
					token_address_2: feeOp.tokenAddress,
					hashpath_2: feeProofData.path[0].map((e) => `0x${e.toString(16)}`),
					index_2: `0x${BigInt(feeProofData.index).toString(16)}`,
					gas_fee: `0x${feeWei.toString(16)}`,
					// Refund for transfer deposit
					refund_secret_1: `0x${BigInt(transferRefundOp.secret).toString(16)}`,
					refund_nullifier_1: `0x${BigInt(transferRefundOp.nullifier).toString(16)}`,
					refund_amount_1: `0x${transferRefund.toString(16)}`,
					refund_commitment_hash_1: `0x${transferRefundCommitmentHash.toString(16)}`,
					// Refund for fee deposit
					refund_secret_2: `0x${BigInt(feeRefundOp.secret).toString(16)}`,
					refund_nullifier_2: `0x${BigInt(feeRefundOp.nullifier).toString(16)}`,
					refund_amount_2: `0x${feeRefund.toString(16)}`,
					refund_commitment_hash_2: `0x${feeRefundCommitmentHash.toString(16)}`,
					// recipient hash
					_recipient_secret_and_nullifier_hash_1: transferSecretAndNullifierHash
				};

				// Generate zk proof
				const honkCalldataHex = await generateHonkCalldata(
					'/circuits/transfer.json',
					'/circuits/recursive.json',
					'/circuits/vk_recursive.bin',
					transferInput
				);
				// Prepare StarkNet transaction
				const rpc = get(provider);
				if (!rpc) throw new Error('Missing Provider');
				const account = get(paymasterWallet);
				if (!account) throw new Error('Missing Account');
				const { abi: privacyAbi } = await rpc.getClassAt(PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS);
				if (!privacyAbi) throw new Error('Missing ABI');
				const privacy = new Contract(privacyAbi, PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS, rpc);
				privacy.connect(account);

				const honkCalldataWithLen = [
					`0x${BigInt(honkCalldataHex.length).toString(16)}`,
					...honkCalldataHex
				];

				const call = {
					contractAddress: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
					entrypoint: 'transfer',
					calldata: honkCalldataWithLen
				};
				const tx = await account.execute(call);
				const receipt = await rpc.waitForTransaction(tx.transaction_hash);

				// Check receipt
				if (receipt.isSuccess()) {
					const decimals = await fetchTokenDecimals(transferNote.tokenAddress);
					const humanAmount = fromWei(userTransferAmountWei!, decimals);

					toastStore.addToast({
						type: 'success',
						message: `Transfer succeeded: ${humanAmount} tokens of ${transferNote.tokenAddress} \n Transaction hash: ${tx.transaction_hash}`,
						duration: 30000
					});
				} else if (receipt.isReverted()) {
					console.warn('⚠️ Transaction reverted:', receipt.value);
					throw new Error(`Transaction reverted: ${receipt.value}`);
				} else {
					console.error('❌ Transaction error:', receipt.value);
					throw new Error(`Transaction error: ${receipt.value}`);
				}

				//  nullify in DB
				await nullifyOperation(selectedTransferDeposit.hash);
				await nullifyOperation(selectedFeeDeposit.hash);

				// Reset state
				resetAll();

				if (viewMode === 'sender' && $selectedToken) {
					loadDeposits(
						$selectedToken,
						(d) => (deposits = d),
						(b) => (isLoading = b)
					);
				}
			},
			{
				loading: '⏳ Sending Transfer Tx',
				success: '✅ Transfer sent!',
				error: '❌ Transfer failed'
			},
			async (err) => {
				isLoading = false;
				console.warn('❌ Transfer failed with error:', err);
				if (transferRefundHash) {
					try {
						await abortOperation(transferRefundHash);
						console.warn('🧯 Aborted refund operation:', transferRefundHash);
					} catch (abortError) {
						console.error('🚨 Failed to abort withdraw refund:', abortError);
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
			}
		);
	}

	/** Generate a new “empty” (pending) deposit operation */
	async function generateEmptyOperaition() {
		isLoading = true;

		await wrapWithToast(
			async () => {
				await generateOperation({});
			},
			{
				loading: '⏳ Generating empty operation',
				success: '✅ Generating finished',
				error: '❌ Error while generating'
			},
			(err) => {
				console.error('❌ Error generating operation:', err);
				isLoading = false;
			}
		);

		loadPendingEmptyDeposits(
			$selectedToken,
			(ops) => (pendingEmptyDeposits = ops),
			(b) => (isLoading = b)
		);
		isLoading = false;
	}

	// --- ROW ACTIONS: Copy, Abort, Edit ---
	const actions = [
		{
			icon: Copy as unknown as Component,
			handler: (row: DisplayPendingEmptyOperation) => {
				navigator.clipboard.writeText(row.fullHex);
				toastStore.addToast({
					type: 'success',
					message: 'Full hash copied to clipboard.'
				});
			},
			title: 'Copy full hex'
		},
		{
			icon: Pen as unknown as Component,
			handler: (row: DisplayPendingEmptyOperation) => {
				// Open edit modal
				editRow = row;
				editToken = '';
				editAmount = '';
				showEditModal = true;
			},
			title: 'Edit operation'
		},
		{
			icon: Trash2 as unknown as Component,
			handler: async (row: DisplayPendingEmptyOperation) => {
				try {
					await abortOperation(row.hash);
					toastStore.addToast({
						type: 'info',
						message: 'Operation aborted.'
					});
					// Refresh list
					loadPendingEmptyDeposits(
						$selectedToken,
						(ops) => (pendingEmptyDeposits = ops),
						(b) => (isLoading = b)
					);
				} catch {
					toastStore.addToast({
						type: 'error',
						message: 'Failed to abort operation.'
					});
				}
			},
			title: 'Abort operation'
		}
	];

	/** User clicks “Accept” inside the Edit Modal */
	async function onConfirmEdit() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!editRow) throw new Error('Select a deposit for edition');
				// Convert decimal amount to wei
				const decimals = await fetchTokenDecimals(editToken);
				const amountWei = toWei(editAmount, decimals);

				const { garaga } = get(zkLibraries);
				if (!garaga) throw new Error('Garaga not initialized');

				const tree = merkleTree;
				if (!tree) throw new Error('Merkle tree does not exist');

				// This will throw if proof data is missing
				const commitment = garaga.poseidonHashBN254(
						garaga.poseidonHashBN254(BigInt(editRow.hash), amountWei),
						BigInt(editToken)
					);
				tree.getProofData(
					commitment
				);

				await updateOperation({
					commitment: editRow.commitment,
					index: editRow.index,
					hash: editRow.hash,
					secret: editRow.secret,
					nullifier: editRow.nullifier,
					status: 'pending',
					data: {
						tokenAddress: editToken,
						amount: amountWei.toString()
					}
				});

				// Refresh the pending‐empty list
				loadPendingEmptyDeposits(
					$selectedToken,
					(ops) => (pendingEmptyDeposits = ops),
					(b) => (isLoading = b)
				);

				showEditModal = false;
				editRow = null;
				isLoading = false;
			},
			{
				loading: '⏳ Confirming edit…',
				success: '✅ Operation confirmed!',
				error: '❌ Failed to confirm edit'
			},
			() => {
				showEditModal = false;
				editRow = null;
				isLoading = false;
			}
		);
	}

	function onCancelEdit() {
		showEditModal = false;
		editRow = null;
	}
</script>

<ProtectedRoute>
	<div class="mx-auto p-6">
		<SelectionToggle
			options={[
				{ label: 'Sender', value: 'sender', isFirst: true },
				{ label: 'Recipient', value: 'recipient', isLast: true }
			]}
			selected={viewMode}
			onChange={(v) => (viewMode = v as 'sender' | 'recipient')}
		/>

		<Card>
			{#if viewMode === 'recipient'}
				{#if pendingEmptyDeposits?.length}
					<PaginatedTable
						columns={defaultPendingDepositColumns}
						items={pendingEmptyDeposits}
						rowActions={actions}
						pageSize={5}
						keyField="index"
					/>
				{/if}

				<div class="mt-4 grid w-full grid-cols-1 justify-items-center">
					<form
						on:submit|preventDefault={generateEmptyOperaition}
						class="flex w-full flex-col gap-4"
					>
						<Button
							text="Generate Empty Deposit"
							class_="w-full"
							loading={isLoading}
							type="submit"
						/>
					</form>
				</div>
			{:else}
				<SelectionToggle
					options={[
						{ label: 'Transfer', value: 'transfer', isFirst: true },
						{ label: 'Fee', value: 'fee', isLast: true }
					]}
					selected={selectionMode}
					onChange={handleSelectionChange}
					onReset={resetAll}
				/>
				<Instructions action="transfer" mode={selectionMode} />

				<TokenSelect
					tokens={$tokens}
					bind:value={$selectedToken}
					placeholder="Filter deposits by token"
					class_="mb-4 w-64"
					disabled={selectionMode === 'fee'}
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
						activeKey={selectionMode === 'transfer' ? selectedTransferKey : selectedFeeKey}
						inactiveKeys={selectionMode === 'transfer' && selectedFeeKey !== null
							? [selectedFeeKey]
							: selectionMode === 'fee' && selectedTransferKey !== null
								? [selectedTransferKey]
								: []}
						hoverClass="hover:bg-green-600"
					/>
				{/if}

				<SelectedDeposits
					items={[
						{ title: 'Transfer Deposit', deposit: selectedTransferDeposit },
						{ title: 'Fee Deposit', deposit: selectedFeeDeposit }
					]}
				/>

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

			<Modal
				show={showFeeModal}
				title="Confirm Transfer"
				confirmText="Accept"
				cancelText="Reject"
				closeOnOutsideClick={false}
				onConfirm={confirmTransfer}
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
					You’re about to transfer
					<strong class="break-words">{transferAmount}</strong>
					tokens, paying a fee of
					<strong class="break-words">{feeWeiHex}</strong>
					tokens. Proceed?
				</p>
			</Modal>
		</Card>
	</div>
</ProtectedRoute>

<Modal
	show={showEditModal}
	title="Edit Pending‐Empty Operation"
	confirmText="Accept"
	cancelText="Reject"
	closeOnOutsideClick={false}
	onConfirm={onConfirmEdit}
	onCancel={onCancelEdit}
	onClose={onCancelEdit}
>
	<div class="flex flex-col gap-4">
		<TokenSelect
			tokens={$tokens}
			bind:value={editToken}
			placeholder="Choose token"
			class_="w-full"
		/>
		<Input bind:value={editAmount} placeholder="Amount" class_="w-full" required />
	</div>
</Modal>
