<script lang="ts">
	import { PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS } from '$env/static/public';
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
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { fetchMergeFee } from '$lib/utils/fetchFeeForExtension';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { loadDeposits, type DisplayOperation } from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns } from '$lib/utils/sharedColumns';
	import { wrapWithToast } from '$lib/utils/toast';
	import { fromWei } from '$lib/utils/toWei';
	import { Contract } from 'starknet';
	import { get } from 'svelte/store';
	import { supportedTokens } from '$lib/config/tokens';
	import { browser } from '$app/environment';
	import { generateHonkCalldata } from '$lib/privacy/generateProof';
	import { autoSelectCompleteProcess, type AutoSelectedFee } from '$lib/utils/autoSelectFeeDeposit';
	import ProgressModal from '$lib/ui/ProgressModal.svelte';
	import { progressModalStore, progressModalActions, mergeProgressSteps } from '$lib/stores/progressModal';
	import { Merge, Layers, Combine, DollarSign, AlertTriangle, CheckCircle, Shield, Zap, Target, Users } from 'lucide-svelte';

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

	// Confirmation data
	let merge1NoteBalanceWei: bigint | null = null;
	let merge2NoteBalanceWei: bigint | null = null;
	let feeNoteBalanceWei: bigint | null = null;
	let feeWei: bigint | null = null;

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
			selectedMerge1Key = selectedKey;
			selectedMerge1Deposit = selectedDeposit;
		} else if (selectionMode === 'merge2') {
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
	}

	function handleSelectionChange(value: string) {
		selectionMode = value as 'merge1' | 'merge2';
	}

	/** Auto-select fee deposit when both merge deposits are chosen */
	async function autoSelectFeeDeposit() {
		if (!selectedMerge1Deposit || !selectedMerge2Deposit) return;
		
		feePreloadError = null;
		
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

	/** Step 1: Validate*/
	async function initiateMerge() {
		isLoading = true;

		await wrapWithToast(
			async () => {
				if (!selectedMerge1Deposit || !selectedMerge2Deposit || !selectedFeeDeposit || !autoSelectedFeeInfo) {
					throw new Error('Please select both merge deposits first');
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

				// Check if are the same tokens
				if (merge1TokenAddress !== merge2TokenAddress) {
					throw new Error('Both merge notes must be for the same token');
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
			},
			{
				loading: '⏳ Executing Merge',
				success: '✅ Merge ready!',
				error: '❌ Merge failed'
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
		progressModalActions.show('Merge Progress', [...mergeProgressSteps]);

		try {
			// 2) Validate that note balances and calculated amounts are present
			progressModalActions.updateStep('preparation', 'loading');
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
			if (!rpc) throw new Error('Missing Provider');

			const account = get(paymasterWallet);
			if (!account) throw new Error('Missing Account');

			const { abi: privacyAbi } = await rpc.getClassAt(PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS);
			if (!privacyAbi) throw new Error('Missing ABI');

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
			const currentStepIndex = currentSteps.findIndex(step => step.status === 'loading');
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
	<div class="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
		<div class="max-w-6xl mx-auto p-6 pt-8">
			<!-- Header Section -->
			<div class="text-center mb-8">
				<div class="flex items-center justify-center gap-3 mb-4">
					<div class="p-3 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-lg">
						<Combine class="w-8 h-8" />
					</div>
					<h1 class="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
						Private Merge
					</h1>
				</div>
				<p class="text-text-secondary text-lg max-w-2xl mx-auto">
					Combine multiple deposits into a single private note for enhanced management
				</p>
			</div>

			<div class="grid lg:grid-cols-3 gap-8">
				<!-- Main Merge Form -->
				<div class="lg:col-span-2 space-y-6">
					<!-- Selection Mode and Token Filter -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-6">
							<div class="flex items-center justify-between">
								<h3 class="text-xl font-bold text-text flex items-center gap-2">
									<Target class="w-5 h-5 text-orange-500" />
									Select Deposits to Merge
								</h3>
							</div>
							
							<div class="space-y-4">
								<!-- Selection Toggle -->
								<div class="space-y-3">
									<label class="flex items-center gap-2 text-sm font-semibold text-text">
										<Layers class="w-4 h-4" />
										Selection Mode
									</label>
									<SelectionToggle
										options={[
											{ label: 'First Deposit', value: 'merge1', isFirst: true },
											{ label: 'Second Deposit', value: 'merge2', isLast: true }
										]}
										selected={selectionMode}
										onChange={handleSelectionChange}
										onReset={resetAll}
									/>
								</div>

								<!-- Token Selection -->
								<div class="space-y-3">
									<label class="flex items-center gap-2 text-sm font-semibold text-text">
										<DollarSign class="w-4 h-4" />
										Filter by Token
									</label>
									<TokenSelect
										tokens={$tokens}
										bind:value={$selectedToken}
										placeholder="Choose token to filter deposits"
										class_="w-full sm:w-80"
									/>
								</div>

								<!-- Deposits Table -->
								{#if !deposits.length}
									<div class="text-center py-12">
										<div class="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
											<Layers class="w-8 h-8 text-gray-400" />
										</div>
										<h3 class="text-lg font-medium text-text mb-2">No Deposits Found</h3>
										<p class="text-text-secondary">Make a deposit first to start merging!</p>
									</div>
								{:else}
									<div class="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-lg p-1">
										<PaginatedTable
											columns={defaultDepositColumns}
											items={deposits}
											pageSize={5}
											keyField="index"
											disabledKeys={undefined}
											onRowClick={handleRowClick}
											activeKey={selectionMode === 'merge1' ? selectedMerge1Key : selectedMerge2Key}
											inactiveKeys={[
												...(selectionMode !== 'merge1' && selectedMerge1Key !== null ? [selectedMerge1Key] : []),
												...(selectionMode !== 'merge2' && selectedMerge2Key !== null ? [selectedMerge2Key] : []),
												...(selectedFeeKey !== null ? [selectedFeeKey] : [])
											]}
											hoverClass="hover:bg-orange-600"
										/>
									</div>
								{/if}
							</div>
						</div>
					</Card>

					<!-- Auto-selected fee information -->
					{#if autoSelectedFeeInfo}
						<Card class_="border-0 shadow-xl bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20">
							<div class="space-y-3">
								<h3 class="font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-2">
									<Zap class="w-5 h-5" />
									Fee Information
								</h3>
								<div class="space-y-2">
									<div class="flex items-center justify-between">
										<span class="text-sm text-orange-700 dark:text-orange-300">Network Fee:</span>
										<span class="font-bold text-orange-800 dark:text-orange-200">{autoSelectedFeeInfo.feeInfo.formatted} STRK</span>
									</div>
									{#if autoSelectedFeeInfo.feeDeposit}
										<div class="flex items-center justify-between">
											<span class="text-sm text-orange-700 dark:text-orange-300">Fee Deposit:</span>
											<span class="font-medium text-orange-800 dark:text-orange-200">{autoSelectedFeeInfo.feeDeposit.displayAmount}</span>
										</div>
									{/if}
								</div>
							</div>
						</Card>
					{/if}

					<!-- Error message -->
					{#if feePreloadError}
						<Card class_="border-0 shadow-xl bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20">
							<div class="flex items-start gap-3">
								<AlertTriangle class="w-5 h-5 text-red-500 mt-0.5" />
								<div>
									<h3 class="font-semibold text-red-800 dark:text-red-300 mb-1">Fee Payment Issue</h3>
									<p class="text-sm text-red-700 dark:text-red-300">{feePreloadError}</p>
								</div>
							</div>
						</Card>
					{/if}

					<!-- Selected Deposits Display -->
					<SelectedDeposits
						items={[
							{ title: 'First Deposit', deposit: selectedMerge1Deposit },
							{ title: 'Second Deposit', deposit: selectedMerge2Deposit },
							{ title: 'Fee Deposit (Auto-selected)', deposit: selectedFeeDeposit }
						]}
					/>

					<!-- Merge Button -->
					{#if selectedMerge1Deposit && selectedMerge2Deposit && selectedFeeDeposit && !feePreloadError}
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-6">
								<h3 class="text-xl font-bold text-text flex items-center gap-2">
									<Merge class="w-5 h-5 text-orange-500" />
									Execute Merge
								</h3>
								
								<div class="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-4">
									<h4 class="font-semibold text-text mb-3">Merge Summary</h4>
									<div class="space-y-2 text-sm">
										<div class="flex justify-between">
											<span class="text-text-secondary">First Deposit:</span>
											<span class="font-semibold text-text">{selectedMerge1Deposit.displayAmount}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-text-secondary">Second Deposit:</span>
											<span class="font-semibold text-text">{selectedMerge2Deposit.displayAmount}</span>
										</div>
										{#if autoSelectedFeeInfo}
											<div class="flex justify-between">
												<span class="text-text-secondary">Network Fee:</span>
												<span class="font-semibold text-text">{autoSelectedFeeInfo.feeInfo.formatted} STRK</span>
											</div>
										{/if}
									</div>
								</div>

								<Button 
									text="Combine Deposits" 
									loading={isLoading} 
									onClick={initiateMerge}
									class_="w-full py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-300" 
								/>
							</div>
						</Card>
					{/if}
				</div>

				<!-- Information Panel -->
				<div class="space-y-6">
					<!-- How Merging Works -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-4">
							<h3 class="text-xl font-bold text-text flex items-center gap-2">
								<Combine class="w-5 h-5 text-orange-500" />
								How Private Merging Works
							</h3>
							<div class="space-y-4">
								<div class="flex items-start gap-3">
									<div class="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">1</div>
									<div>
										<p class="font-medium text-text">Select Two Deposits</p>
										<p class="text-sm text-text-secondary">Choose two deposits of the same token to combine</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div class="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">2</div>
									<div>
										<p class="font-medium text-text">Automatic Fee Selection</p>
										<p class="text-sm text-text-secondary">System auto-selects optimal STRK deposit for fees</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div class="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">3</div>
									<div>
										<p class="font-medium text-text">Zero-Knowledge Proof</p>
										<p class="text-sm text-text-secondary">Generate cryptographic proof of valid merge</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div class="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-1">4</div>
									<div>
										<p class="font-medium text-text">Combined Note</p>
										<p class="text-sm text-text-secondary">Receive single note with total combined amount</p>
									</div>
								</div>
							</div>
						</div>
					</Card>

					<!-- Security Features -->
					<Card class_="border-0 shadow-xl bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20">
						<div class="space-y-4">
							<h3 class="text-xl font-bold text-text flex items-center gap-2">
								<Shield class="w-5 h-5 text-orange-500" />
								Privacy Benefits
							</h3>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<CheckCircle class="w-5 h-5 text-orange-500" />
									<span class="text-sm font-medium text-text">Consolidate multiple notes privately</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="w-5 h-5 text-orange-500" />
									<span class="text-sm font-medium text-text">Maintain transaction unlinkability</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="w-5 h-5 text-orange-500" />
									<span class="text-sm font-medium text-text">Optimize note management</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="w-5 h-5 text-orange-500" />
									<span class="text-sm font-medium text-text">Zero-knowledge validation</span>
								</div>
							</div>
						</div>
					</Card>

					<!-- Quick Stats -->
					<div class="grid grid-cols-2 gap-4">
						<Card class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center">
							<div class="space-y-2">
								<div class="text-2xl font-bold text-orange-500">2→1</div>
								<div class="text-sm text-text-secondary">Consolidation</div>
							</div>
						</Card>
						<Card class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center">
							<div class="space-y-2">
								<div class="text-2xl font-bold text-red-500">🔒</div>
								<div class="text-sm text-text-secondary">Private</div>
							</div>
						</Card>
					</div>

					<!-- Important Note -->
					<Card class_="border-0 shadow-lg bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20">
						<div class="flex items-start gap-3">
							<AlertTriangle class="w-5 h-5 text-yellow-500 mt-0.5" />
							<div>
								<h4 class="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Requirements</h4>
								<p class="text-sm text-yellow-700 dark:text-yellow-300">
									Both deposits must be of the same token type. You'll need STRK deposits for transaction fees.
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
		title="Confirm Private Merge"
		confirmText="Execute Merge"
		cancelText="Cancel"
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
			<div class="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-4">
				<h4 class="font-semibold text-text mb-3">Merge Summary</h4>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-text-secondary">First Amount:</span>
						<span class="font-semibold text-text">{merge1Amount}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-secondary">Second Amount:</span>
						<span class="font-semibold text-text">{merge2Amount}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-secondary">Network Fee:</span>
						<span class="font-semibold text-text">{feeWeiHex} STRK</span>
					</div>
					<div class="border-t pt-2 mt-2">
						<div class="flex justify-between">
							<span class="text-text-secondary">Combined Total:</span>
							<span class="font-bold text-orange-600">{merge1Amount && merge2Amount ? (parseFloat(merge1Amount) + parseFloat(merge2Amount)).toFixed(6) : '0'}</span>
						</div>
					</div>
				</div>
			</div>
			<p class="text-sm text-text-secondary">
				This merge operation will combine your two deposits into a single private note and cannot be reversed.
			</p>
		</div>
	</Modal>
	
	<ProgressModal 
		show={$progressModalStore.show}
		title={$progressModalStore.title}
		steps={$progressModalStore.steps}
		onClose={progressModalActions.hide}
	/>
</ProtectedRoute>
