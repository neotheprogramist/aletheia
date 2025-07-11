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
	import Modal from '$lib/ui/Modal.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
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
	import { Copy, Trash2, Pen, ArrowRightLeft, Send, Users, Shield, Zap, Lock, CheckCircle, ArrowRight, Hash, CreditCard, Eye, UserCheck, ArrowUpDown } from 'lucide-svelte';
	import { Contract } from 'starknet';
	import type { Component } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$app/environment';
	import { generateHonkCalldata } from '$lib/privacy/generateProof';
	import { autoSelectCompleteProcess, type AutoSelectedFee } from '$lib/utils/autoSelectFeeDeposit';
	import ProgressModal from '$lib/ui/ProgressModal.svelte';
	import {
		progressModalStore,
		progressModalActions,
		transferProgressSteps
	} from '$lib/stores/progressModal';

	// --- VIEW & TRANSFER STATE ---
	let viewMode: 'sender' | 'recipient' = 'sender';
	let deposits: DisplayOperation[] = [];

	let selectedTransferKey: number | null = null;
	let selectedTransferDeposit: DisplayOperation | null = null;
	let selectedFeeKey: number | null = null;
	let selectedFeeDeposit: DisplayOperation | null = null;

	// Auto-selected fee information
	let autoSelectedFeeInfo: AutoSelectedFee | null = null;
	let feePreloadError: string | null = null;

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
		selectedTransferKey = deposits[globalIdx].index;
		selectedTransferDeposit = deposits.find((d) => d.index === selectedTransferKey) ?? null;
		transferSecretAndNullifierHash = '';
		transferAmount = '';

		// Auto-select fee deposit when transfer deposit is selected
		if (selectedTransferDeposit) {
			autoSelectFeeDeposit();
		}
	}

	function resetAll() {
		selectedTransferKey = null;
		selectedTransferDeposit = null;
		selectedFeeKey = null;
		selectedFeeDeposit = null;
		autoSelectedFeeInfo = null;
		feePreloadError = null;
	}

	/** Auto-select fee deposit when transfer deposit is chosen */
	async function autoSelectFeeDeposit() {
		if (!selectedTransferDeposit) return;

		feePreloadError = null;

		try {
			// Get fee info and auto-select the best STRK deposit
			const excludeDeposits = [selectedTransferDeposit];
			autoSelectedFeeInfo = await autoSelectCompleteProcess(
				'transfer',
				PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				undefined, // transfer doesn't need extension address
				excludeDeposits
			);

			// Set the auto-selected fee deposit
			if (autoSelectedFeeInfo.feeDeposit) {
				selectedFeeDeposit = autoSelectedFeeInfo.feeDeposit;
				selectedFeeKey = autoSelectedFeeInfo.feeDeposit.index;
			} else {
				selectedFeeDeposit = null;
				selectedFeeKey = null;

				if (!autoSelectedFeeInfo.hasEnoughBalance) {
					feePreloadError = `Insufficient STRK balance. Required: ${autoSelectedFeeInfo.feeInfo.formatted} STRK`;
				} else {
					feePreloadError = 'No available STRK deposits for fee payment';
				}
			}
		} catch (error) {
			console.error('Error auto-selecting fee deposit:', error);
			feePreloadError = 'Failed to load fee information';
			autoSelectedFeeInfo = null;
		}
	}

	/** Step 1: Validate user inputs for transfer */
	async function initiateTransfer() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedTransferDeposit || !selectedFeeDeposit || !autoSelectedFeeInfo) {
					throw new Error('Please select a transfer deposit first');
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

				// Parse fee note details (auto-selected)
				feeNote = NoteDataSchema.parse(selectedFeeDeposit.data);
				const { tokenAddress: feeTokenAddress, amount: feeNoteBalance } = feeNote;

				const feeNoteDecimals = await fetchTokenDecimals(feeTokenAddress);
				feeNoteBalanceWei = BigInt(feeNoteBalance);

				// Use pre-loaded fee info
				feeWei = autoSelectedFeeInfo.feeInfo.amount;
				feeWeiHex = autoSelectedFeeInfo.feeInfo.formatted;

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
		// 1) Close the modal and start progress
		showFeeModal = false;
		progressModalActions.show('Transfer Progress', [...transferProgressSteps]);

		try {
			// 2) Validate that note balances and calculated amounts are present
			progressModalActions.updateStep('preparation', 'loading');
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
			progressModalActions.updateStep('preparation', 'completed');

			// Generate zk proof
			progressModalActions.updateStep('proof-generation', 'loading');
			const honkCalldataHex = await generateHonkCalldata(
				'/circuits/transfer.json',
				'/circuits/recursive.json',
				'/circuits/vk_recursive.bin',
				transferInput
			);
			progressModalActions.updateStep('proof-generation', 'completed');

			// Prepare StarkNet transaction
			progressModalActions.updateStep('transaction-prepare', 'loading');
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
			progressModalActions.updateStep('transaction-prepare', 'completed');

			progressModalActions.updateStep('executing-transaction', 'loading');
			const tx = await account.execute(call);
			progressModalActions.updateStep('executing-transaction', 'completed');

			progressModalActions.updateStep('onchain-confirmation', 'loading');
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

			progressModalActions.updateStep('onchain-confirmation', 'completed');

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

			setTimeout(() => {
				progressModalActions.hide();
			}, 2000);
		} catch (err) {
			// On error: abort any created refund operations
			console.warn('❌ Transfer failed with error:', err);

			const currentSteps = $progressModalStore.steps;
			const currentStepIndex = currentSteps.findIndex((step) => step.status === 'loading');
			if (currentStepIndex !== -1) {
				progressModalActions.updateStep(currentSteps[currentStepIndex].id, 'error');
			}

			if (transferRefundHash) {
				try {
					await abortOperation(transferRefundHash);
					console.warn('🧯 Aborted refund operation:', transferRefundHash);
				} catch (abortError) {
					console.error('🚨 Failed to abort transfer refund:', abortError);
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

			setTimeout(() => {
				progressModalActions.hide();
			}, 3000);
		}

		isLoading = false;
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
				tree.getProofData(commitment);

				await updateOperation({
					commitment: commitment.toString(),
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
	<div class="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-indigo-900/20">
		<div class="max-w-6xl mx-auto p-6 pt-8">
			<!-- Header Section -->
			<div class="text-center mb-8">
				<div class="flex items-center justify-center gap-3 mb-4">
					<div class="p-3 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 text-white shadow-lg">
						<ArrowRightLeft class="w-8 h-8" />
					</div>
					<h1 class="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
						Private Transfers
					</h1>
				</div>
				<p class="text-text-secondary text-lg max-w-3xl mx-auto">
					Transfer funds between private notes within the privacy pool with complete anonymity
				</p>
			</div>

			<!-- Mode Toggle -->
			<div class="flex justify-center mb-8">
				<div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-1 shadow-lg">
					<SelectionToggle
						options={[
							{ label: 'Send Transfer', value: 'sender', isFirst: true },
							{ label: 'Receive Transfer', value: 'recipient', isLast: true }
						]}
						selected={viewMode}
						onChange={(v) => (viewMode = v as 'sender' | 'recipient')}
					/>
				</div>
			</div>

			{#if viewMode === 'recipient'}
				<!-- Recipient Mode -->
				<div class="grid lg:grid-cols-3 gap-6">
					<!-- Generate Note Section -->
					<div class="lg:col-span-2 space-y-6">
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-6">
								<div class="text-center">
									<div class="p-4 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg mx-auto w-fit mb-4">
										<UserCheck class="w-8 h-8" />
									</div>
									<h2 class="text-2xl font-bold text-text mb-2">Receive Private Transfer</h2>
									<p class="text-text-secondary">
										Generate an empty note to receive private transfers from other users
									</p>
								</div>

								{#if pendingEmptyDeposits?.length}
									<div class="space-y-4">
										<h3 class="text-lg font-semibold text-text flex items-center gap-2">
											<Hash class="w-5 h-5 text-blue-500" />
											Your Pending Notes
										</h3>
										<PaginatedTable
											columns={defaultPendingDepositColumns}
											items={pendingEmptyDeposits}
											rowActions={actions}
											pageSize={5}
											keyField="index"
										/>
									</div>
								{/if}

								<form on:submit|preventDefault={generateEmptyOperaition} class="space-y-4">
									<Button
										text="Generate Empty Note"
										loading={isLoading}
										type="submit"
										class_="w-full py-4 text-lg font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300"
									/>
								</form>
							</div>
						</Card>
					</div>

					<!-- Information Panel for Recipients -->
					<div class="space-y-6">
						<!-- How to Receive -->
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-4">
								<h3 class="text-xl font-bold text-text flex items-center gap-2">
									<Users class="w-5 h-5 text-cyan-500" />
									How to Receive Transfers
								</h3>
								<div class="space-y-4">
									<div class="flex items-start gap-3">
										<div class="w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">1</div>
										<div>
											<p class="font-medium text-text">Generate Empty Note</p>
											<p class="text-sm text-text-secondary">Create a cryptographic note that can receive transfers</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div class="w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">2</div>
										<div>
											<p class="font-medium text-text">Share Note Hash</p>
											<p class="text-sm text-text-secondary">Send your note hash to the person transferring funds</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div class="w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">3</div>
										<div>
											<p class="font-medium text-text">Wait for Transfer</p>
											<p class="text-sm text-text-secondary">Your note will be funded when sender completes transfer</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div class="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">4</div>
										<div>
											<p class="font-medium text-text">Claim Your Funds</p>
											<p class="text-sm text-text-secondary">Use your funded note for withdrawals or other operations</p>
										</div>
									</div>
								</div>
							</div>
						</Card>

						<!-- Security Features for Recipients -->
						<Card class_="border-0 shadow-xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20">
							<div class="space-y-4">
								<h3 class="text-xl font-bold text-text flex items-center gap-2">
									<Shield class="w-5 h-5 text-cyan-500" />
									Privacy Protection
								</h3>
								<div class="space-y-3">
									<div class="flex items-center gap-3">
										<CheckCircle class="w-5 h-5 text-cyan-500" />
										<span class="text-sm font-medium text-text">Anonymous note generation</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="w-5 h-5 text-cyan-500" />
										<span class="text-sm font-medium text-text">No connection to your identity</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="w-5 h-5 text-cyan-500" />
										<span class="text-sm font-medium text-text">Cryptographically secure transfers</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="w-5 h-5 text-cyan-500" />
										<span class="text-sm font-medium text-text">Zero-knowledge proof validation</span>
									</div>
								</div>
							</div>
						</Card>
					</div>
				</div>
			{:else}
				<!-- Sender Mode -->
				<div class="grid lg:grid-cols-3 gap-6">
					<!-- Main Transfer Form -->
					<div class="lg:col-span-2 space-y-6">
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-6">
								<div class="text-center">
									<div class="p-4 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 text-white shadow-lg mx-auto w-fit mb-4">
										<Send class="w-8 h-8" />
									</div>
									<h2 class="text-2xl font-bold text-text mb-2">Send Private Transfer</h2>
									<p class="text-text-secondary">
										Select a deposit to transfer from. Fee deposit will be automatically selected.
									</p>
								</div>

								<!-- Token Selection -->
								<div class="space-y-3">
									<label class="flex items-center gap-2 text-sm font-semibold text-text">
										<CreditCard class="w-4 h-4" />
										Filter by Token
									</label>
									<TokenSelect
										tokens={$tokens}
										bind:value={$selectedToken}
										placeholder="Choose token to filter deposits"
										class_="w-full"
									/>
								</div>

								<!-- Deposits Table -->
								{#if !deposits.length}
									<div class="text-center py-8">
										<Eye class="w-12 h-12 text-gray-400 mx-auto mb-4" />
										<h3 class="text-lg font-medium text-text mb-2">No Deposits Found</h3>
										<p class="text-text-secondary">Please make a deposit first to start transferring!</p>
									</div>
								{:else}
									<div class="space-y-4">
										<h3 class="text-lg font-semibold text-text flex items-center gap-2">
											<ArrowUpDown class="w-5 h-5 text-blue-500" />
											Select Source Deposit
										</h3>
										<PaginatedTable
											columns={defaultDepositColumns}
											items={deposits}
											pageSize={5}
											keyField="index"
											onRowClick={handleRowClick}
											activeKey={selectedTransferKey}
											inactiveKeys={selectedFeeKey !== null ? [selectedFeeKey] : []}
											hoverClass="hover:bg-blue-50 dark:hover:bg-blue-900/20"
										/>
									</div>
								{/if}

								<!-- Auto-selected Fee Information -->
								{#if autoSelectedFeeInfo}
									<div class="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
										<h3 class="flex items-center gap-2 text-base font-semibold text-blue-800 dark:text-blue-200 mb-2">
											<Zap class="w-4 h-4" />
											Fee Information
										</h3>
										<p class="text-sm text-blue-700 dark:text-blue-300">
											Fee: <strong>{autoSelectedFeeInfo.feeInfo.formatted} STRK</strong>
											{#if autoSelectedFeeInfo.feeDeposit}
												• Auto-selected fee deposit: <strong>{autoSelectedFeeInfo.feeDeposit.displayAmount}</strong>
											{/if}
										</p>
									</div>
								{/if}

								<!-- Error Message -->
								{#if feePreloadError}
									<div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
										<p class="text-sm text-red-700 dark:text-red-300">{feePreloadError}</p>
									</div>
								{/if}

								<!-- Selected Deposits Display -->
								<SelectedDeposits
									items={[
										{ title: 'Transfer Deposit', deposit: selectedTransferDeposit },
										{ title: 'Fee Deposit (Auto-selected)', deposit: selectedFeeDeposit }
									]}
								/>

								<!-- Transfer Form -->
								{#if selectedTransferDeposit && selectedFeeDeposit && !feePreloadError}
									<Card class_="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/10 dark:to-cyan-900/10 border border-blue-200 dark:border-blue-800">
										<form on:submit|preventDefault={initiateTransfer} class="space-y-4">
											<h3 class="text-lg font-semibold text-text flex items-center gap-2">
												<Hash class="w-5 h-5 text-blue-500" />
												Transfer Details
											</h3>
											
											<div class="space-y-3">
												<label class="flex items-center gap-2 text-sm font-semibold text-text">
													<UserCheck class="w-4 h-4" />
													Recipient Hash
												</label>
												<Input
													bind:value={transferSecretAndNullifierHash}
													required
													placeholder="Enter recipient's note hash"
													class_="w-full"
												/>
											</div>

											<div class="space-y-3">
												<label class="flex items-center gap-2 text-sm font-semibold text-text">
													<ArrowRight class="w-4 h-4" />
													Transfer Amount
												</label>
												<div class="flex gap-2">
													<Input
														bind:value={transferAmount}
														required
														placeholder="Amount to transfer"
														class_="flex-1"
													/>
													<button
														type="button"
														class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors duration-200"
														on:click={() => {
															if (selectedTransferDeposit) {
																transferAmount = selectedTransferDeposit.displayAmount;
															}
														}}
													>
														Max
													</button>
												</div>
											</div>

											<Button 
												text="Execute Transfer" 
												loading={isLoading} 
												type="submit"
												class_="w-full py-4 text-lg font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg hover:shadow-xl transition-all duration-300" 
											/>
										</form>
									</Card>
								{/if}
							</div>
						</Card>
					</div>

					<!-- Information Panel for Senders -->
					<div class="space-y-6">
						<!-- How Transfer Works -->
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-4">
								<h3 class="text-xl font-bold text-text flex items-center gap-2">
									<Zap class="w-5 h-5 text-blue-500" />
									How Transfers Work
								</h3>
								<div class="space-y-4">
									<div class="flex items-start gap-3">
										<div class="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">1</div>
										<div>
											<p class="font-medium text-text">Select Source Note</p>
											<p class="text-sm text-text-secondary">Choose which private note to transfer from</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div class="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">2</div>
										<div>
											<p class="font-medium text-text">Get Recipient Hash</p>
											<p class="text-sm text-text-secondary">Recipient shares their empty note hash with you</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div class="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">3</div>
										<div>
											<p class="font-medium text-text">Set Amount</p>
											<p class="text-sm text-text-secondary">Specify how much to transfer (partial or full)</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div class="w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">4</div>
										<div>
											<p class="font-medium text-text">Anonymous Transfer</p>
											<p class="text-sm text-text-secondary">Notes are swapped with zero-knowledge proofs</p>
										</div>
									</div>
								</div>
							</div>
						</Card>

						<!-- Security Features -->
						<Card class_="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
							<div class="space-y-4">
								<h3 class="text-xl font-bold text-text flex items-center gap-2">
									<Lock class="w-5 h-5 text-blue-500" />
									Security Features
								</h3>
								<div class="space-y-3">
									<div class="flex items-center gap-3">
										<CheckCircle class="w-5 h-5 text-blue-500" />
										<span class="text-sm font-medium text-text">Complete sender anonymity</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="w-5 h-5 text-blue-500" />
										<span class="text-sm font-medium text-text">No on-chain connection between parties</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="w-5 h-5 text-blue-500" />
										<span class="text-sm font-medium text-text">Cryptographic note validation</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="w-5 h-5 text-blue-500" />
										<span class="text-sm font-medium text-text">Automated fee handling</span>
									</div>
								</div>
							</div>
						</Card>

						<!-- Quick Stats -->
						<div class="grid grid-cols-2 gap-4">
							<Card class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center">
								<div class="space-y-2">
									<div class="text-2xl font-bold text-blue-500">100%</div>
									<div class="text-sm text-text-secondary">Private</div>
								</div>
							</Card>
							<Card class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center">
								<div class="space-y-2">
									<div class="text-2xl font-bold text-cyan-500">⚡</div>
									<div class="text-sm text-text-secondary">Fast</div>
								</div>
							</Card>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Confirmation Modal -->
	<Modal
		show={showFeeModal}
		title="Confirm Transfer"
		confirmText="Execute Transfer"
		cancelText="Cancel"
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
		<div class="space-y-4">
			<div class="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4">
				<h3 class="font-semibold text-text mb-2">Transfer Summary</h3>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-text-secondary">Amount:</span>
						<span class="font-medium text-text">{transferAmount} tokens</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-secondary">Fee:</span>
						<span class="font-medium text-text">{feeWeiHex} STRK</span>
					</div>
				</div>
			</div>
			<p class="text-sm text-text-secondary">
				This transfer will destroy your source note and fund the recipient's note. This action cannot be reversed.
			</p>
		</div>
	</Modal>

	<!-- Progress Modal -->
	<ProgressModal
		show={$progressModalStore.show}
		title={$progressModalStore.title}
		steps={$progressModalStore.steps}
		onClose={progressModalActions.hide}
	/>
</ProtectedRoute>

<!-- Edit Modal -->
<Modal
	show={showEditModal}
	title="Edit Pending Note"
	confirmText="Confirm Edit"
	cancelText="Cancel"
	closeOnOutsideClick={false}
	onConfirm={onConfirmEdit}
	onCancel={onCancelEdit}
	onClose={onCancelEdit}
>
	<div class="space-y-4">
		<div class="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-lg p-4">
			<h3 class="font-semibold text-text mb-2 flex items-center gap-2">
				<Pen class="w-4 h-4" />
				Update Note Details
			</h3>
			<p class="text-sm text-text-secondary">
				Specify the token and amount for this pending note
			</p>
		</div>
		
		<div class="space-y-4">
			<div class="space-y-2">
				<label for="edit-token" class="text-sm font-medium text-text">Token</label>
				<TokenSelect
					tokens={$tokens}
					bind:value={editToken}
					placeholder="Choose token"
					class_="w-full"
				/>
			</div>
			
			<div class="space-y-2">
				<label for="edit-amount" class="text-sm font-medium text-text">Amount</label>
				<Input 
					bind:value={editAmount} 
					placeholder="Enter amount" 
					class_="w-full" 
					required 
				/>
			</div>
		</div>
	</div>
</Modal>
