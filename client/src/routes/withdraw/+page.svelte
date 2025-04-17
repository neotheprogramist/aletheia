<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_STRK_TOKEN_ADDRESS } from '$env/static/public';
	import ActionButton from '../../components/ActionButton.svelte';
	import InputField from '../../components/InputField.svelte';
	import PageContentContainer from '../../components/PageContentContainer.svelte';
	import { sanitizeAmount, validateAmountInput } from '$lib/utils/sanitize';
	import { TxnType } from '$lib/types/api';
	import { privacy } from 'privacy-provider';
	import JsonAction from '../../components/JsonAction.svelte';
	import { wrapWithToast } from '$lib/utils/wrapWithToast';

	let tokenAddress: string = PUBLIC_STRK_TOKEN_ADDRESS;
	let withdrawFee: string | null = null;
	let tokenName: string = '';
	let onFeeAccepted: ((accepted: boolean) => void) | null = null;
	let maxWithdraw: string = '';
	let refund: any = null;
	let proofData: any = null;
	let transactionHash: string = '';
	let commitmentAmount: string = '';
	let recipient: string = '';
	let amount: string = '';
	let areInputsValid: boolean = false;
	let maxWithdrawWei: bigint | null = null;
	let amountWithdrawWei: bigint | null = null;
	let refundData: Record<string, string> | null = null;
	let processing: boolean = false;
	let selectedDeposit: any = null;
	let selectedDepositIndex: number = -1;
	let deposits: any[] = [];
	let showFeeModal = false;

	// Load confirmed operations
	onMount(() => {
		wrapWithToast(
			async () => {
				const res = await privacy.getConfirmedOperations();
				deposits = res.operations;
			},
			{ error: 'Failed to load your deposits' }
		);
	});

	async function generateRefund(amount: string, tokenAddress: string) {
		if (!amount || !tokenAddress) {
			throw new Error('Please enter amount & token address');
		}
		return privacy.generateOperation({
			amount,
			tokenAddress,
			type: 'deposit'
		});
	}

	async function confirmOperationExternally(id: number) {
		return privacy.confirmOperation(id);
	}
	async function abortOperationExternally(id: number) {
		return privacy.abortOperation(id);
	}
	async function nullifyOperationExternally(id: number) {
		return privacy.nullifyOperation(id);
	}

	$: selectedDeposit = deposits.find((d) => d.index === selectedDepositIndex);

	$: areInputsValid = !!(recipient && amount);

	async function withdrawHandler() {
		processing = true;

		await wrapWithToast(
			async () => {
				// fetch decimals
				const decRes = await privacy.getTokenDecimals(tokenAddress);
				const decimals =
					decRes.data?.decimals ??
					(() => {
						throw new Error(decRes.error ?? 'No decimals');
					})();

				// get commitment + amount
				commitmentAmount = selectedDeposit.metadata.amount.toString();
				const { bigIntValue: commitmentWei } = sanitizeAmount(commitmentAmount, decimals);
				const { bigIntValue: withdrawWei } = sanitizeAmount(amount, decimals);
				amountWithdrawWei = withdrawWei;
				if (commitmentWei <= 0n || withdrawWei <= 0n) throw new Error('Invalid amount');

				// token name
				const nameRes = await privacy.getTokenName(tokenAddress);
				tokenName =
					nameRes.data?.name ??
					(() => {
						throw new Error(nameRes.error || 'No name');
					})();

				// get fee
				const feeRes = await privacy.getFeeData(
					JSON.stringify({ txn_type: 'Withdraw', token_name: tokenName })
				);
				const feeData =
					feeRes.data ??
					(() => {
						throw new Error(feeRes.error || 'No fee');
					})();
				const { bigIntValue: gasFee } = sanitizeAmount(feeData.gas_fee.toString(), decimals);
				const { bigIntValue: paymasterFee } = sanitizeAmount(
					feeData.paymaster_fee.toString(),
					decimals
				);
				const overallFee = gasFee + paymasterFee;

				// calculate max withdraw
				maxWithdrawWei = commitmentWei - overallFee;
				withdrawFee = (Number(overallFee) / 10 ** decimals).toString();
				maxWithdraw = (Number(maxWithdrawWei) / 10 ** decimals).toString();
				if (maxWithdrawWei < 0n)
					throw new Error(`Insufficient funds (fee ${withdrawFee} ${tokenName})`);

				// confirm withdrawal
				showFeeModal = true;
				const accepted = await new Promise<boolean>((r) => (onFeeAccepted = r));
				if (!accepted) {
					throw new Error('User rejected withdrawal');
				}

				// build refund
				const refundAmount = commitmentWei - withdrawWei - paymasterFee - gasFee;
				const { hash: h1 } = await privacy.poseidonHash({
					a: BigInt(selectedDeposit.hash),
					b: commitmentWei
				});
				const { hash: leaf } = await privacy.poseidonHash({ a: h1, b: BigInt(tokenAddress) });

				const proofRes = await privacy.getProofData(
					JSON.stringify({ commitment: `0x${BigInt(leaf).toString(16)}` })
				);
				proofData =
					proofRes.data ??
					(() => {
						throw new Error(proofRes.error || 'No proof');
					})();

				if (refundAmount < 0n) throw new Error('Withdrawal amount too large');

				// generate refund commitment
				const refundResp = await generateRefund(
					(Number(refundAmount) / 10 ** decimals).toString(),
					tokenAddress
				);
				if (!refundResp) {
					throw new Error('Failed to generate refund operation');
				}
				if (!refundResp.id) {
					throw new Error('Refund ID missing');
				}
				refund = { id: refundResp.id, decimals };

				// build witness + proof
				const witnessInput = {
					root_1: proofData.root,
					deposits_id: [selectedDepositIndex],
					refunds_id: [refund],
					commitment_amount_1: `0x${commitmentWei.toString(16)}`,
					token_address_1: tokenAddress,
					hashpath_1: proofData.hash_path,
					index_1: `0x${BigInt(proofData.index).toString(16)}`,
					amount: `0x${withdrawWei.toString(16)}`,
					gas_fee: `0x${gasFee.toString(16)}`,
					paymaster_fee: `0x${paymasterFee.toString(16)}`,
					_recipient: recipient
				};

				const { error, proof } = await privacy.generateProof({
					circuit: {
						name: 'withdraw',
						jsonUrl:
							'https://raw.githubusercontent.com/Uacias/circuits-playground/main/withdraw/target/withdraw.json',
						vkUrl:
							'https://raw.githubusercontent.com/Uacias/circuits-playground/main/withdraw/target/vk_withdraw.bin'
					},
					witnessInput
				});
				if (error) throw new Error(error);

				// execute on‑chain
				const execRes = await privacy.exetuceTransacion(
					JSON.stringify({
						selector: 'withdraw',
						calldata: proof,
						token_address: tokenAddress,
						expected_gas_fee: gasFee.toString(),
						expected_paymaster_fee: paymasterFee.toString(),
						txn_type: TxnType.Withdraw
					})
				);
				if (execRes.error) throw new Error(execRes.error);
				transactionHash = execRes.hash!;

				// finalize
				await confirmOperationExternally(refund.id);
				await nullifyOperationExternally(selectedDeposit.id);
				selectedDepositIndex = -1;
				recipient = amount = '';
			},
			{
				success: 'Withdrawal complete!',
				error: (e) => `Withdrawal failed: ${e instanceof Error ? e.message : String(e)}`,
				onError: async (err) => {
					console.error('Withdraw failed, aborting refund op:', err);
					if (refund && refund.id) {
						await abortOperationExternally(refund.id);
					}
				}
			}
		);

		processing = false;
	}
