<script lang="ts">
	import { PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS } from '$env/static/public';
	import { t } from '$lib/i18n';
	import { getOperationDetails } from '$lib/db/operations';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { nullifyOperation } from '$lib/privacy/nullifyOperation';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { merkleTree } from '$lib/services/depositProcessor';
	import { paymasterWallet } from '$lib/stores/paymaster';
	import { provider } from '$lib/stores/provider';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import { zkLibraries } from '$lib/stores/zkLibraries';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import InsufficientFeeModal from '$lib/ui/InsufficientFeeModal.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { fetchMergeFee } from '$lib/utils/fetchFeeForExtension';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { loadDeposits, type DisplayOperation } from '$lib/utils/loadDepositsForToken';
	import { createElegantDepositColumns } from '$lib/utils/sharedColumns';
	import { wrapWithToast } from '$lib/utils/toast';
	import { fromWei } from '$lib/utils/toWei';
	import { Contract } from 'starknet';
	import { get } from 'svelte/store';
	import { supportedTokens } from '$lib/config/tokens';
	import { browser } from '$app/environment';
	import { generateHonkCalldata } from '$lib/privacy/generateProof';
	import { autoSelectCompleteProcess, type AutoSelectedFee } from '$lib/utils/autoSelectFeeDeposit';
	import ProgressModal from '$lib/ui/ProgressModal.svelte';
	import {
		progressModalStore,
		progressModalActions,
		mergeProgressSteps
	} from '$lib/stores/progressModal';
	import {
		Merge,
		Layers,
		Combine,
		DollarSign,
		AlertTriangle,
		CheckCircle,
		Shield,
		Zap,
		Target,
		Users
	} from 'lucide-svelte';

	const STRK_ADDRESS = supportedTokens[0].address;

	let deposits: DisplayOperation[] = [];
	let selectionMode: 'merge1' | 'merge2' = 'merge1';

	let selectedMerge1Key: number | null = null;
	let selectedMerge1Deposit: DisplayOperation | null = null;
	let selectedMerge2Key: number | null = null;
	let selectedMerge2Deposit: DisplayOperation | null = null;
	let selectedFeeKey: number | null = null;
	let selectedFeeDeposit: DisplayOperation | null = null;

	// Auto-selected fee information
	let autoSelectedFeeInfo: AutoSelectedFee | null = null;
	let feePreloadError: string | null = null;

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
	let showInsufficientFeeModal = false;

	// Confirmation data
	let merge1NoteBalanceWei: bigint | null = null;
	let merge2NoteBalanceWei: bigint | null = null;
	let feeNoteBalanceWei: bigint | null = null;
	let feeWei: bigint | null = null;

	// Element reference for smooth scrolling
	let mergeFormElement: HTMLElement;
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
		const selectedKey = deposits[globalIdx].index;
		const selectedDeposit = deposits.find((d) => d.index === selectedKey) ?? null;

		if (selectionMode === 'merge1') {
			// Allow unselecting current merge1 deposit
			if (selectedKey === selectedMerge1Key) {
				selectedMerge1Key = null;
				selectedMerge1Deposit = null;
				// Reset fee if it was auto-selected
				if (autoSelectedFeeInfo) {
					selectedFeeKey = null;
					selectedFeeDeposit = null;
					autoSelectedFeeInfo = null;
				}
				// Stay in merge1 mode after unselecting
				return;
			}
			// Don't allow selecting the same deposit that's already selected as merge2
			if (selectedKey === selectedMerge2Key) {
				return;
			}
			selectedMerge1Key = selectedKey;
			selectedMerge1Deposit = selectedDeposit;
			// Auto-switch to merge2 mode after selecting first deposit
			selectionMode = 'merge2';
		} else if (selectionMode === 'merge2') {
			// Allow unselecting current merge2 deposit
			if (selectedKey === selectedMerge2Key) {
				selectedMerge2Key = null;
				selectedMerge2Deposit = null;
				// Reset fee if it was auto-selected
				if (autoSelectedFeeInfo) {
					selectedFeeKey = null;
					selectedFeeDeposit = null;
					autoSelectedFeeInfo = null;
				}
				// Stay in merge2 mode after unselecting
				return;
			}
			// Don't allow selecting the same deposit that's already selected as merge1
			if (selectedKey === selectedMerge1Key) {
				return;
			}
			selectedMerge2Key = selectedKey;
			selectedMerge2Deposit = selectedDeposit;
		}

		// Auto-select fee deposit when both merge deposits are selected
		if (selectedMerge1Deposit && selectedMerge2Deposit) {
			autoSelectFeeDeposit();
		}
	}

	function resetAll() {
		selectedMerge1Key = null;
		selectedMerge1Deposit = null;
		selectedMerge2Key = null;
		selectedMerge2Deposit = null;
		selectedFeeKey = null;
		selectedFeeDeposit = null;
		autoSelectedFeeInfo = null;
		feePreloadError = null;
		showInsufficientFeeModal = false;
	}

	function resetMerge1() {
		selectedMerge1Key = null;
		selectedMerge1Deposit = null;
		// Reset fee if it was auto-selected
		if (autoSelectedFeeInfo) {
			selectedFeeKey = null;
			selectedFeeDeposit = null;
			autoSelectedFeeInfo = null;
		}
		// Switch to merge1 selection mode
		selectionMode = 'merge1';
	}

	function resetMerge2() {
		selectedMerge2Key = null;
		selectedMerge2Deposit = null;
		// Reset fee if it was auto-selected
		if (autoSelectedFeeInfo) {
			selectedFeeKey = null;
			selectedFeeDeposit = null;
			autoSelectedFeeInfo = null;
		}
		// Switch to merge2 selection mode
		selectionMode = 'merge2';
	}

	function handleSelectionChange(value: string) {
		selectionMode = value as 'merge1' | 'merge2';
	}

	/** Auto-select fee deposit when both merge deposits are chosen */
	async function autoSelectFeeDeposit() {
		if (!selectedMerge1Deposit || !selectedMerge2Deposit) return;

		feePreloadError = null;
		showInsufficientFeeModal = false;

		try {
			// Get fee info and auto-select the best STRK deposit
			const excludeDeposits = [selectedMerge1Deposit, selectedMerge2Deposit];
			autoSelectedFeeInfo = await autoSelectCompleteProcess(
				'merge',
				PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				undefined, // merge doesn't need extension address
				excludeDeposits
			);

			// Set the auto-selected fee deposit
			if (autoSelectedFeeInfo.feeDeposit) {
				selectedFeeDeposit = autoSelectedFeeInfo.feeDeposit;
				selectedFeeKey = autoSelectedFeeInfo.feeDeposit.index;
				
				// Smooth scroll to merge form after successful deposit selection
				setTimeout(() => {
					if (mergeFormElement) {
						mergeFormElement.scrollIntoView({ 
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
			feePreloadError = $t('ui.merge_page.errors.fee_load_failed');
			autoSelectedFeeInfo = null;
		}
	}

	/** Step 1: Validate*/
	async function initiateMerge() {
		isLoading = true;

		await wrapWithToast(
			async () => {
				if (
					!selectedMerge1Deposit ||
					!selectedMerge2Deposit ||
					!selectedFeeDeposit ||
					!autoSelectedFeeInfo
				) {
					throw new Error($t('ui.merge_page.errors.select_deposits'));
				}

				// — Parse first merge note
				mergeNote1 = NoteDataSchema.parse(selectedMerge1Deposit.data);

				const { tokenAddress: merge1TokenAddress, amount: merge1NoteBalance } = mergeNote1;
				merge1NoteBalanceWei = BigInt(merge1NoteBalance);

				const mergeTokenDecimals = await fetchTokenDecimals(merge1TokenAddress);
				merge1Amount = fromWei(merge1NoteBalanceWei, mergeTokenDecimals);
				if (merge1NoteBalanceWei <= 0n) {
					throw new Error($t('ui.merge_page.errors.invalid_first_balance'));
				}

				// — Parse second merge note
				mergeNote2 = NoteDataSchema.parse(selectedMerge2Deposit.data);
				const { tokenAddress: merge2TokenAddress, amount: merge2NoteBalance } = mergeNote2;
				merge2NoteBalanceWei = BigInt(merge2NoteBalance);
				merge2Amount = fromWei(merge2NoteBalanceWei, mergeTokenDecimals);
				if (merge2NoteBalanceWei <= 0n) {
					throw new Error($t('ui.merge_page.errors.invalid_second_balance'));
				}

				// Check if are the same tokens
				if (merge1TokenAddress !== merge2TokenAddress) {
					throw new Error($t('ui.merge_page.errors.same_token_required'));
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
						$t('ui.merge_page.errors.fee_exceeds_balance')
							.replace('{fee}', feeWeiHex)
							.replace('{balance}', fromWei(feeNoteBalanceWei, feeNoteDecimals))
					);
				}

				showFeeModal = true;
			},
			{
				loading: $t('ui.merge_page.toast.executing'),
				success: $t('ui.merge_page.toast.ready'),
				error: $t('ui.merge_page.toast.failed')
			},
			async () => {
				isLoading = false;
			}
		);
	}

	/** Step 2: Proving & Execution */
	async function confirmMerge() {
		// 1) Close the modal and start progress
		showFeeModal = false;
		progressModalActions.show($t('progress_modal.merge.title'), [...mergeProgressSteps($t)]);

		try {
			// 2) Validate that note balances and calculated amounts are present
			progressModalActions.updateStep('preparation', 'loading');
			if (!merge1NoteBalanceWei || !merge2NoteBalanceWei) {
				throw new Error($t('ui.merge_page.errors.missing_deposit_amounts'));
			}

			if (!feeNoteBalanceWei || !feeWei) {
				throw new Error($t('ui.merge_page.errors.missing_fee_amounts'));
			}

			// 3) Ensure zk library and merkle tree are initialized
			const { garaga } = get(zkLibraries);
			if (!garaga) throw new Error($t('ui.common.errors.garaga_not_initialized'));
			if (
				!feeNote ||
				!selectedFeeDeposit ||
				!selectedMerge1Deposit ||
				!selectedMerge2Deposit ||
				!mergeNote1 ||
				!mergeNote2
			) {
				throw new Error($t('ui.merge_page.errors.missing_deposits'));
			}
			const tree = merkleTree;
			if (!tree) throw new Error($t('ui.common.errors.merkle_tree_missing'));

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
				throw new Error($t('ui.merge_page.errors.operations_not_found'));
			}

			// 7) Build the witness input object for proof
			const mergeInput = {
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
			progressModalActions.updateStep('preparation', 'completed');

			// 8) Generate the zk proof and prepare it as calldata
			progressModalActions.updateStep('proof-generation', 'loading');
			const honkCalldataHex = await generateHonkCalldata(
				'/circuits/merge.json',
				'/circuits/recursive.json',
				'/circuits/vk_recursive.bin',
				mergeInput
			);
			progressModalActions.updateStep('proof-generation', 'completed');

			// 9) Prepare for the StarkNet transaction
			progressModalActions.updateStep('transaction-prepare', 'loading');
			const rpc = get(provider);
			if (!rpc) throw new Error($t('ui.common.errors.missing_provider'));

			const account = get(paymasterWallet);
			if (!account) throw new Error($t('ui.common.errors.missing_account'));

			const { abi: privacyAbi } = await rpc.getClassAt(PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS);
			if (!privacyAbi) throw new Error($t('ui.common.errors.missing_abi'));

			const privacy = new Contract(privacyAbi, PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS, rpc);
			privacy.connect(account);

			// 10) Prepare Starknet call
			const honkCalldataWithLen = [
				`0x${BigInt(honkCalldataHex.length).toString(16)}`,
				...honkCalldataHex
			];
			const call = {
				contractAddress: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				entrypoint: 'merge',
				calldata: honkCalldataWithLen
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
			await nullifyOperation(selectedMerge1Deposit.hash);
			await nullifyOperation(selectedMerge2Deposit.hash);
			await nullifyOperation(selectedFeeDeposit.hash);

			// 12) Reset component state after successful merge
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
			console.warn('❌ Merge failed with error:', err);

			const currentSteps = $progressModalStore.steps;
			const currentStepIndex = currentSteps.findIndex((step) => step.status === 'loading');
			if (currentStepIndex !== -1) {
				progressModalActions.updateStep(currentSteps[currentStepIndex].id, 'error');
			}

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

			setTimeout(() => {
				progressModalActions.hide();
			}, 3000);
		}

		isLoading = false;
	}
</script>

<ProtectedRoute>
	<div
		class="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
	>
		<div class="mx-auto max-w-6xl p-6 pt-8">
			<!-- Header Section -->
			<div class="mb-8 text-center">
				<div class="mb-4 flex items-center justify-center gap-3">
					<div
						class="rounded-xl bg-gradient-to-br from-orange-400 to-red-500 p-3 text-white shadow-lg"
					>
						<Merge class="h-8 w-8" />
					</div>
					<h1
						class="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl"
					>
						{$t('ui.merge_page.title')}
					</h1>
				</div>
				<p class="text-text-secondary mx-auto max-w-2xl text-lg">
					{$t('ui.merge_page.description')}
				</p>
			</div>

			<div class="grid gap-6 lg:grid-cols-4">
				<!-- Main Merge Form -->
				<div class="space-y-6 lg:col-span-2">
					<!-- Selection Mode and Token Filter -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-6">
							<div class="flex items-center justify-between">
								<h3 class="text-text flex items-center gap-2 text-xl font-bold">
									<Target class="h-5 w-5 text-orange-500" />
									{$t('ui.merge_page.select_deposits')}
								</h3>
							</div>

							<div class="space-y-4">
								<!-- Selection Toggle -->
								<div class="space-y-3">
									<label class="text-text flex items-center gap-2 text-sm font-semibold">
										<Layers class="h-4 w-4" />
										{$t('ui.merge_page.selection_mode')}
									</label>
									<SelectionToggle
										options={[
											{ label: $t('ui.merge_page.first_deposit'), value: 'merge1', isFirst: true },
											{ label: $t('ui.merge_page.second_deposit'), value: 'merge2', isLast: true }
										]}
										selected={selectionMode}
										onChange={handleSelectionChange}
										onReset={resetAll}
									/>
								</div>

								<!-- Token Selection -->
								<div class="space-y-3">
									<label class="text-text flex items-center gap-2 text-sm font-semibold">
										<DollarSign class="h-4 w-4" />
										{$t('ui.merge_page.filter_by_token')}
									</label>
									<TokenSelect
										tokens={$tokens}
										bind:value={$selectedToken}
										placeholder={$t('ui.merge_page.choose_token_placeholder')}
										class_="w-full sm:w-80"
									/>
								</div>

								<!-- Deposits Table -->
								{#if !deposits.length}
									<div class="py-12 text-center">
										<div
											class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
										>
											<Layers class="h-8 w-8 text-gray-400" />
										</div>
										<h3 class="text-text mb-2 text-lg font-medium">{$t('ui.merge_page.no_deposits_title')}</h3>
										<p class="text-text-secondary">{$t('ui.merge_page.no_deposits_description')}</p>
									</div>
								{:else}
									<div
										class="rounded-lg bg-gradient-to-r from-gray-50 to-gray-100 p-1 dark:from-gray-700 dark:to-gray-600"
									>
										<PaginatedTable
											columns={createElegantDepositColumns(
												selectedMerge1Key,
												selectedFeeKey,
												selectedMerge2Key,
												'merge'
											)}
											items={deposits}
											pageSize={5}
											keyField="index"
											disabledKeys={undefined}
											onRowClick={handleRowClick}
											activeKey={null}
											inactiveKeys={[]}
											hoverClass="hover:bg-gradient-to-r hover:from-orange-50 hover:to-red-50 dark:hover:from-orange-900/30 dark:hover:to-red-900/30 transition-all duration-200"
										/>
									</div>
								{/if}
							</div>
						</div>
					</Card>

					<!-- Selected Deposits Display -->
					{#if selectedMerge1Deposit || selectedMerge2Deposit || selectedFeeDeposit}
						<Card class_="border-0 shadow-xl bg-gray-50 dark:bg-gray-800/50">
							<div class="flex items-center gap-2 mb-4">
								<CheckCircle class="h-5 w-5 text-green-500" />
								<span class="text-lg font-semibold text-gray-700 dark:text-gray-300">Selected Deposits</span>
							</div>
							<div class="space-y-3">
								<!-- Merge 1 Deposit -->
								{#if selectedMerge1Deposit}
									<div class="rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 p-4">
										<div class="flex items-center justify-between mb-2">
											<div class="flex items-center gap-2">
												<div class="w-2 h-2 rounded-full bg-purple-500"></div>
												<span class="text-sm font-medium text-purple-800 dark:text-purple-300">Merge 1 Deposit</span>
											</div>
											<button
												on:click={() => resetMerge1()}
												class="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 underline"
											>
												Reset
											</button>
										</div>
										<div class="flex items-center gap-2">
											<span class="font-semibold text-purple-900 dark:text-purple-100">{selectedMerge1Deposit.displayAmount}</span>
											<span class="text-sm text-purple-700 dark:text-purple-400">#{selectedMerge1Deposit.index}</span>
										</div>
									</div>
								{/if}

								<!-- Merge 2 Deposit -->
								{#if selectedMerge2Deposit}
									<div class="rounded-lg border border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 p-4">
										<div class="flex items-center justify-between mb-2">
											<div class="flex items-center gap-2">
												<div class="w-2 h-2 rounded-full bg-orange-500"></div>
												<span class="text-sm font-medium text-orange-800 dark:text-orange-300">Merge 2 Deposit</span>
											</div>
											<button
												on:click={() => resetMerge2()}
												class="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 underline"
											>
												Reset
											</button>
										</div>
										<div class="flex items-center gap-2">
											<span class="font-semibold text-orange-900 dark:text-orange-100">{selectedMerge2Deposit.displayAmount}</span>
											<span class="text-sm text-orange-700 dark:text-orange-400">#{selectedMerge2Deposit.index}</span>
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
							class_="border-0 shadow-xl bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20"
						>
							<div class="space-y-4">
								<h3
									class="flex items-center gap-2 font-semibold text-orange-800 dark:text-orange-300"
								>
									<Zap class="h-5 w-5" />
									{$t('ui.merge_page.fee_information', { default: 'Fee Information' })}
								</h3>
								<div class="space-y-3">
									<div class="flex items-center justify-between">
										<span class="text-sm text-orange-700 dark:text-orange-300">{$t('ui.merge_page.network_fee', { default: 'Network Fee' })}:</span>
										<span class="font-bold text-orange-800 dark:text-orange-200"
											>{autoSelectedFeeInfo.feeInfo.formatted} STRK</span
										>
									</div>
									{#if autoSelectedFeeInfo.feeDeposit}
										<div class="flex items-center justify-between">
											<span class="text-sm text-orange-700 dark:text-orange-300">{$t('ui.merge_page.fee_deposit', { default: 'Fee Deposit' })}:</span>
											<span class="font-medium text-orange-800 dark:text-orange-200"
												>{autoSelectedFeeInfo.feeDeposit.displayAmount}</span
											>
										</div>
									{/if}
								</div>
								
								<!-- Auto-selection explanation -->
								<div class="rounded-lg bg-orange-100 p-3 dark:bg-orange-900/30">
									<div class="flex items-start gap-2">
										<CheckCircle class="mt-0.5 h-4 w-4 text-orange-600 dark:text-orange-400" />
										<div class="text-xs text-orange-700 dark:text-orange-300">
											<p class="font-medium mb-1">
												{$t('common.auto_fee_selection', { default: 'Automatic Fee Selection' })}
											</p>
											<p>
												{$t('common.auto_fee_merge_explanation', { 
													default: 'The system automatically selected the best STRK deposit to pay for network fees. This deposit is separate from your merge deposits to maintain privacy.' 
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
										{$t('ui.merge_page.fee_payment_issue')}
									</h3>
									<p class="text-sm text-red-700 dark:text-red-300">{feePreloadError}</p>
								</div>
							</div>
						</Card>
					{/if}

					<!-- Merge Button -->
					{#if selectedMerge1Deposit && selectedMerge2Deposit && selectedFeeDeposit && !feePreloadError}
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm {highlightForm ? 'ring-4 ring-orange-500 shadow-orange-500/25 shadow-2xl bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 border-orange-300 dark:border-orange-500' : ''} {highlightForm && !stopPulsing ? 'animate-pulse-scale' : ''} transition-all duration-500 ease-in-out"
							on:mouseenter={() => stopPulsing = true}
							on:click={() => stopPulsing = true}
						>
							<div class="space-y-6" bind:this={mergeFormElement}>
								<h3 class="text-text flex items-center gap-2 text-xl font-bold">
									<Merge class="h-5 w-5 text-orange-500" />
									{$t('ui.merge_page.execute_merge')}
								</h3>

								<div
									class="rounded-lg bg-gradient-to-r from-orange-50 to-red-50 p-4 dark:from-orange-900/20 dark:to-red-900/20"
								>
									<h4 class="text-text mb-3 font-semibold">{$t('ui.merge_page.merge_summary')}</h4>
									<div class="space-y-2 text-sm">
										<div class="flex justify-between">
											<span class="text-text-secondary">{$t('ui.merge_page.first_deposit')}:</span>
											<span class="text-text font-semibold"
												>{selectedMerge1Deposit.displayAmount}</span
											>
										</div>
										<div class="flex justify-between">
											<span class="text-text-secondary">{$t('ui.merge_page.second_deposit')}:</span>
											<span class="text-text font-semibold"
												>{selectedMerge2Deposit.displayAmount}</span
											>
										</div>
										{#if autoSelectedFeeInfo}
											<div class="flex justify-between">
												<span class="text-text-secondary">{$t('ui.merge_page.network_fee')}:</span>
												<span class="text-text font-semibold"
													>{autoSelectedFeeInfo.feeInfo.formatted} STRK</span
												>
											</div>
										{/if}
									</div>
								</div>

								<Button
									text={$t('ui.merge_page.combine_deposits')}
									loading={isLoading}
									onClick={initiateMerge}
									class_="w-full py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-300"
								/>
							</div>
						</Card>
					{/if}
				</div>

				<!-- Information Panel -->
				<div class="space-y-6 lg:col-span-2">
					<!-- How Merging Works -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-4">
							<h3 class="text-text flex items-center gap-2 text-xl font-bold">
								<Combine class="h-5 w-5 text-orange-500" />
								{$t('ui.merge_page.how_it_works')}
							</h3>
							<div class="space-y-4">
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white"
									>
										1
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.merge_page.step1_title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.merge_page.step1_description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white"
									>
										2
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.merge_page.step2_title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.merge_page.step2_description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white"
									>
										3
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.merge_page.step3_title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.merge_page.step3_description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white"
									>
										4
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.merge_page.step4_title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.merge_page.step4_description')}
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card>

					<!-- Security Features -->
					<Card
						class_="border-0 shadow-xl bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20"
					>
						<div class="space-y-4">
							<h3 class="text-text flex items-center gap-2 text-xl font-bold">
								<Shield class="h-5 w-5 text-orange-500" />
								{$t('ui.merge_page.privacy_benefits')}
							</h3>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-orange-500" />
									<span class="text-text text-sm font-medium"
										>{$t('ui.merge_page.benefit1')}</span
									>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-orange-500" />
									<span class="text-text text-sm font-medium"
										>{$t('ui.merge_page.benefit2')}</span
									>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-orange-500" />
									<span class="text-text text-sm font-medium">{$t('ui.merge_page.benefit3')}</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-orange-500" />
									<span class="text-text text-sm font-medium">{$t('ui.merge_page.benefit4')}</span>
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
								<div class="text-2xl font-bold text-orange-500">2→1</div>
								<div class="text-text-secondary text-sm">{$t('ui.merge_page.consolidation')}</div>
							</div>
						</Card>
						<Card
							class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center"
						>
							<div class="space-y-2">
								<div class="text-2xl font-bold text-red-500">🔒</div>
								<div class="text-text-secondary text-sm">{$t('ui.merge_page.private')}</div>
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
								<h4 class="mb-1 font-semibold text-yellow-800 dark:text-yellow-300">
									{$t('ui.merge_page.requirements')}
								</h4>
								<p class="text-sm text-yellow-700 dark:text-yellow-300">
									{$t('ui.merge_page.requirements_description')}
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
		title={$t('ui.merge_page.modal.title')}
		confirmText={$t('ui.merge_page.modal.confirm')}
		cancelText={$t('ui.merge_page.modal.cancel')}
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
		<div class="space-y-4">
			<div
				class="rounded-lg bg-gradient-to-r from-orange-50 to-red-50 p-4 dark:from-orange-900/20 dark:to-red-900/20"
			>
				<h4 class="text-text mb-3 font-semibold">{$t('ui.merge_page.merge_summary')}</h4>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-text-secondary">{$t('ui.merge_page.first_amount')}:</span>
						<span class="text-text font-semibold">{merge1Amount}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-secondary">{$t('ui.merge_page.second_amount')}:</span>
						<span class="text-text font-semibold">{merge2Amount}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-secondary">{$t('ui.merge_page.network_fee')}:</span>
						<span class="text-text font-semibold">{feeWeiHex} STRK</span>
					</div>
					<div class="mt-2 border-t pt-2">
						<div class="flex justify-between">
							<span class="text-text-secondary">{$t('ui.merge_page.combined_total')}:</span>
							<span class="font-bold text-orange-600"
								>{merge1Amount && merge2Amount
									? (parseFloat(merge1Amount) + parseFloat(merge2Amount)).toFixed(6)
									: '0'}</span
							>
						</div>
					</div>
				</div>
			</div>
			<p class="text-text-secondary text-sm">
				{$t('ui.merge_page.modal.warning')}
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
		requiredFeeAmount={(() => {
			const amount = autoSelectedFeeInfo?.feeInfo.formatted || '';
			console.log('Modal requiredFeeAmount:', amount, 'autoSelectedFeeInfo:', autoSelectedFeeInfo);
			return amount;
		})()}
		onClose={() => {
			showInsufficientFeeModal = false;
			// Reset all deposit selections when closing modal
			resetAll();
			// Reset to merge1 selection mode
			selectionMode = 'merge1';
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
