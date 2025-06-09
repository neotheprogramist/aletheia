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
	import { confirmOperation } from '$lib/privacy/confirmOperation';
	import { nullifyOperation } from '$lib/privacy/nullifyOperation';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import { loadDeposits, type DisplayOperation } from '$lib/utils/loadDepositsForToken';
	import { defaultDepositColumns } from '$lib/utils/sharedColumns';
	import SelectionToggle from '$lib/ui/SelectionToggle.svelte';
	import Instructions, { type WithdrawMode } from '$lib/ui/Instructions.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import SelectedDeposits from '$lib/ui/SelectedDeposits.svelte';
	import { supportedTokens } from '$lib/config/tokens';
	import { browser } from '$app/environment';
	import { generateHonkCalldata } from '$lib/privacy/generateProof';

	const STRK_ADDRESS = supportedTokens[0].address;

	let deposits: DisplayOperation[] = [];
	let selectionMode: WithdrawMode = 'withdraw';

	let selectedWithdrawKey: number | null = null;
	let selectedWithdrawDeposit: DisplayOperation | null = null;
	let selectedFeeKey: number | null = null;
	let selectedFeeDeposit: DisplayOperation | null = null;

	let withdrawNote: NoteData | null = null;
	let feeNote: NoteData | null = null;

	let withdrawRecipient = '';
	let withdrawAmount = '';
	let withdrawRefundHash: string | null = null;
	let feeRefundHash: string | null = null;
	let feeWeiHex = '';

	let isLoading = false;
	let showFeeModal = false;

	// Confirmation data
	let withdrawNoteBalanceWei: bigint | null = null;
	let userWithdrawAmountWei: bigint | null = null;
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
		if (selectionMode === 'withdraw') {
			selectedWithdrawKey = deposits[globalIdx].index;
			selectedWithdrawDeposit = deposits.find((d) => d.index === selectedWithdrawKey) ?? null;
			withdrawRecipient = '';
			withdrawAmount = '';
		} else {
			selectedFeeKey = deposits[globalIdx].index;
			selectedFeeDeposit = deposits.find((d) => d.index === selectedFeeKey) ?? null;
		}
	}

	function resetAll() {
		selectedWithdrawKey = null;
		selectedWithdrawDeposit = null;
		selectedFeeKey = null;
		selectedFeeDeposit = null;
	}

	function handleSelectionChange(value: string) {
		selectionMode = value as WithdrawMode;

		if (value === 'fee') {
			selectedToken.set(STRK_ADDRESS);
		}
	}

	/** Step 1: Validate */
	async function initiateWithdraw() {
		isLoading = true;
		await wrapWithToast(
			async () => {
				if (!selectedWithdrawDeposit || !selectedFeeDeposit) {
					throw new Error('Please select both a withdraw deposit and a fee deposit');
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

				// — Parse Fee note
				feeNote = NoteDataSchema.parse(selectedFeeDeposit.data);
				const { tokenAddress: feeTokenAddress, amount: feeNoteBalance } = feeNote;

				const feeNoteDecimals = await fetchTokenDecimals(feeTokenAddress);
				feeNoteBalanceWei = BigInt(feeNoteBalance);
				feeWei = await fetchExtensionFee(
					PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
					PUBLIC_WITHDRAW_EXTENSION_CONTRACT_ADDRESS
				);
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
				loading: '⏳ Executing Withdraw',
				success: '✅ Withdraw ready!',
				error: '❌ Withdraw failed'
			},
			async (err) => {
				console.warn('❌ Withdraw failed with error:', err);
				isLoading = false;
			}
		);
	}

	/** Step 2: Proving & Execution */
	async function confirmWithdraw() {
		// 1) Close the modal and start the toast
		showFeeModal = false;

		await wrapWithToast(
			async () => {
				// 2) Validate that note balances and calculated amounts are present
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

				// 8) Generate the zk proof and prepare it as calldata
				const honkCalldataHex = await generateHonkCalldata(
					'circuits/execute.json',
					'circuits/recursive.json',
					'circuits/vk_recursive.bin',
					executeInput
				);

				// 9) Prepare for the StarkNet transaction
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

				const tx = await account.execute(call);
				const receipt = await rpc.waitForTransaction(tx.transaction_hash);

				// 10) Check receipt status and throw on failure
				if (receipt.isReverted()) {
					throw new Error(`Transaction reverted: ${receipt.value}`);
				} else if (!receipt.isSuccess()) {
					throw new Error(`Transaction error: ${receipt.value}`);
				}

				// 11) Confirm and nullify operations in the database
				await confirmOperation(withdrawRefundHash);
				await confirmOperation(feeRefundHash);
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
			},
			{
				loading: '⏳ Sending Withdraw Tx',
				success: '✅ Withdraw sent!',
				error: '❌ Withdraw failed'
			},
			async (err) => {
				// 13) On error: abort any created refund operations
				console.warn('❌ Withdraw failed with error:', err);
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
			}
		);

		isLoading = false;
	}
</script>

<ProtectedRoute>
	<div class="mx-auto p-6">
		<Card>
			<SelectionToggle
				options={[
					{ label: 'Withdraw', value: 'withdraw', isFirst: true },
					{ label: 'Fee', value: 'fee', isLast: true }
				]}
				selected={selectionMode}
				onChange={handleSelectionChange}
				onReset={resetAll}
			/>

			<!-- Instructions -->
			<Instructions action="withdraw" mode={selectionMode} />

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
					disabledKeys={undefined}
					onRowClick={handleRowClick}
					activeKey={selectionMode === 'withdraw' ? selectedWithdrawKey : selectedFeeKey}
					inactiveKeys={selectionMode === 'withdraw' && selectedFeeKey !== null
						? [selectedFeeKey]
						: selectionMode === 'fee' && selectedWithdrawKey !== null
							? [selectedWithdrawKey]
							: []}
					hoverClass="hover:bg-green-600"
				/>
			{/if}

			<!-- Selected‐deposit cards -->
			<SelectedDeposits
				items={[
					{ title: 'Withdrawal Deposit', deposit: selectedWithdrawDeposit },
					{ title: 'Fee Deposit', deposit: selectedFeeDeposit }
				]}
			/>

			<!-- Withdraw Form -->
			{#if selectedWithdrawDeposit && selectedFeeDeposit}
				<div class="mt-6 grid w-full grid-cols-1 justify-items-center">
					<Card>
						<form on:submit|preventDefault={initiateWithdraw} class="mt-6 flex flex-col gap-4">
							<Input
								bind:value={withdrawRecipient}
								required
								placeholder="Recipient Address"
								class_="w-full"
							/>
							<Input
								bind:value={withdrawAmount}
								required
								placeholder="Amount to Withdraw"
								class_="w-full"
							/>
							<Button text="Withdraw" class_="mt-2 w-full" loading={isLoading} type="submit" />
						</form>
					</Card>
				</div>
			{/if}

			<!-- Modal Confirm -->
			<Modal
				show={showFeeModal}
				title="Confirm Withdraw"
				confirmText="Accept"
				cancelText="Reject"
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
				<p class="text-sm">
					You’re about to withdraw
					<strong class="break-words">{withdrawAmount}</strong>
					tokens, paying a fee of
					<strong class="break-words">{feeWeiHex}</strong>
					tokens. Proceed?
				</p>
			</Modal>
		</Card>
	</div>
</ProtectedRoute>