</script>

<PageContentContainer title="Withdraw">
	{#if deposits.length > 0}
		<h2 class="mt-6 text-xl font-bold">Select Deposit:</h2>
		<div class="mt-2 max-h-64 overflow-y-auto rounded-md border bg-gray-900 p-2">
			{#each deposits as deposit, index}
				{#if deposit.metadata.amount != 0}
					<label class="mt-2 block flex items-center">
						<input
							type="radio"
							name="deposit"
							value={deposit.index}
							bind:group={selectedDepositIndex}
							class="mr-2"
						/>
						<div class="flex w-full items-center rounded-md border bg-gray-800 p-2">
							<div class="mr-4">
								<p class="text-sm text-gray-400">Id: {deposit.index}</p>
								<p class="text-sm text-gray-400">Amount: {deposit.metadata.amount}</p>
								<p class="text-sm text-gray-400">Token Address: {deposit.metadata.tokenAddress}</p>
							</div>
						</div>
					</label>
				{/if}
			{/each}
		</div>
	{/if}

	{#if selectedDeposit}
		<p class="mt-2">Selected Deposit Index: {selectedDepositIndex}</p>
		<p class="mt-2">Amount: {selectedDeposit.metadata.amount}</p>
		<p class="mt-2">Token Address: {selectedDeposit.metadata.tokenAddress}</p>
	{/if}
	<InputField type="text" bind:value={recipient} placeholder="Recipient" customClass="mt-4" />
	<InputField
		type="text"
		bind:value={amount}
		onInput={(e) => validateAmountInput(e, (val) => (amount = val))}
		placeholder="Amount"
		customClass="mt-4"
	/>
	<ActionButton
		onClick={withdrawHandler}
		disabled={selectedDepositIndex === -1 || processing || !areInputsValid}
		customClass="mt-4">{processing ? 'Processing...' : 'Withdraw'}</ActionButton
	>
	{#if showFeeModal}
		<div class="bg-opacity-50 fixed inset-0 flex items-center justify-center bg-black">
			<div class="rounded-lg bg-white p-6 text-black shadow-lg">
				<h2 class="text-lg font-bold">Confirm Withdraw Fee</h2>
				<p class="mt-2">Withdraw Fee: {withdrawFee} {tokenName}</p>
				<p class="mt-2">Max withdrawal amount: {maxWithdraw}</p>
				<div class="mt-4 flex justify-end">
					<button
						on:click={() => {
							showFeeModal = false;
							onFeeAccepted?.(true);
						}}
						class="mr-2 rounded-lg bg-blue-500 px-4 py-2 text-white"
					>
						Accept
					</button>
					<button
						on:click={() => {
							amountWithdrawWei = maxWithdrawWei;
							showFeeModal = false;
							onFeeAccepted?.(true);
						}}
						class="rounded-lg bg-green-500 px-4 py-2 text-white"
					>
						Accept with Max Amount
					</button>
					<button
						on:click={() => {
							showFeeModal = false;
							onFeeAccepted?.(false);
						}}
						class="ml-4 rounded-lg bg-gray-400 px-4 py-2"
					>
						Reject
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if refundData}
		<h2 class="mt-6 text-xl font-bold">Refund Data:</h2>
		<pre
			class="bg-card mt-4 w-full max-w-xl overflow-x-auto rounded-2xl border border-gray-700 p-4 text-sm shadow-lg">
			{JSON.stringify(refundData, null, 2)}
	  </pre>

		<JsonAction data={refundData} filePrefix={transactionHash} />
	{/if}
</PageContentContainer>
