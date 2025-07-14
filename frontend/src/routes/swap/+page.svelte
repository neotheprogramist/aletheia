<script lang="ts">
	import { wrapWithToast } from '$lib/utils/toast';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import PaginatedTable from '$lib/ui/PaginatedTable.svelte';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { fromWei, toWei } from '$lib/utils/toWei';
	import { NoteDataSchema, type NoteData } from '$lib/schemas/schemas';
	import { fetchExtensionFee } from '$lib/utils/fetchFeeForExtension';
	import Modal from '$lib/ui/Modal.svelte';
	import InsufficientFeeModal from '$lib/ui/InsufficientFeeModal.svelte';
	import {
		PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
		PUBLIC_SWAP_EXTENSION_CONTRACT_ADDRESS,
		PUBLIC_SWAP_EXTENSION_DEPOSITED_SELECTOR
	} from '$env/static/public';
	import { get } from 'svelte/store';
	import { zkLibraries } from '$lib/stores/zkLibraries';
	import { merkleTree } from '$lib/services/depositProcessor';
	import Input from '$lib/ui/Input.svelte';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { getFullOperation, getOperationDetails } from '$lib/db/operations';
	import { paymasterWallet } from '$lib/stores/paymaster';
	import { provider } from '$lib/stores/provider';
	import { Contract } from 'starknet';
	import { nullifyOperation } from '$lib/privacy/nullifyOperation';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { loadDeposits, type DisplayOperation } from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns } from '$lib/utils/sharedColumns';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';
	import { supportedTokens } from '$lib/config/tokens';
	import { browser } from '$app/environment';
	import { generateHonkCalldata } from '$lib/privacy/generateProof';
	import { autoSelectCompleteProcess, type AutoSelectedFee } from '$lib/utils/autoSelectFeeDeposit';
	import { walletAddress } from '$lib/stores/wallet';
	import { buildSwapCalldata, fetchEkuboQuote } from '$lib/utils/swap';
	import { supportedPools } from '$lib/config/swap';
	import { extractDepositedEventsFromReceipt } from '$lib/utils/extractDepositedEventsFromReceipt';
	import { updateOperation } from '$lib/db/operationsDb';
	import ProgressModal from '$lib/ui/ProgressModal.svelte';
	import {
		progressModalStore,
		progressModalActions,
		swapProgressSteps
	} from '$lib/stores/progressModal';
	import {
		Shuffle,
		RefreshCw,
		TrendingUp,
		ArrowRightLeft,
		Shield,
		Zap,
		Lock,
		CheckCircle,
		DollarSign,
		ArrowRight,
		Coins,
		BarChart3
	} from 'lucide-svelte';
	import { t } from '$lib/i18n';

	const STRK_ADDRESS = supportedTokens[0].address;

	let deposits: DisplayOperation[] = [];

	let selectedSwapKey: number | null = null;
	let selectedSwapDeposit: DisplayOperation | null = null;
	let selectedFeeKey: number | null = null;
	let selectedFeeDeposit: DisplayOperation | null = null;

	// Auto-selected fee information
	let autoSelectedFeeInfo: AutoSelectedFee | null = null;
	let feePreloadError: string | null = null;

	let swapNote: NoteData | null = null;
	let feeNote: NoteData | null = null;

	const swapRecipient = get(walletAddress);
	let swapAmount = '';
	let swapRefundHash: string | null = null;
	let feeRefundHash: string | null = null;
	let feeWeiHex = '';
	let emptyOpHash = '';

	let isLoading = false;
	let showFeeModal = false;
	let showInsufficientFeeModal = false;

	// Confirmation data
	let swapNoteBalanceWei: bigint | null = null;
	let userSwapAmountWei: bigint | null = null;
	let feeNoteBalanceWei: bigint | null = null;
	let feeWei: bigint | null = null;

	let targetToken = '';

	$: if (browser && $selectedToken) {
		loadDeposits(
			$selectedToken,
			(d) => (deposits = d),
			(b) => (isLoading = b)
		);
	}

	$: if (selectedSwapDeposit) {
		const {
			data: { tokenAddress }
		} = selectedSwapDeposit;

		// Fetch all supported tokens
		const allTokens = get(tokens) as { address: string; symbol: string }[];

		//Remove selected swap token (selectedSwapToken -> targetToken)
		const allowed = allTokens.filter((t) => t.address !== tokenAddress);

		if (allowed.length > 0) {
			if (!targetToken || !allowed.find((t) => BigInt(t.address) === BigInt(targetToken))) {
				targetToken = allowed[0].address;
			}
		} else {
			targetToken = '';
		}
	}

	function handleRowClick(globalIdx: number) {
		selectedSwapKey = deposits[globalIdx].index;
		selectedSwapDeposit = deposits.find((d) => d.index === selectedSwapKey) ?? null;
		swapAmount = '';

		// Auto-select fee deposit when swap deposit is selected
		if (selectedSwapDeposit) {
			autoSelectFeeDeposit();
		}
	}

	function resetAll() {
		selectedSwapKey = null;
		selectedSwapDeposit = null;
		selectedFeeKey = null;
		selectedFeeDeposit = null;
		autoSelectedFeeInfo = null;
		feePreloadError = null;
		showInsufficientFeeModal = false;
	}

	/** Auto-select fee deposit when swap deposit is chosen */
	async function autoSelectFeeDeposit() {
		if (!selectedSwapDeposit) return;

		feePreloadError = null;
		showInsufficientFeeModal = false;

		try {
			// Get fee info and auto-select the best STRK deposit
			const excludeDeposits = [selectedSwapDeposit];
			autoSelectedFeeInfo = await autoSelectCompleteProcess(
				'swap',
				PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				PUBLIC_SWAP_EXTENSION_CONTRACT_ADDRESS,
				excludeDeposits
			);

			// Set the auto-selected fee deposit
			if (autoSelectedFeeInfo.feeDeposit) {
				selectedFeeDeposit = autoSelectedFeeInfo.feeDeposit;
				selectedFeeKey = autoSelectedFeeInfo.feeDeposit.index;
			} else {
				selectedFeeDeposit = null;
				selectedFeeKey = null;

				// Both scenarios should show the modal, not the small error alert
				showInsufficientFeeModal = true;
			}
		} catch (error) {
			console.error('Error auto-selecting fee deposit:', error);
			feePreloadError = 'Failed to load fee information';
			autoSelectedFeeInfo = null;
		}
	}

	/** Step 1: Validate */
	async function initiateSwap() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedSwapDeposit || !selectedFeeDeposit || !autoSelectedFeeInfo) {
					throw new Error('Please select a swap deposit first');
				}

				// — Parse Swap note
				swapNote = NoteDataSchema.parse(selectedSwapDeposit.data);
				const { tokenAddress: swapTokenAddress, amount: swapNoteBalance } = swapNote;

				// If no targetToken has been selected yet, bail out
				if (!targetToken) {
					throw new Error('Please select a token to receive');
				}

				// Check that (swapTokenAddress, targetToken) exists in supportedPools (in either order)

				const pairIsSupported = supportedPools.some(
					({ token0, token1 }) =>
						(BigInt(token0) === BigInt(swapTokenAddress) &&
							BigInt(token1) === BigInt(targetToken)) ||
						(BigInt(token1) === BigInt(swapTokenAddress) && BigInt(token0) === BigInt(targetToken))
				);
				if (!pairIsSupported) {
					throw new Error('The selected token pair is not supported for swapping');
				}

				const swapDecimals = await fetchTokenDecimals(swapTokenAddress);
				swapNoteBalanceWei = BigInt(swapNoteBalance);
				userSwapAmountWei = toWei(swapAmount, swapDecimals);

				if (
					swapNoteBalanceWei <= 0n ||
					userSwapAmountWei <= 0n ||
					userSwapAmountWei > swapNoteBalanceWei
				) {
					throw new Error('Invalid swap amount');
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
				loading: '⏳ Executing Swap',
				success: '✅ Swap ready!',
				error: '❌ Swap failed'
			},
			async (err) => {
				console.warn('❌ Swap failed with error:', err);
				isLoading = false;
			}
		);
	}

	/** Step 2: Proving & Execution */
	async function confirmSwap() {
		// 1) Close the modal and start progress
		showFeeModal = false;
		progressModalActions.show('Swap Progress', [...swapProgressSteps($t)]);

		try {
			// 2) Validate that note balances and calculated amounts are present
			progressModalActions.updateStep('preparation', 'loading');
			if (!swapNoteBalanceWei || !userSwapAmountWei) {
				throw new Error('Cannot calculate refund – missing swap amounts');
			}
			if (!feeNoteBalanceWei || !feeWei) {
				throw new Error('Cannot calculate refund – missing fee amounts');
			}

			// 3) Ensure zk library and merkle tree are initialized
			const { garaga } = get(zkLibraries);
			if (!garaga) throw new Error('Garaga not initialized');
			if (!feeNote || !selectedFeeDeposit || !swapNote || !selectedSwapDeposit) {
				throw new Error('Missing fee or swap deposit');
			}
			const tree = merkleTree;
			if (!tree) throw new Error('Merkle tree does not exist');

			// 4) Compute commitments for the swap and fee deposits
			// And get the data for proving
			const swapProofData = tree.getProofData(
				garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(selectedSwapDeposit.hash), swapNoteBalanceWei),
					BigInt(swapNote.tokenAddress)
				)
			);
			const feeProofData = tree.getProofData(
				garaga.poseidonHashBN254(
					garaga.poseidonHashBN254(BigInt(selectedFeeDeposit.hash), feeNoteBalanceWei),
					BigInt(feeNote.tokenAddress)
				)
			);

			// 5) Generate refund operations and compute their commitment hashes
			const swapRefund = swapNoteBalanceWei - userSwapAmountWei;
			const swapOpResult = await generateOperation({
				data: { tokenAddress: swapNote.tokenAddress, amount: swapRefund }
			});
			swapRefundHash = swapOpResult.hash;

			const feeRefund = feeNoteBalanceWei - feeWei;
			const feeOpResult = await generateOperation({
				data: { tokenAddress: feeNote.tokenAddress, amount: feeRefund }
			});
			feeRefundHash = feeOpResult.hash;

			const swapRefundCommitmentHash = garaga.poseidonHashBN254(
				garaga.poseidonHashBN254(BigInt(swapRefundHash), swapRefund),
				BigInt(swapNote.tokenAddress)
			);
			const feeRefundCommitmentHash = garaga.poseidonHashBN254(
				garaga.poseidonHashBN254(BigInt(feeRefundHash), feeRefund),
				BigInt(feeNote.tokenAddress)
			);

			// 6) Fetch details for all operations from the database
			const swapOp = await getOperationDetails(selectedSwapDeposit.hash);
			const feeOp = await getOperationDetails(selectedFeeDeposit.hash);
			const swapRefundOp = await getOperationDetails(swapRefundHash);
			const feeRefundOp = await getOperationDetails(feeRefundHash);

			if (!swapOp || !feeOp || !swapRefundOp || !feeRefundOp) {
				throw new Error('One or more operations not found');
			}

			// 7) Build the witness input object for proof
			const executeInput = {
				// Deposit data
				root_1: `0x${swapProofData.root.toString(16)}`,
				secret_1: `0x${BigInt(swapOp.secret).toString(16)}`,
				nullifier_1: `0x${BigInt(swapOp.nullifier).toString(16)}`,
				commitment_amount_1: `0x${BigInt(swapOp.amount).toString(16)}`,
				token_address_1: swapOp.tokenAddress,
				hashpath_1: swapProofData.path[0].map((e) => `0x${e.toString(16)}`),
				index_1: `0x${BigInt(swapProofData.index).toString(16)}`,
				amount: `0x${userSwapAmountWei.toString(16)}`,
				// Fee deposit data
				root_2: `0x${feeProofData.root.toString(16)}`,
				secret_2: `0x${BigInt(feeOp.secret).toString(16)}`,
				nullifier_2: `0x${BigInt(feeOp.nullifier).toString(16)}`,
				commitment_amount_2: `0x${BigInt(feeOp.amount).toString(16)}`,
				token_address_2: feeOp.tokenAddress,
				hashpath_2: feeProofData.path[0].map((e) => `0x${e.toString(16)}`),
				index_2: `0x${BigInt(feeProofData.index).toString(16)}`,
				gas_fee: `0x${feeWei.toString(16)}`,
				// Refund for swap deposit
				refund_secret_1: `0x${BigInt(swapRefundOp.secret).toString(16)}`,
				refund_nullifier_1: `0x${BigInt(swapRefundOp.nullifier).toString(16)}`,
				refund_amount_1: `0x${swapRefund.toString(16)}`,
				refund_commitment_hash_1: `0x${swapRefundCommitmentHash.toString(16)}`,
				// Refund for fee deposit
				refund_secret_2: `0x${BigInt(feeRefundOp.secret).toString(16)}`,
				refund_nullifier_2: `0x${BigInt(feeRefundOp.nullifier).toString(16)}`,
				refund_amount_2: `0x${feeRefund.toString(16)}`,
				refund_commitment_hash_2: `0x${feeRefundCommitmentHash.toString(16)}`,
				// recipient
				_recipient: swapRecipient
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

			// 9) Fetch swap quote from Ekubo
			progressModalActions.updateStep('quote-fetching', 'loading');
			const ekuboResponse = await fetchEkuboQuote(
				userSwapAmountWei,
				selectedSwapDeposit.data.tokenAddress,
				targetToken
			);

			emptyOpHash = (await generateOperation({})).hash;

			const extensionCalldata = buildSwapCalldata(
				ekuboResponse,
				selectedSwapDeposit.data.tokenAddress,
				BigInt(emptyOpHash)
			);
			progressModalActions.updateStep('quote-fetching', 'completed');

			// 10) Prepare for the StarkNet transaction
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
				entrypoint: 'execute_extension',
				calldata: [
					...honkCalldataWithLen,
					PUBLIC_SWAP_EXTENSION_CONTRACT_ADDRESS,
					...extensionCalldata
				]
			};
			progressModalActions.updateStep('transaction-prepare', 'completed');

			progressModalActions.updateStep('executing-transaction', 'loading');
			const tx = await account.execute(call);
			progressModalActions.updateStep('executing-transaction', 'completed');

			progressModalActions.updateStep('onchain-confirmation', 'loading');
			const receipt = await rpc.waitForTransaction(tx.transaction_hash);

			// 11) Check receipt status and throw on failure
			if (receipt.isReverted()) {
				throw new Error(`Transaction reverted: ${receipt.value}`);
			} else if (!receipt.isSuccess()) {
				throw new Error(`Transaction error: ${receipt.value}`);
			}

			const swappedDeposits = extractDepositedEventsFromReceipt(
				receipt,
				PUBLIC_SWAP_EXTENSION_DEPOSITED_SELECTOR,
				targetToken
			);
			if (swappedDeposits.length === 0) {
				throw new Error('No Deposited event for token: ' + targetToken);
			}
			const { token: depositedTokenHex, amount: depositedAmountBI } = swappedDeposits[0];

			const opRecord = await getFullOperation(emptyOpHash);
			if (!opRecord) {
				throw new Error('Could not find operation with hash: ' + emptyOpHash);
			}

			const normalizedToken = '0x' + BigInt(depositedTokenHex).toString(16).padStart(64, '0');

			const hashBigInt = BigInt(opRecord.hash);
			const preCommitment = garaga.poseidonHashBN254(hashBigInt, depositedAmountBI);
			const commitment = garaga.poseidonHashBN254(preCommitment, BigInt(normalizedToken));

			opRecord.data = {
				tokenAddress: normalizedToken,
				amount: depositedAmountBI.toString()
			};
			opRecord.commitment = commitment.toString();

			await updateOperation(opRecord);

			progressModalActions.updateStep('onchain-confirmation', 'completed');

			// 12) nullify operations in the database
			await nullifyOperation(selectedSwapDeposit.hash);
			await nullifyOperation(selectedFeeDeposit.hash);

			// 13) Reset component state after successful swap
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
			// 14) On error: abort any created refund operations
			console.warn('❌ Swap failed with error:', err);

			const currentSteps = $progressModalStore.steps;
			const currentStepIndex = currentSteps.findIndex((step) => step.status === 'loading');
			if (currentStepIndex !== -1) {
				progressModalActions.updateStep(currentSteps[currentStepIndex].id, 'error');
			}

			if (emptyOpHash) {
				try {
					await abortOperation(emptyOpHash);
					console.warn('🧯 Aborted swap result operation:', emptyOpHash);
				} catch (abortError) {
					console.error('🚨 Failed to abort swap result:', abortError);
				}
			}
			if (swapRefundHash) {
				try {
					await abortOperation(swapRefundHash);
					console.warn('🧯 Aborted refund operation:', swapRefundHash);
				} catch (abortError) {
					console.error('🚨 Failed to abort Swap refund:', abortError);
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
		class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
	>
		<div class="mx-auto max-w-6xl p-6 pt-8">
			<!-- Header Section -->
			<div class="mb-8 text-center">
				<div class="mb-4 flex items-center justify-center gap-3">
					<div
						class="rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 p-3 text-white shadow-lg"
					>
						<Shuffle class="h-8 w-8" />
					</div>
					<h1
						class="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl"
					>
						{$t('swap.page_title')}
					</h1>
				</div>
				<p class="text-text-secondary mx-auto max-w-2xl text-lg">
					{$t('swap.page_description')}
				</p>
			</div>

			<div class="grid gap-6 lg:grid-cols-4">
				<!-- Main Swap Interface -->
				<div class="space-y-6 lg:col-span-2">
					<!-- Token Selection & Deposit Table -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-6">
							<div class="mb-4 flex items-center gap-3">
								<Coins class="h-5 w-5 text-indigo-500" />
								<h3 class="text-text text-xl font-bold">{$t('swap.select_deposit_title')}</h3>
							</div>

							<TokenSelect
								tokens={$tokens}
								bind:value={$selectedToken}
								placeholder={$t('swap.filter_deposits_placeholder')}
								class_="w-full"
							/>

							{#if !deposits.length}
								<div class="py-12 text-center">
									<div
										class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 p-4 dark:bg-indigo-900/20"
									>
										<Shuffle class="h-8 w-8 text-indigo-500" />
									</div>
									<h3 class="text-text mb-2 text-lg font-semibold">{$t('swap.no_deposits_title')}</h3>
									<p class="text-text-secondary">{$t('swap.no_deposits_description')}</p>
								</div>
							{:else}
								<div
									class="rounded-lg bg-gradient-to-r from-gray-50 to-gray-100 p-1 dark:from-gray-700 dark:to-gray-600"
								>
									<PaginatedTable
										columns={defaultDepositColumns}
										items={deposits}
										pageSize={5}
										keyField="index"
										disabledKeys={undefined}
										onRowClick={handleRowClick}
										activeKey={selectedSwapKey}
										inactiveKeys={selectedFeeKey !== null ? [selectedFeeKey] : []}
										hoverClass="hover:bg-indigo-600"
									/>
								</div>
							{/if}
						</div>
					</Card>

					<!-- Auto-selected fee information -->
					{#if autoSelectedFeeInfo}
						<Card
							class_="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20"
						>
							<div class="space-y-4">
								<div class="flex items-start gap-3">
									<div class="rounded-lg bg-blue-500 p-2 text-white">
										<DollarSign class="h-4 w-4" />
									</div>
									<div class="flex-1">
										<h3 class="mb-2 font-semibold text-blue-800 dark:text-blue-300">
											Fee Information
										</h3>
										<p class="text-sm text-blue-700 dark:text-blue-400">
											Fee: <strong>{autoSelectedFeeInfo.feeInfo.formatted} STRK</strong>
											{#if autoSelectedFeeInfo.feeDeposit}
												• Auto-selected fee deposit: <strong
													>{autoSelectedFeeInfo.feeDeposit.displayAmount}</strong
												>
											{/if}
										</p>
									</div>
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
												{$t('common.auto_fee_swap_explanation', { 
													default: 'The system automatically selected the best STRK deposit to pay for network fees. This deposit is separate from your swap deposit to maintain privacy.' 
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
							class_="border-0 shadow-lg bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20"
						>
							<div class="flex items-start gap-3">
								<div class="rounded-lg bg-red-500 p-2 text-white">
									<Shield class="h-4 w-4" />
								</div>
								<div class="flex-1">
									<p class="text-sm text-red-700 dark:text-red-400">{feePreloadError}</p>
								</div>
							</div>
						</Card>
					{/if}

					<!-- Selected Deposits Display -->
					{#if selectedSwapDeposit || selectedFeeDeposit}
						<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
							<div class="space-y-4">
								<div class="mb-4 flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-green-500" />
									<h3 class="text-text text-xl font-bold">{$t('swap.selected_deposits_title')}</h3>
								</div>
								<SelectedDeposits
									items={[
										{ title: 'Swap Deposit', deposit: selectedSwapDeposit },
										{ title: 'Fee Deposit (Auto-selected)', deposit: selectedFeeDeposit }
									]}
								/>
							</div>
						</Card>
					{/if}

					<!-- Swap Form -->
					{#if selectedSwapDeposit && selectedFeeDeposit && !feePreloadError}
						<Card
							class_="border-0 shadow-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20"
						>
							<div class="space-y-6">
								<div class="mb-4 flex items-center gap-3">
									<RefreshCw class="h-5 w-5 text-indigo-500" />
									<h3 class="text-text text-xl font-bold">{$t('swap.configure_swap_title')}</h3>
								</div>

								<form on:submit|preventDefault={initiateSwap} class="space-y-6">
									<!-- Amount Input -->
									<div class="space-y-3">
										<label class="text-text flex items-center gap-2 text-sm font-semibold">
											<ArrowRight class="h-4 w-4" />
											{$t('swap.swap_amount_label')}
										</label>
										<div class="flex gap-2">
											<Input
												bind:value={swapAmount}
												required
												placeholder={$t('swap.swap_amount_placeholder')}
												class_="flex-1 text-lg font-medium"
											/>
											<button
												type="button"
												class="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-600"
												on:click={() => {
													if (selectedSwapDeposit) {
														swapAmount = selectedSwapDeposit.displayAmount;
													}
												}}
											>
												{$t('swap.max')}
											</button>
										</div>
									</div>

									<!-- Target Token Selection -->
									<div class="space-y-3">
										<label class="text-text flex items-center gap-2 text-sm font-semibold">
											<TrendingUp class="h-4 w-4" />
											Receive Token
										</label>
										{#if get(tokens).filter((t) => t.address !== selectedSwapDeposit?.data.tokenAddress).length > 0}
											<TokenSelect
												tokens={get(tokens).filter(
													(t) => t.address !== selectedSwapDeposit?.data.tokenAddress
												)}
												bind:value={targetToken}
												placeholder="Select token to receive"
												class_="w-full"
											/>
										{:else}
											<div class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
												<p class="text-sm text-red-700 dark:text-red-400">
													No available tokens for swapping
												</p>
											</div>
										{/if}
									</div>

									<!-- Submit Button -->
									<Button
										text="Execute Private Swap"
										loading={isLoading}
										type="submit"
										class_="w-full py-4 text-lg font-semibold bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-300"
									/>
								</form>
							</div>
						</Card>
					{/if}
				</div>

				<!-- Information Panel -->
				<div class="space-y-6 lg:col-span-2">
					<!-- How Private Swaps Work -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-4">
							<h3 class="text-text flex items-center gap-2 text-xl font-bold">
								<Zap class="h-5 w-5 text-indigo-500" />
								{$t('swap.how_swaps_work_title')}
							</h3>
							<div class="space-y-4">
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white"
									>
										1
									</div>
									<div>
										<p class="text-text font-medium">{$t('swap.how_swaps_step1')}</p>
										<p class="text-text-secondary text-sm">{$t('swap.how_swaps_step1_desc')}</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white"
									>
										2
									</div>
									<div>
										<p class="text-text font-medium">{$t('swap.how_swaps_step2')}</p>
										<p class="text-text-secondary text-sm">{$t('swap.how_swaps_step2_desc')}</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white"
									>
										3
									</div>
									<div>
										<p class="text-text font-medium">{$t('swap.how_swaps_step3')}</p>
										<p class="text-text-secondary text-sm">
											{$t('swap.how_swaps_step3_desc')}
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
										<p class="text-text font-medium">{$t('swap.how_swaps_step4')}</p>
										<p class="text-text-secondary text-sm">
											{$t('swap.how_swaps_step4_desc')}
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card>

					<!-- Security Features -->
					<Card
						class_="border-0 shadow-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20"
					>
						<div class="space-y-4">
							<h3 class="text-text flex items-center gap-2 text-xl font-bold">
								<Lock class="h-5 w-5 text-purple-500" />
								{$t('swap.security_features_title')}
							</h3>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-purple-500" />
									<span class="text-text text-sm font-medium">{$t('swap.security_feature1')}</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-purple-500" />
									<span class="text-text text-sm font-medium">{$t('swap.security_feature2')}</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-purple-500" />
									<span class="text-text text-sm font-medium">{$t('swap.security_feature3')}</span>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-purple-500" />
									<span class="text-text text-sm font-medium">{$t('swap.security_feature4')}</span>
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
								<div class="text-2xl font-bold text-indigo-500">{$t('swap.stats_private_exchange')}</div>
								<div class="text-text-secondary text-sm">{$t('swap.stats_private_exchange_label')}</div>
							</div>
						</Card>
						<Card
							class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center"
						>
							<div class="space-y-2">
								<div class="text-2xl font-bold text-purple-500">{$t('swap.stats_instant_quotes')}</div>
								<div class="text-text-secondary text-sm">{$t('swap.stats_instant_quotes_label')}</div>
							</div>
						</Card>
					</div>

					<!-- Supported Pairs Info -->
					<Card
						class_="border-0 shadow-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20"
					>
						<div class="space-y-3">
							<h4 class="text-text flex items-center gap-2 font-semibold">
								<BarChart3 class="h-4 w-4 text-indigo-500" />
								{$t('swap.supported_pairs_title')}
							</h4>
							<p class="text-text-secondary text-sm">
								{$t('swap.supported_pairs_description')}
							</p>
						</div>
					</Card>
				</div>
			</div>
		</div>
	</div>

	<!-- Modal Confirm -->
	<Modal
		show={showFeeModal}
		title={$t('swap.confirm_private_swap')}
		confirmText={$t('swap.execute_swap_button')}
		cancelText={$t('common.cancel')}
		closeOnOutsideClick={false}
		onConfirm={confirmSwap}
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
				class="flex items-center gap-3 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 p-4 dark:from-indigo-900/20 dark:to-purple-900/20"
			>
				<ArrowRightLeft class="h-5 w-5 text-indigo-500" />
				<div>
					<p class="text-text font-medium">{$t('swap.swap_details')}</p>
					<p class="text-text-secondary text-sm">{$t('swap.swap_details_description')}</p>
				</div>
			</div>
			<div class="space-y-2">
				<p class="text-text text-sm">
					<strong>{$t('swap.amount_to_swap')}</strong>
					<span class="font-mono text-indigo-600 dark:text-indigo-400">{swapAmount}</span> tokens
				</p>
				<p class="text-text text-sm">
					<strong>{$t('swap.transaction_fee')}</strong>
					<span class="font-mono text-purple-600 dark:text-purple-400">{feeWeiHex}</span> STRK
				</p>
			</div>
			<div
				class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20"
			>
				<p class="text-sm text-yellow-800 dark:text-yellow-400">
					{$t('swap.swap_warning')}
				</p>
			</div>
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
