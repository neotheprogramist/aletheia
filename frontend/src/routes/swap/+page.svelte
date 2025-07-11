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
	}

	/** Auto-select fee deposit when swap deposit is chosen */
	async function autoSelectFeeDeposit() {
		if (!selectedSwapDeposit) return;

		feePreloadError = null;

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
		progressModalActions.show('Swap Progress', [...swapProgressSteps]);

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
	<div class="mx-auto p-3 sm:p-6">
		<Card>
			<h2 class="mb-3 sm:mb-4 text-xl sm:text-2xl font-bold">Swap</h2>
			<p class="mb-4 sm:mb-6 text-sm sm:text-base text-gray-600">
				Select a deposit to swap from. Fee deposit will be automatically selected.
			</p>

			<TokenSelect
				tokens={$tokens}
				bind:value={$selectedToken}
				placeholder="Filter deposits by token"
				class_="mb-3 sm:mb-4 w-full sm:w-64"
			/>
			<!-- Deposits Table -->
			{#if !deposits.length}
				<h2 class="text-center">Please make a deposit first!</h2>
			{:else}
				<PaginatedTable
					columns={defaultDepositColumns}
					items={deposits}
					pageSize={5}
					keyField="index"
					disabledKeys={undefined}
					onRowClick={handleRowClick}
					activeKey={selectedSwapKey}
					inactiveKeys={selectedFeeKey !== null ? [selectedFeeKey] : []}
					hoverClass="hover:bg-green-600"
				/>
			{/if}

			<!-- Auto-selected fee information -->
			{#if autoSelectedFeeInfo}
				<div class="mt-3 sm:mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:p-4">
					<h3 class="mb-2 text-sm sm:text-base font-semibold text-blue-800">Fee Information</h3>
					<p class="text-sm text-blue-700">
						Fee: <strong>{autoSelectedFeeInfo.feeInfo.formatted} STRK</strong>
						{#if autoSelectedFeeInfo.feeDeposit}
							• Auto-selected fee deposit: <strong
								>{autoSelectedFeeInfo.feeDeposit.displayAmount}</strong
							>
						{/if}
					</p>
				</div>
			{/if}

			<!-- Error message -->
			{#if feePreloadError}
				<div class="mt-3 sm:mt-4 rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4">
					<p class="text-sm text-red-700">{feePreloadError}</p>
				</div>
			{/if}

			<!-- Selected‐deposit cards -->
			<SelectedDeposits
				items={[
					{ title: 'Swap Deposit', deposit: selectedSwapDeposit },
					{ title: 'Fee Deposit (Auto-selected)', deposit: selectedFeeDeposit }
				]}
			/>

			<!-- Swap Form -->
			{#if selectedSwapDeposit && selectedFeeDeposit && !feePreloadError}
				<div class="mt-4 sm:mt-6 grid w-full grid-cols-1 justify-items-center">
					<Card>
						<form on:submit|preventDefault={initiateSwap} class="mt-4 sm:mt-6 flex flex-col gap-3 sm:gap-4">
							<div class="flex gap-2">
								<Input
									bind:value={swapAmount}
									required
									placeholder="Amount to Swap"
									class_="flex-1"
								/>
								<button
									type="button"
									class="rounded bg-blue-500 px-3 sm:px-4 py-2 text-xs sm:text-sm text-white hover:bg-blue-600"
									on:click={() => {
										if (selectedFeeDeposit) {
											swapAmount = selectedFeeDeposit.displayAmount;
										}
									}}
								>
									Max
								</button>
							</div>

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
								<p class="text-sm text-red-500">Brak dostępnych tokenów do swapu.</p>
							{/if}
							<Button text="Swap" class_="mt-2 w-full" loading={isLoading} type="submit" />
						</form>
					</Card>
				</div>
			{/if}

			<!-- Modal Confirm -->
			<Modal
				show={showFeeModal}
				title="Confirm Swap"
				confirmText="Accept"
				cancelText="Reject"
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
				<p class="text-sm">
					You’re about to swap
					<strong class="break-words">{swapAmount}</strong>
					tokens, paying a fee of
					<strong class="break-words">{feeWeiHex}</strong>
					tokens. Proceed?
				</p>
			</Modal>
		</Card>
	</div>

	<ProgressModal
		show={$progressModalStore.show}
		title={$progressModalStore.title}
		steps={$progressModalStore.steps}
		onClose={progressModalActions.hide}
	/>
</ProtectedRoute>
