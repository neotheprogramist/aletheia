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
	import InsufficientFeeModal from '$lib/ui/InsufficientFeeModal.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import {
		loadDeposits,
		loadPendingEmptyDeposits,
		type DisplayOperation,
		type DisplayPendingEmptyOperation
	} from '$lib/utils/loadDepositsForToken';
	import { defaultPendingDepositColumns, createElegantDepositColumns } from '$lib/utils/sharedColumns';
	import { wrapWithToast } from '$lib/utils/toast';
	import { fromWei, toWei } from '$lib/utils/toWei';
	import {
		Copy,
		Trash2,
		Pen,
		ArrowRightLeft,
		Send,
		Users,
		Shield,
		Zap,
		Lock,
		CheckCircle,
		ArrowRight,
		Hash,
		CreditCard,
		Eye,
		UserCheck,
		ArrowUpDown
	} from 'lucide-svelte';
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
	import { t } from '$lib/i18n';

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

	// Animation variables
	let transferFormElement: HTMLElement | null = null;
	let highlightForm = false;
	let stopPulsing = false;

	let transferNote: NoteData | null = null;
	let feeNote: NoteData | null = null;

	let transferSecretAndNullifierHash = '';
	let transferAmount = '';
	let transferRefundHash: string | null = null;
	let feeRefundHash: string | null = null;
	let feeWeiHex = '';

	let isLoading = false;
	let showFeeModal = false;
	let showInsufficientFeeModal = false;

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
		const clickedKey = deposits[globalIdx].index;
		
		// If clicking on already selected transfer deposit, deselect it
		if (selectedTransferKey === clickedKey) {
			resetAll();
			return;
		}
		
		// If clicking on the fee deposit, set it as transfer deposit and auto-select new fee
		if (selectedFeeKey === clickedKey) {
			// Set clicked fee deposit as the new transfer deposit
			selectedTransferKey = clickedKey;
			selectedTransferDeposit = deposits.find((d) => d.index === selectedTransferKey) ?? null;
			transferSecretAndNullifierHash = '';
			transferAmount = '';
			
			// Clear old fee selection and auto-select new fee
			selectedFeeKey = null;
			selectedFeeDeposit = null;
			autoSelectedFeeInfo = null;
			feePreloadError = null;
			showInsufficientFeeModal = false;
			
			// Auto-select new fee deposit
			if (selectedTransferDeposit) {
				autoSelectFeeDeposit();
			}
			return;
		}
		
		// Select new transfer deposit
		selectedTransferKey = clickedKey;
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
		showInsufficientFeeModal = false;
		highlightForm = false;
		stopPulsing = false;
	}

	/** Auto-select fee deposit when transfer deposit is chosen */
	async function autoSelectFeeDeposit() {
		if (!selectedTransferDeposit) return;

		feePreloadError = null;
		showInsufficientFeeModal = false;

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
				
				// Smooth scroll to transfer form after successful deposit selection
				setTimeout(() => {
					if (transferFormElement) {
						transferFormElement.scrollIntoView({ 
							behavior: 'smooth', 
							block: 'start' 
						});
						
						// Add highlight effect after scroll
						setTimeout(() => {
							highlightForm = true;
							stopPulsing = false;
							// Stop pulsing after 3 seconds, keep colors
							setTimeout(() => {
								stopPulsing = true;
							}, 3000);
						}, 600);
					}
				}, 100);
			} else {
				selectedFeeDeposit = null;
				selectedFeeKey = null;

				// Both scenarios should show the modal, not the small error alert
				showInsufficientFeeModal = true;
				// Note: We keep autoSelectedFeeInfo so modal has fee amount information
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
		progressModalActions.show($t('progress_modal.transfer.title'), [...transferProgressSteps($t)]);

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
	<div
		class="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-indigo-900/20"
	>
		<div class="mx-auto max-w-6xl p-6 pt-8">
			<!-- Header Section -->
			<div class="mb-8 text-center">
				<div class="mb-4 flex items-center justify-center gap-3">
					<div
						class="rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 p-3 text-white shadow-lg"
					>
						<ArrowRightLeft class="h-8 w-8" />
					</div>
					<h1
						class="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl"
					>
						{$t('transfer.page_title')}
					</h1>
				</div>
				<p class="text-text-secondary mx-auto max-w-3xl text-lg">
					{$t('transfer.page_description')}
				</p>
			</div>

			<!-- Mode Toggle -->
			<div class="mb-8 flex justify-center">
				<div class="rounded-xl bg-white/80 p-1 shadow-lg backdrop-blur-sm dark:bg-gray-800/80">
					<SelectionToggle
						options={[
							{ label: $t('transfer.mode_send'), value: 'sender', isFirst: true },
							{ label: $t('transfer.mode_receive'), value: 'recipient', isLast: true }
						]}
						selected={viewMode}
						onChange={(v) => (viewMode = v as 'sender' | 'recipient')}
					/>
				</div>
			</div>

			{#if viewMode === 'recipient'}
				<!-- Recipient Mode -->
				<div class="grid gap-6 lg:grid-cols-4">
					<!-- Generate Note Section -->
					<div class="space-y-6 lg:col-span-2">
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-6">
								<div class="text-center">
									<div
										class="mx-auto mb-4 w-fit rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 p-4 text-white shadow-lg"
									>
										<UserCheck class="h-8 w-8" />
									</div>
									<h2 class="text-text mb-2 text-2xl font-bold">{$t('transfer.receive_title')}</h2>
									<p class="text-text-secondary">
										{$t('transfer.receive_description')}
									</p>
								</div>

								{#if pendingEmptyDeposits?.length}
									<div class="space-y-4">
										<h3 class="text-text flex items-center gap-2 text-lg font-semibold">
											<Hash class="h-5 w-5 text-blue-500" />
											{$t('transfer.your_pending_notes')}
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
										text={$t('transfer.generate_empty_note')}
										loading={isLoading}
										type="submit"
										class_="w-full py-4 text-lg font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300"
									/>
								</form>
							</div>
						</Card>
					</div>

					<!-- Information Panel for Recipients -->
					<div class="space-y-6 lg:col-span-2">
						<!-- How to Receive -->
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-4">
								<h3 class="text-text flex items-center gap-2 text-xl font-bold">
									<Users class="h-5 w-5 text-cyan-500" />
									{$t('transfer.how_to_receive_title')}
								</h3>
								<div class="space-y-4">
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-white"
										>
											1
										</div>
										<div>
											<p class="text-text font-medium">{$t('transfer.how_to_receive_step1')}</p>
											<p class="text-text-secondary text-sm">
												{$t('transfer.how_to_receive_step1_desc')}
											</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-white"
										>
											2
										</div>
										<div>
											<p class="text-text font-medium">{$t('transfer.how_to_receive_step2')}</p>
											<p class="text-text-secondary text-sm">
												{$t('transfer.how_to_receive_step2_desc')}
											</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-white"
										>
											3
										</div>
										<div>
											<p class="text-text font-medium">{$t('transfer.how_to_receive_step3')}</p>
											<p class="text-text-secondary text-sm">
												{$t('transfer.how_to_receive_step3_desc')}
											</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white"
										>
											4
										</div>
										<div>
											<p class="text-text font-medium">{$t('transfer.how_to_receive_step4')}</p>
											<p class="text-text-secondary text-sm">
												{$t('transfer.how_to_receive_step4_desc')}
											</p>
										</div>
									</div>
								</div>
							</div>
						</Card>

						<!-- Security Features for Recipients -->
						<Card
							class_="border-0 shadow-xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20"
						>
							<div class="space-y-4">
								<h3 class="text-text flex items-center gap-2 text-xl font-bold">
									<Shield class="h-5 w-5 text-cyan-500" />
									{$t('transfer.privacy_protection_title')}
								</h3>
								<div class="space-y-3">
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-cyan-500" />
										<span class="text-text text-sm font-medium">{$t('transfer.privacy_feature1')}</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-cyan-500" />
										<span class="text-text text-sm font-medium">{$t('transfer.privacy_feature2')}</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-cyan-500" />
										<span class="text-text text-sm font-medium">{$t('transfer.privacy_feature3')}</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-cyan-500" />
										<span class="text-text text-sm font-medium">{$t('transfer.privacy_feature4')}</span>
									</div>
								</div>
							</div>
						</Card>
					</div>
				</div>
			{:else}
				<!-- Sender Mode -->
				<div class="grid gap-6 lg:grid-cols-4">
					<!-- Main Transfer Form -->
					<div class="space-y-6 lg:col-span-2">
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-6">
								<div class="text-center">
									<div
										class="mx-auto mb-4 w-fit rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 p-4 text-white shadow-lg"
									>
										<Send class="h-8 w-8" />
									</div>
									<h2 class="text-text mb-2 text-2xl font-bold">{$t('transfer.send_title')}</h2>
									<p class="text-text-secondary">
										{$t('transfer.send_description')}
									</p>
								</div>

								<!-- Token Selection -->
								<div class="space-y-3">
									<label class="text-text flex items-center gap-2 text-sm font-semibold">
										<CreditCard class="h-4 w-4" />
										{$t('transfer.filter_by_token')}
									</label>
									<TokenSelect
										tokens={$tokens}
										bind:value={$selectedToken}
										placeholder={$t('ui.deposit_page.choose_token_filter_placeholder')}
										class_="w-full"
									/>
								</div>

								<!-- Deposits Table -->
								{#if !deposits.length}
									<div class="py-8 text-center">
										<Eye class="mx-auto mb-4 h-12 w-12 text-gray-400" />
										<h3 class="text-text mb-2 text-lg font-medium">{$t('transfer.no_deposits_title')}</h3>
										<p class="text-text-secondary">
											{$t('transfer.no_deposits_description')}
										</p>
									</div>
								{:else}
									<div class="space-y-4">
										<h3 class="text-text flex items-center gap-2 text-lg font-semibold">
											<ArrowUpDown class="h-5 w-5 text-blue-500" />
											{$t('transfer.select_source_deposit')}
										</h3>
										<div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
											<PaginatedTable
												columns={createElegantDepositColumns(selectedTransferKey, selectedFeeKey, null, 'transfer')}
												items={deposits}
												pageSize={5}
												keyField="index"
												onRowClick={handleRowClick}
												disabledKeys={undefined}
												hoverClass="hover:bg-blue-50 dark:hover:bg-blue-900/20"
											/>
										</div>
									</div>
								{/if}

								<!-- Selected Deposits Display -->
								{#if selectedTransferDeposit || selectedFeeDeposit}
									<Card class_="border-0 shadow-xl bg-gray-50 dark:bg-gray-800/50">
										<div class="flex items-center gap-2 mb-4">
											<CheckCircle class="h-5 w-5 text-green-500" />
											<span class="text-lg font-semibold text-gray-700 dark:text-gray-300">Selected Deposits</span>
										</div>
										<div class="space-y-3">
											<!-- Transfer Deposit -->
											{#if selectedTransferDeposit}
												<div class="rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 p-4">
													<div class="flex items-center justify-between mb-2">
														<div class="flex items-center gap-2">
															<div class="w-2 h-2 rounded-full bg-purple-500"></div>
															<span class="text-sm font-medium text-purple-800 dark:text-purple-300">Transfer Deposit</span>
														</div>
														<button
															on:click={() => {
																selectedTransferKey = null;
																selectedTransferDeposit = null;
																if (autoSelectedFeeInfo) {
																	selectedFeeKey = null;
																	selectedFeeDeposit = null;
																	autoSelectedFeeInfo = null;
																}
															}}
															class="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 underline"
														>
															Reset
														</button>
													</div>
													<div class="flex items-center gap-2">
														<span class="font-semibold text-purple-900 dark:text-purple-100">{selectedTransferDeposit.displayAmount}</span>
														<span class="text-sm text-purple-700 dark:text-purple-400">#{selectedTransferDeposit.index}</span>
													</div>
												</div>
											{/if}

											<!-- Fee Deposit -->
											{#if selectedFeeDeposit && autoSelectedFeeInfo}
												<div class="rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4">
													<div class="flex items-center justify-between mb-2">
														<div class="flex items-center gap-2">
															<div class="w-2 h-2 rounded-full bg-blue-500"></div>
															<span class="text-sm font-medium text-blue-800 dark:text-blue-300">Fee Deposit</span>
														</div>
														<span class="text-xs text-blue-600 dark:text-blue-400 font-medium">Auto-selected</span>
													</div>
													<div class="flex items-center gap-2">
														<span class="font-semibold text-blue-900 dark:text-blue-100">{selectedFeeDeposit.displayAmount}</span>
														<span class="text-sm text-blue-700 dark:text-blue-400">#{selectedFeeDeposit.index}</span>
													</div>
													<div class="mt-2 text-xs text-blue-600 dark:text-blue-400">
														Fee: {autoSelectedFeeInfo.feeInfo.formatted} STRK
													</div>
												</div>
											{/if}
										</div>
									</Card>
								{/if}

								<!-- Auto-selected Fee Information -->
								{#if autoSelectedFeeInfo}
									<div
										class="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 dark:border-blue-800 dark:from-blue-900/20 dark:to-cyan-900/20"
									>
										<h3
											class="mb-3 flex items-center gap-2 text-base font-semibold text-blue-800 dark:text-blue-200"
										>
											<Zap class="h-4 w-4" />
											Fee Information
										</h3>
										<div class="space-y-2">
											<p class="text-sm text-blue-700 dark:text-blue-300">
												Fee: <strong>{autoSelectedFeeInfo.feeInfo.formatted} STRK</strong>
												{#if autoSelectedFeeInfo.feeDeposit}
													• Auto-selected fee deposit: <strong
														>{autoSelectedFeeInfo.feeDeposit.displayAmount}</strong
													>
												{/if}
											</p>
											
											<!-- Auto-selection explanation -->
											<div class="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/30">
												<div class="flex items-start gap-2">
													<CheckCircle class="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
													<div class="text-xs text-blue-700 dark:text-blue-300">
														<p class="font-medium mb-1">
															{$t('common.auto_fee_selection', { default: 'Automatic Fee Selection' })}
														</p>
														<p>
															{$t('common.auto_fee_transfer_explanation', { 
																default: 'The system automatically selected the best STRK deposit to pay for network fees. This deposit is separate from your transfer deposit to maintain privacy.' 
															})}
														</p>
													</div>
												</div>
											</div>
										</div>
									</div>
								{/if}

								<!-- Transfer Form -->
								{#if selectedTransferDeposit && selectedFeeDeposit && !feePreloadError}
									<Card 
										class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm {highlightForm ? 'ring-4 ring-blue-500 shadow-blue-500/25 shadow-2xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 border-blue-300 dark:border-blue-500' : ''} {highlightForm && !stopPulsing ? 'animate-pulse-scale' : ''} transition-all duration-500 ease-in-out"
										on:mouseenter={() => stopPulsing = true}
										on:click={() => stopPulsing = true}
									>
										<div class="space-y-6" bind:this={transferFormElement}>
											<h3 class="text-text flex items-center gap-2 text-xl font-bold">
												<Hash class="h-5 w-5 text-blue-500" />
												Transfer Details
											</h3>

											<form on:submit|preventDefault={initiateTransfer} class="space-y-6">
												<!-- Recipient Address -->
												<div class="space-y-3">
												<label class="text-text flex items-center gap-2 text-sm font-semibold">
													<UserCheck class="h-4 w-4" />
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
												<label class="text-text flex items-center gap-2 text-sm font-semibold">
													<ArrowRight class="h-4 w-4" />
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
														class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-blue-600"
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
										</div>
									</Card>
								{/if}
							</div>
						</Card>
					</div>

					<!-- Information Panel for Senders -->
					<div class="space-y-6 lg:col-span-2">
						<!-- How Transfer Works -->
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-4">
								<h3 class="text-text flex items-center gap-2 text-xl font-bold">
									<Zap class="h-5 w-5 text-blue-500" />
									{$t('transfer.how_transfers_work_title')}
								</h3>
								<div class="space-y-4">
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white"
										>
											1
										</div>
										<div>
											<p class="text-text font-medium">{$t('transfer.how_transfers_step1')}</p>
											<p class="text-text-secondary text-sm">
												{$t('transfer.how_transfers_step1_desc')}
											</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white"
										>
											2
										</div>
										<div>
											<p class="text-text font-medium">{$t('transfer.how_transfers_step2')}</p>
											<p class="text-text-secondary text-sm">
												{$t('transfer.how_transfers_step2_desc')}
											</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white"
										>
											3
										</div>
										<div>
											<p class="text-text font-medium">{$t('transfer.how_transfers_step3')}</p>
											<p class="text-text-secondary text-sm">
												{$t('transfer.how_transfers_step3_desc')}
											</p>
										</div>
									</div>
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-white"
										>
											4
										</div>
										<div>
											<p class="text-text font-medium">{$t('transfer.how_transfers_step4')}</p>
											<p class="text-text-secondary text-sm">
												{$t('transfer.how_transfers_step4_desc')}
											</p>
										</div>
									</div>
								</div>
							</div>
						</Card>

						<!-- Security Features -->
						<Card
							class_="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20"
						>
							<div class="space-y-4">
								<h3 class="text-text flex items-center gap-2 text-xl font-bold">
									<Lock class="h-5 w-5 text-blue-500" />
									{$t('transfer.security_features_title')}
								</h3>
								<div class="space-y-3">
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-blue-500" />
										<span class="text-text text-sm font-medium">{$t('transfer.security_feature1')}</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-blue-500" />
										<span class="text-text text-sm font-medium">{$t('transfer.security_feature2')}</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-blue-500" />
										<span class="text-text text-sm font-medium">{$t('transfer.security_feature3')}</span>
									</div>
									<div class="flex items-center gap-3">
										<CheckCircle class="h-5 w-5 text-blue-500" />
										<span class="text-text text-sm font-medium">{$t('transfer.security_feature4')}</span>
									</div>
								</div>
							</div>
						</Card>

						<!-- Quick Stats -->
						<div class="grid grid-cols-2 gap-4">
							<Card
								class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center"
							>
								<div class="space-y-2">
									<div class="text-2xl font-bold text-blue-500">{$t('transfer.stats_private')}</div>
									<div class="text-text-secondary text-sm">{$t('transfer.stats_private_label')}</div>
								</div>
							</Card>
							<Card
								class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center"
							>
								<div class="space-y-2">
									<div class="text-2xl font-bold text-cyan-500">{$t('transfer.stats_fast')}</div>
									<div class="text-text-secondary text-sm">{$t('transfer.stats_fast_label')}</div>
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
		title={$t('transfer.confirm_transfer')}
		confirmText={$t('transfer.execute_transfer')}
		cancelText={$t('common.cancel')}
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
			<div
				class="rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 p-4 dark:from-blue-900/20 dark:to-cyan-900/20"
			>
				<h3 class="text-text mb-2 font-semibold">{$t('transfer.transfer_summary')}</h3>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-text-secondary">{$t('common.amount')}:</span>
						<span class="text-text font-medium">{transferAmount} tokens</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-secondary">{$t('common.fee')}:</span>
						<span class="text-text font-medium">{feeWeiHex} STRK</span>
					</div>
				</div>
			</div>
			<p class="text-text-secondary text-sm">
				{$t('transfer.transfer_confirmation_text')}
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
	title={$t('transfer.edit_pending_note')}
	confirmText={$t('transfer.confirm_edit')}
	cancelText={$t('common.cancel')}
	closeOnOutsideClick={false}
	onConfirm={onConfirmEdit}
	onCancel={onCancelEdit}
	onClose={onCancelEdit}
>
	<div class="space-y-4">
		<div
			class="rounded-lg bg-gradient-to-r from-cyan-50 to-blue-50 p-4 dark:from-cyan-900/20 dark:to-blue-900/20"
		>
			<h3 class="text-text mb-2 flex items-center gap-2 font-semibold">
				<Pen class="h-4 w-4" />
				Update Note Details
			</h3>
			<p class="text-text-secondary text-sm">Specify the token and amount for this pending note</p>
		</div>

		<div class="space-y-4">
			<div class="space-y-2">
				<label for="edit-token" class="text-text text-sm font-medium">Token</label>
				<TokenSelect
					tokens={$tokens}
					bind:value={editToken}
					placeholder="Choose token"
					class_="w-full"
				/>
			</div>

			<div class="space-y-2">
				<label for="edit-amount" class="text-text text-sm font-medium">Amount</label>
				<Input bind:value={editAmount} placeholder="Enter amount" class_="w-full" required />
			</div>
		</div>
	</div>
</Modal>

<InsufficientFeeModal
	show={showInsufficientFeeModal}
	requiredFeeAmount={autoSelectedFeeInfo?.feeInfo.formatted || ''}
	onClose={() => {
		showInsufficientFeeModal = false;
		// Reset all deposit selections when closing modal
		resetAll();
	}}
/>

<style>
	:global(.animate-pulse-scale) {
		animation: pulse-scale 1.5s ease-in-out infinite;
	}

	@keyframes pulse-scale {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.02); }
	}
</style>
