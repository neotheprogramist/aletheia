<script lang="ts">
	import { t } from '$lib/i18n';
	import { wrapWithToast } from '$lib/utils/toast';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import ProgressModal from '$lib/ui/ProgressModal.svelte';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { fromWei, toWei } from '$lib/utils/toWei';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { fetchExtensionFee } from '$lib/utils/fetchFeeForExtension';
	import Modal from '$lib/ui/Modal.svelte';
	import InsufficientFeeModal from '$lib/ui/InsufficientFeeModal.svelte';
	import {
		PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
		PUBLIC_WITHDRAW_EXTENSION_CONTRACT_ADDRESS
	} from '$env/static/public';
	import { get } from 'svelte/store';
	import { zkLibraries } from '$lib/stores/zkLibraries';
	import { merkleTree } from '$lib/services/depositProcessor';
	import Input from '$lib/ui/Input.svelte';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { getOperationDetails } from '$lib/db/operations';
	import { paymasterWallet } from '$lib/stores/paymaster';
	import { provider } from '$lib/stores/provider';
	import { Contract } from 'starknet';
	import { nullifyOperation } from '$lib/privacy/nullifyOperation';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { loadDeposits, type DisplayOperation } from '$lib/utils/loadDepositsForToken';
	import { createElegantDepositColumns } from '$lib/utils/sharedColumns';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';
	import { supportedTokens } from '$lib/config/tokens';
	import { browser } from '$app/environment';
	import { generateHonkCalldata } from '$lib/privacy/generateProof';
	import { autoSelectCompleteProcess, type AutoSelectedFee } from '$lib/utils/autoSelectFeeDeposit';
	import {
		progressModalStore,
		progressModalActions,
		withdrawProgressSteps
	} from '$lib/stores/progressModal';
	import {
		Eye,
		Shield,
		ArrowDown,
		Wallet,
		CheckCircle,
		AlertTriangle,
		DollarSign,
		Users,
		Zap
	} from 'lucide-svelte';

	const STRK_ADDRESS = supportedTokens[0].address;

	let deposits: DisplayOperation[] = [];

	let selectedWithdrawKey: number | null = null;
	let selectedWithdrawDeposit: DisplayOperation | null = null;
	let selectedFeeKey: number | null = null;
	let selectedFeeDeposit: DisplayOperation | null = null;

	// Auto-selected fee information
	let autoSelectedFeeInfo: AutoSelectedFee | null = null;
	let feePreloadError: string | null = null;

	let withdrawNote: NoteData | null = null;
	let feeNote: NoteData | null = null;

	let withdrawRecipient = '';
	let withdrawAmount = '';
	let withdrawRefundHash: string | null = null;
	let feeRefundHash: string | null = null;
	let feeWeiHex = '';

	let isLoading = false;
	let showFeeModal = false;
	let showInsufficientFeeModal = false;

	// Confirmation data
	let withdrawNoteBalanceWei: bigint | null = null;
	let userWithdrawAmountWei: bigint | null = null;
	let feeNoteBalanceWei: bigint | null = null;
	let feeWei: bigint | null = null;

	// Element reference for smooth scrolling
	let withdrawFormElement: HTMLElement;
	let highlightForm = false;
	let stopPulsing = false;

	$: if (browser && $selectedToken) {
		loadDeposits(
			$selectedToken,
			(d) => (deposits = d),
			(b) => (isLoading = b)
		);
	}

	function handleRowClick(globalIdx: number) {
		const clickedKey = deposits[globalIdx].index;
		
		// If clicking on already selected withdraw deposit, deselect it
		if (selectedWithdrawKey === clickedKey) {
			resetAll();
			return;
		}
		
		// If clicking on the fee deposit, set it as operation deposit and auto-select new fee
		if (selectedFeeKey === clickedKey) {
			// Set clicked fee deposit as the new operation deposit
			selectedWithdrawKey = clickedKey;
			selectedWithdrawDeposit = deposits.find((d) => d.index === selectedWithdrawKey) ?? null;
			withdrawRecipient = '';
			withdrawAmount = '';
			
			// Clear old fee selection and auto-select new fee
			selectedFeeKey = null;
			selectedFeeDeposit = null;
			autoSelectedFeeInfo = null;
			feePreloadError = null;
			showInsufficientFeeModal = false;
			
			// Auto-select new fee deposit
			if (selectedWithdrawDeposit) {
				autoSelectFeeDeposit();
			}
			return;
		}
		
		// Select new withdraw deposit
		selectedWithdrawKey = clickedKey;
		selectedWithdrawDeposit = deposits.find((d) => d.index === selectedWithdrawKey) ?? null;
		withdrawRecipient = '';
		withdrawAmount = '';

		// Auto-select fee deposit when withdraw deposit is selected
		if (selectedWithdrawDeposit) {
			autoSelectFeeDeposit();
		}
	}

	function resetAll() {
		selectedWithdrawKey = null;
		selectedWithdrawDeposit = null;
		selectedFeeKey = null;
		selectedFeeDeposit = null;
		autoSelectedFeeInfo = null;
		feePreloadError = null;
		showInsufficientFeeModal = false;
	}


	/** Auto-select fee deposit when withdraw deposit is chosen */
	async function autoSelectFeeDeposit() {
		if (!selectedWithdrawDeposit) return;

		feePreloadError = null;
		showInsufficientFeeModal = false;

		try {
			// Get fee info and auto-select the best STRK deposit
			const excludeDeposits = [selectedWithdrawDeposit];
			autoSelectedFeeInfo = await autoSelectCompleteProcess(
				'withdraw',
				PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				PUBLIC_WITHDRAW_EXTENSION_CONTRACT_ADDRESS,
				excludeDeposits
			);

			// Set the auto-selected fee deposit
			if (autoSelectedFeeInfo.feeDeposit) {
				selectedFeeDeposit = autoSelectedFeeInfo.feeDeposit;
				selectedFeeKey = autoSelectedFeeInfo.feeDeposit.index;
				
				// Smooth scroll to withdraw form after successful deposit selection
				setTimeout(() => {
					if (withdrawFormElement) {
						withdrawFormElement.scrollIntoView({ 
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

	/** Step 1: Validate */
	async function initiateWithdraw() {
		isLoading = true;
		try {
			if (!selectedWithdrawDeposit || !selectedFeeDeposit || !autoSelectedFeeInfo) {
				throw new Error('Please select a withdraw deposit first');
			}

			// — Parse Withdraw note
			withdrawNote = NoteDataSchema.parse(selectedWithdrawDeposit.data);
			const { tokenAddress: withdrawTokenAddress, amount: withdrawNoteBalance } = withdrawNote;

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

			// — Parse Fee note (auto-selected)
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
		} catch (err) {
			console.warn('❌ Withdraw failed with error:', err);
			isLoading = false;
		}
	}

	/** Step 2: Proving & Execution */
	async function confirmWithdraw() {
		// 1) Close the modal and start progress
		showFeeModal = false;
		progressModalActions.show($t('progress_modal.withdraw.title'), [...withdrawProgressSteps($t)]);

		try {
			// 2) Validate that note balances and calculated amounts are present
			progressModalActions.updateStep('preparation', 'loading');
			if (!withdrawNoteBalanceWei || !userWithdrawAmountWei) {
				throw new Error('Cannot calculate refund – missing withdraw amounts');
			}
			if (!feeNoteBalanceWei || !feeWei) {
				throw new Error('Cannot calculate refund – missing fee amounts');
			}

			// 3) Ensure zk library and merkle tree are initialized
			const { garaga } = get(zkLibraries);
			if (!garaga) throw new Error('Garaga not initialized');
			if (!feeNote || !selectedFeeDeposit || !withdrawNote || !selectedWithdrawDeposit) {
				throw new Error('Missing fee or withdraw deposit');
			}
			const tree = merkleTree;
			if (!tree) throw new Error('Merkle tree does not exist');

			// 4) Compute commitments for the withdraw and fee deposits
			// And get the data for proving
			const withdrawProofData = tree.getProofData(
				garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(selectedWithdrawDeposit.hash), withdrawNoteBalanceWei),
					BigInt(withdrawNote.tokenAddress)
				)
			);
			const feeProofData = tree.getProofData(
				garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(selectedFeeDeposit.hash), feeNoteBalanceWei),
					BigInt(feeNote.tokenAddress)
				)
			);

			// 5) Generate refund operations and compute their commitment hashes
			const withdrawRefund = withdrawNoteBalanceWei - userWithdrawAmountWei;
			const withdrawOpResult = await generateOperation({
				data: { tokenAddress: withdrawNote.tokenAddress, amount: withdrawRefund }
			});
			withdrawRefundHash = withdrawOpResult.hash;

			const feeRefund = feeNoteBalanceWei - feeWei;
			const feeOpResult = await generateOperation({
				data: { tokenAddress: feeNote.tokenAddress, amount: feeRefund }
			});
			feeRefundHash = feeOpResult.hash;

			const withdrawRefundCommitmentHash = garaga.poseidonHashBN254(
				garaga.poseidonHashBN254(BigInt(withdrawRefundHash), withdrawRefund),
				BigInt(withdrawNote.tokenAddress)
			);
			const feeRefundCommitmentHash = garaga.poseidonHashBN254(
				garaga.poseidonHashBN254(BigInt(feeRefundHash), feeRefund),
				BigInt(feeNote.tokenAddress)
			);

			// 6) Fetch details for all operations from the database
			const withdrawOp = await getOperationDetails(selectedWithdrawDeposit.hash);
			const feeOp = await getOperationDetails(selectedFeeDeposit.hash);
			const withdrawRefundOp = await getOperationDetails(withdrawRefundHash);
			const feeRefundOp = await getOperationDetails(feeRefundHash);

			if (!withdrawOp || !feeOp || !withdrawRefundOp || !feeRefundOp) {
				throw new Error('One or more operations not found');
			}

			// 7) Build the witness input object for proof
			const executeInput = {
				// Deposit data
				root_1: `0x${withdrawProofData.root.toString(16)}`,
				secret_1: `0x${BigInt(withdrawOp.secret).toString(16)}`,
				nullifier_1: `0x${BigInt(withdrawOp.nullifier).toString(16)}`,
				commitment_amount_1: `0x${BigInt(withdrawOp.amount).toString(16)}`,
				token_address_1: withdrawOp.tokenAddress,
				hashpath_1: withdrawProofData.path[0].map((e) => `0x${e.toString(16)}`),
				index_1: `0x${BigInt(withdrawProofData.index).toString(16)}`,
				amount: `0x${userWithdrawAmountWei.toString(16)}`,
				// Fee deposit data
				root_2: `0x${feeProofData.root.toString(16)}`,
				secret_2: `0x${BigInt(feeOp.secret).toString(16)}`,
				nullifier_2: `0x${BigInt(feeOp.nullifier).toString(16)}`,
				commitment_amount_2: `0x${BigInt(feeOp.amount).toString(16)}`,
				token_address_2: feeOp.tokenAddress,
				hashpath_2: feeProofData.path[0].map((e) => `0x${e.toString(16)}`),
				index_2: `0x${BigInt(feeProofData.index).toString(16)}`,
				gas_fee: `0x${feeWei.toString(16)}`,
				// Refund for withdraw deposit
				refund_secret_1: `0x${BigInt(withdrawRefundOp.secret).toString(16)}`,
				refund_nullifier_1: `0x${BigInt(withdrawRefundOp.nullifier).toString(16)}`,
				refund_amount_1: `0x${withdrawRefund.toString(16)}`,
				refund_commitment_hash_1: `0x${withdrawRefundCommitmentHash.toString(16)}`,
				// Refund for fee deposit
				refund_secret_2: `0x${BigInt(feeRefundOp.secret).toString(16)}`,
				refund_nullifier_2: `0x${BigInt(feeRefundOp.nullifier).toString(16)}`,
				refund_amount_2: `0x${feeRefund.toString(16)}`,
				refund_commitment_hash_2: `0x${feeRefundCommitmentHash.toString(16)}`,
				// recipient
				_recipient: withdrawRecipient
			};
			progressModalActions.updateStep('preparation', 'completed');

			// 8) Generate the zk proof and prepare it as calldata
			progressModalActions.updateStep('proof-generation', 'loading');
			const honkCalldataHex = await generateHonkCalldata(
				'/circuits/execute.json',
				'/circuits/recursive.json',
				'/circuits/vk_recursive.bin',
				executeInput
			);
			progressModalActions.updateStep('proof-generation', 'completed');

			// 9) Prepare for the StarkNet transaction
			progressModalActions.updateStep('transaction-prepare', 'loading');
			const rpc = get(provider);
			if (!rpc) throw new Error('Missing Provider');

			const account = get(paymasterWallet);
			if (!account) throw new Error('Missing Account');

			const { abi: privacyAbi } = await rpc.getClassAt(PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS);
			if (!privacyAbi) throw new Error('Missing ABI');

			const privacy = new Contract(privacyAbi, PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS, rpc);
			privacy.connect(account);

			// 10) Prepare calldata and Starknet call
			const extensionCalldata = [
				PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				withdrawRecipient,
				selectedWithdrawDeposit.data.tokenAddress,
				`0x${userWithdrawAmountWei.toString(16)}`
			];

			const extensionCalldataWithLen = [
				`0x${BigInt(extensionCalldata.length).toString(16)}`,
				...extensionCalldata
			];

			const honkCalldataWithLen = [
				`0x${BigInt(honkCalldataHex.length).toString(16)}`,
				...honkCalldataHex
			];

			const call = {
				contractAddress: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				entrypoint: 'execute_extension',
				calldata: [
					...honkCalldataWithLen,
					PUBLIC_WITHDRAW_EXTENSION_CONTRACT_ADDRESS,
					...extensionCalldataWithLen
				]
			};
			progressModalActions.updateStep('transaction-prepare', 'completed');

			progressModalActions.updateStep('executing-transaction', 'loading');
			const tx = await account.execute(call);
			progressModalActions.updateStep('executing-transaction', 'completed');

			progressModalActions.updateStep('onchain-confirmation', 'loading');
			const receipt = await rpc.waitForTransaction(tx.transaction_hash);

			// 10) Check receipt status and throw on failure
			if (receipt.isReverted()) {
				throw new Error(`Transaction reverted: ${receipt.value}`);
			} else if (!receipt.isSuccess()) {
				throw new Error(`Transaction error: ${receipt.value}`);
			}

			progressModalActions.updateStep('onchain-confirmation', 'completed');

			// 11) Confirm and nullify operations in the database
			await nullifyOperation(selectedWithdrawDeposit.hash);
			await nullifyOperation(selectedFeeDeposit.hash);

			// 12) Reset component state after successful withdrawal
			resetAll();

			if ($selectedToken) {
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
			// 13) On error: abort any created refund operations
			console.warn('❌ Withdraw failed with error:', err);

			const currentSteps = $progressModalStore.steps;
			const currentStepIndex = currentSteps.findIndex((step) => step.status === 'loading');
			if (currentStepIndex !== -1) {
				progressModalActions.updateStep(currentSteps[currentStepIndex].id, 'error');
			}

			if (withdrawRefundHash) {
				try {
					await abortOperation(withdrawRefundHash);
					console.warn('🧯 Aborted refund operation:', withdrawRefundHash);
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

			setTimeout(() => {
				progressModalActions.hide();
			}, 3000);
		}

		isLoading = false;
	}
</script>

<ProtectedRoute>
	<div
		class="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
	>
		<div class="mx-auto max-w-6xl p-6 pt-8">
			<!-- Header Section -->
			<div class="mb-8 text-center">
				<div class="mb-4 flex items-center justify-center gap-3">
					<div
						class="rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 p-3 text-white shadow-lg"
					>
						<ArrowDown class="h-8 w-8" />
					</div>
					<h1
						class="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl"
					>
						{$t('ui.withdraw_page.title')}
					</h1>
				</div>
				<p class="text-text-secondary mx-auto max-w-2xl text-lg">
					{$t('ui.withdraw_page.subtitle')}
				</p>
			</div>

			<div class="grid gap-6 lg:grid-cols-4">
				<!-- Main Withdrawal Form -->
				<div class="space-y-6 lg:col-span-2">
					<!-- Token Filter and Deposits Table -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-6">
							<div class="flex items-center justify-between">
								<h3 class="text-text flex items-center gap-2 text-xl font-bold">
									<Eye class="h-5 w-5 text-purple-500" />
									{$t('ui.withdraw_page.select_deposit')}
								</h3>
							</div>

							<div class="space-y-4">
								<!-- Token Selection -->
								<div class="space-y-3">
									<label class="text-text flex items-center gap-2 text-sm font-semibold">
										<DollarSign class="h-4 w-4" />
										{$t('ui.withdraw_page.filter_by_token')}
									</label>
									<TokenSelect
										tokens={$tokens}
										bind:value={$selectedToken}
										placeholder={$t('deposit.select_token')}
										class_="w-full sm:w-80"
									/>
								</div>

								<!-- Deposits Table -->
								{#if !deposits.length}
									<div class="py-12 text-center">
										<div
											class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
										>
											<Wallet class="h-8 w-8 text-gray-400" />
										</div>
										<h3 class="text-text mb-2 text-lg font-medium">{$t('common.no_deposits_found', { default: 'No Deposits Found' })}</h3>
										<p class="text-text-secondary">
											{$t('common.make_deposit_first', { default: 'Make a deposit first to start withdrawing privately!' })}
										</p>
									</div>
								{:else}
									<div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
										<PaginatedTable
											columns={createElegantDepositColumns(selectedWithdrawKey, selectedFeeKey, null, 'withdraw')}
											items={deposits}
											pageSize={5}
											keyField="index"
											disabledKeys={undefined}
											onRowClick={handleRowClick}
											activeKey={null}
											inactiveKeys={[]}
											hoverClass="hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 dark:hover:from-purple-900/30 dark:hover:to-pink-900/30 transition-all duration-200"
										/>
									</div>
								{/if}
							</div>
						</div>
					</Card>

					<!-- Selected Deposits Display -->
					{#if selectedWithdrawDeposit || selectedFeeDeposit}
						<Card class_="border-0 shadow-xl bg-gray-50 dark:bg-gray-800/50">
							<div class="flex items-center gap-2 mb-4">
								<CheckCircle class="h-5 w-5 text-green-500" />
								<span class="text-lg font-semibold text-gray-700 dark:text-gray-300">Selected Deposits</span>
							</div>
							<div class="space-y-3">
								<!-- Operation Deposit -->
								{#if selectedWithdrawDeposit}
									<div class="rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 p-4">
										<div class="flex items-center justify-between mb-2">
											<div class="flex items-center gap-2">
												<div class="w-2 h-2 rounded-full bg-purple-500"></div>
												<span class="text-sm font-medium text-purple-800 dark:text-purple-300">Operation Deposit</span>
											</div>
											<button
												on:click={() => resetAll()}
												class="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 underline"
											>
												Remove
											</button>
										</div>
										<div class="flex items-center gap-2">
											<span class="font-semibold text-purple-900 dark:text-purple-100">{selectedWithdrawDeposit.displayAmount}</span>
											<span class="text-sm text-purple-700 dark:text-purple-400">#{selectedWithdrawDeposit.index}</span>
										</div>
									</div>
								{/if}

								<!-- Fee Deposit -->
								{#if selectedFeeDeposit}
									<div class="rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4">
										<div class="flex items-center gap-2 mb-2">
											<div class="w-2 h-2 rounded-full bg-blue-500"></div>
											<span class="text-sm font-medium text-blue-800 dark:text-blue-300">Fee Deposit (Auto-selected)</span>
										</div>
										<div class="flex items-center gap-2">
											<span class="font-semibold text-blue-900 dark:text-blue-100">{selectedFeeDeposit.displayAmount}</span>
											<span class="text-sm text-blue-700 dark:text-blue-400">#{selectedFeeDeposit.index}</span>
										</div>
									</div>
								{/if}
							</div>
						</Card>
					{/if}

					

					<!-- Auto-selected fee information -->
					{#if autoSelectedFeeInfo}
						<Card
							class_="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20"
						>
							<div class="space-y-4">
								<h3 class="flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300">
									<Zap class="h-5 w-5" />
									{$t('common.fee_information', { default: 'Fee Information' })}
								</h3>
								<div class="space-y-3">
									<div class="flex items-center justify-between">
										<span class="text-sm text-blue-700 dark:text-blue-300">{$t('common.network_fee', { default: 'Network Fee' })}:</span>
										<span class="font-bold text-blue-800 dark:text-blue-200"
											>{autoSelectedFeeInfo.feeInfo.formatted} STRK</span
										>
									</div>
									{#if autoSelectedFeeInfo.feeDeposit}
										<div class="flex items-center justify-between">
											<span class="text-sm text-blue-700 dark:text-blue-300">{$t('common.fee_deposit', { default: 'Fee Deposit' })}:</span>
											<span class="font-medium text-blue-800 dark:text-blue-200"
												>{autoSelectedFeeInfo.feeDeposit.displayAmount}</span
											>
										</div>
									{/if}
								</div>
								
								<!-- Auto-selection explanation -->
								<div class="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/30">
									<div class="flex items-start gap-2">
										<CheckCircle class="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
										<div class="text-xs text-blue-700 dark:text-blue-300">
											<p class="font-medium mb-1">
												{$t('common.auto_fee_selection', { default: 'Automatic Fee Selection' })}
											</p>
											<p>
												{$t('common.auto_fee_explanation', { 
													default: 'The system automatically selected the best STRK deposit to pay for network fees. This deposit has sufficient balance and is separate from your withdrawal deposit to maintain privacy.' 
												})}
											</p>
										</div>
									</div>
								</div>
							</div>
						</Card>
					{/if}

					<!-- Error message -->
					{#if feePreloadError}
						<Card
							class_="border-0 shadow-xl bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20"
						>
							<div class="flex items-start gap-3">
								<AlertTriangle class="mt-0.5 h-5 w-5 text-red-500" />
								<div>
									<h3 class="mb-1 font-semibold text-red-800 dark:text-red-300">
										{$t('common.fee_payment_issue', { default: 'Fee Payment Issue' })}
									</h3>
									<p class="text-sm text-red-700 dark:text-red-300">{feePreloadError}</p>
								</div>
							</div>
						</Card>
					{/if}

					<!-- Withdraw Form -->
					{#if selectedWithdrawDeposit && selectedFeeDeposit && !feePreloadError}
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm {highlightForm ? 'ring-4 ring-purple-500 shadow-purple-500/25 shadow-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border-purple-300 dark:border-purple-500' : ''} {highlightForm && !stopPulsing ? 'animate-pulse-scale' : ''} transition-all duration-500 ease-in-out"
							on:mouseenter={() => stopPulsing = true}
							on:click={() => stopPulsing = true}
						>
							<div class="space-y-6" bind:this={withdrawFormElement}>
								<h3 class="text-text flex items-center gap-2 text-xl font-bold">
									<Wallet class="h-5 w-5 text-purple-500" />
									{$t('common.withdrawal_details', { default: 'Withdrawal Details' })}
								</h3>

								<form on:submit|preventDefault={initiateWithdraw} class="space-y-6">
									<!-- Recipient Address -->
									<div class="space-y-3">
										<label class="text-text flex items-center gap-2 text-sm font-semibold">
											<Users class="h-4 w-4" />
											{$t('withdraw.recipient_address')}
										</label>
										<Input
											bind:value={withdrawRecipient}
											required
											placeholder={$t('common.enter_recipient_address', { default: 'Enter recipient wallet address' })}
											class_="w-full text-lg font-medium"
										/>
									</div>

									<!-- Amount Input -->
									<div class="space-y-3">
										<label class="text-text flex items-center gap-2 text-sm font-semibold">
											<ArrowDown class="h-4 w-4" />
											{$t('withdraw.withdraw_amount')}
										</label>
										<div class="flex gap-2">
											<Input
												bind:value={withdrawAmount}
												required
												placeholder={$t('common.enter_amount_to_withdraw', { default: 'Enter amount to withdraw' })}
												class_="flex-1 text-lg font-medium"
											/>
											<button
												type="button"
												class="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-purple-600"
												on:click={() => {
													if (selectedWithdrawDeposit) {
														withdrawAmount = selectedWithdrawDeposit.displayAmount;
													}
												}}
											>
												{$t('deposit.max')}
											</button>
										</div>
									</div>

									<!-- Submit Button -->
									<Button
										text={$t('common.execute_private_withdrawal', { default: 'Execute Private Withdrawal' })}
										loading={isLoading}
										type="submit"
										class_="w-full py-4 text-lg font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-300"
									/>
								</form>
							</div>
						</Card>
					{/if}
				</div>

				<!-- Information Panel -->
				<div class="space-y-6 lg:col-span-2">
					<!-- How Withdrawals Work -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-4">
							<h3 class="text-text flex items-center gap-2 text-xl font-bold">
								<Shield class="h-5 w-5 text-purple-500" />
								{$t('ui.withdraw_page.how_it_works.title')}
							</h3>
							<div class="space-y-4">
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white"
									>
										1
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.withdraw_page.how_it_works.select_deposit.title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.withdraw_page.how_it_works.select_deposit.description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white"
									>
										2
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.withdraw_page.how_it_works.auto_fee_selection.title', { default: 'Auto Fee Selection' })}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.withdraw_page.how_it_works.auto_fee_selection.description', { default: 'System automatically finds the best STRK deposit to pay network fees, ensuring privacy by using a separate deposit.' })}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white"
									>
										3
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.withdraw_page.how_it_works.set_recipient.title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.withdraw_page.how_it_works.set_recipient.description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white"
									>
										4
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.withdraw_page.how_it_works.zero_knowledge.title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.withdraw_page.how_it_works.zero_knowledge.description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-pink-500 text-sm font-bold text-white"
									>
										5
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.withdraw_page.how_it_works.anonymous_transfer.title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.withdraw_page.how_it_works.anonymous_transfer.description')}
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card>

					<!-- Security Features -->
					<Card
						class_="border-0 shadow-xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20"
					>
						<div class="space-y-4">
							<h3 class="text-text flex items-center gap-2 text-xl font-bold">
								<Shield class="h-5 w-5 text-purple-500" />
								{$t('ui.withdraw_page.privacy_features.title')}
							</h3>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-purple-500" />
									<span class="text-text text-sm font-medium">{$t('ui.withdraw_page.privacy_features.break_linkability')}</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-purple-500" />
									<span class="text-text text-sm font-medium"
										>{$t('ui.withdraw_page.privacy_features.hide_source')}</span
									>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-purple-500" />
									<span class="text-text text-sm font-medium">{$t('ui.withdraw_page.privacy_features.fee_handling')}</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-purple-500" />
									<span class="text-text text-sm font-medium"
										>{$t('ui.withdraw_page.privacy_features.guaranteed_anonymity')}</span
									>
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
								<div class="text-2xl font-bold text-purple-500">🔒</div>
								<div class="text-text-secondary text-sm">{$t('ui.withdraw_page.stats.untraceable')}</div>
							</div>
						</Card>
						<Card
							class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center"
						>
							<div class="space-y-2">
								<div class="text-2xl font-bold text-pink-500">⚡</div>
								<div class="text-text-secondary text-sm">{$t('ui.withdraw_page.stats.fast')}</div>
							</div>
						</Card>
					</div>

					<!-- Important Note -->
					<Card
						class_="border-0 shadow-lg bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20"
					>
						<div class="flex items-start gap-3">
							<AlertTriangle class="mt-0.5 h-5 w-5 text-yellow-500" />
							<div>
								<h4 class="mb-1 font-semibold text-yellow-800 dark:text-yellow-300">{$t('ui.withdraw_page.important_notice')}</h4>
								<p class="text-sm text-yellow-700 dark:text-yellow-300">
									{$t('ui.withdraw_page.withdrawal_warning')}
								</p>
							</div>
						</div>
					</Card>
				</div>
			</div>
		</div>
	</div>

	<!-- Modal Confirm -->
	<Modal
		show={showFeeModal}
		title={$t('common.confirm_private_withdrawal', { default: 'Confirm Private Withdrawal' })}
		confirmText={$t('common.execute_withdrawal', { default: 'Execute Withdrawal' })}
		cancelText={$t('common.cancel')}
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
		<div class="space-y-4">
			<div
				class="rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 p-4 dark:from-purple-900/20 dark:to-pink-900/20"
			>
				<h4 class="text-text mb-3 font-semibold">{$t('common.withdrawal_summary', { default: 'Withdrawal Summary' })}</h4>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-text-secondary">{$t('common.amount')}:</span>
						<span class="text-text font-semibold">{withdrawAmount}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-secondary">{$t('common.network_fee', { default: 'Network Fee' })}:</span>
						<span class="text-text font-semibold">{feeWeiHex} STRK</span>
					</div>
					<div class="mt-2 border-t pt-2">
						<div class="flex justify-between">
							<span class="text-text-secondary">{$t('common.recipient', { default: 'Recipient' })}:</span>
							<span class="text-text font-mono text-xs break-all">{withdrawRecipient}</span>
						</div>
					</div>
				</div>
			</div>
			<p class="text-text-secondary text-sm">
				{$t('common.withdrawal_confirmation_text', { default: 'This withdrawal will be processed anonymously and cannot be reversed. Please verify all details are correct.' })}
			</p>
		</div>
	</Modal>

	<ProgressModal
		show={$progressModalStore.show}
		title={$progressModalStore.title}
		steps={$progressModalStore.steps}
		onClose={progressModalActions.hide}
	/>

	<InsufficientFeeModal
		show={showInsufficientFeeModal}
		requiredFeeAmount={autoSelectedFeeInfo?.feeInfo.formatted || ''}
		onClose={() => {
			showInsufficientFeeModal = false;
			// Reset all deposit selections when closing modal
			resetAll();
		}}
	/>
</ProtectedRoute>

<style>
	@keyframes pulse-scale {
		0%, 100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.03);
			opacity: 0.9;
		}
	}

	:global(.animate-pulse-scale) {
		animation: pulse-scale 1.5s ease-in-out infinite;
	}
</style>
