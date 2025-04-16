<script lang="ts">
	import { onMount } from 'svelte';
	let deposits: any[] = [];

	onMount(async () => {
		try {
			const res = await privacy.getConfirmedOperations();

			deposits = res.operations;
		} catch (err) {
			console.error('❌ Privacy API error:', err);
		}
	});

	import { PUBLIC_STRK_TOKEN_ADDRESS } from '$env/static/public';

	let showFeeModal = false;
	let withdrawFee: string | null = null;
	let tokenName: string = '';
	let onFeeAccepted: ((accepted: boolean) => void) | null = null;
	let maxWithdraw: string = '';
	let selectedDepositIndex: number = -1;
	let refund: any = null;
	let proofData: any = null;

	import ActionButton from '../../components/ActionButton.svelte';
	import InputField from '../../components/InputField.svelte';

	import PageContentContainer from '../../components/PageContentContainer.svelte';
	import ErrorAlert from '../../components/ErrorAlert.svelte';
	import { privacy } from 'privacy-provider';
	import { sanitizeAmount, validateAmountInput } from '$lib/utils/sanitize';
	import { TxnType } from '$lib/types/api';
	import JsonAction from '../../components/JsonAction.svelte';

	async function generateRefund(amount: string, tokenAddress: string) {
		if (!amount || !tokenAddress) {
			alert('Please enter amount and token address');
			return;
		}

		try {
			return await privacy.generateOperation({
				amount,
				tokenAddress,
				type: 'deposit'
			});
		} catch (err) {
			console.error('❌ Failed to generate operation:', err);
		}
	}

	async function confirmOperationExternally(id: number) {
		try {
			await privacy.confirmOperation(id);
		} catch (err) {
			console.error('❌ Confirm failed:', err);
		}
	}

	async function abortOperationExternally(id: number) {
		try {
			await privacy.abortOperation(id);
		} catch (err) {
			console.error('❌ Abort failed:', err);
		}
	}

	async function nullifyOperationExternally(id: number) {
		try {
			await privacy.nullifyOperation(id);
		} catch (err) {
			console.error('❌ Nullify failed:', err);
		}
	}

	let transactionHash: string = '';
	let depositDataJson: string = '';
	let jsonError: boolean = false;
	let secret: string = '';
	let commitmentAmount: string = '';
	let recipient: string = '';
	let amount: string = '';
	let tokenAddress: string = PUBLIC_STRK_TOKEN_ADDRESS;
	let areInputsValid: boolean = false;
	let maxWithdrawWei: bigint | null = null;
	let amountWithdrawWei: bigint | null = null;

	let refundData: Record<string, string> | null = null;
	let processing: boolean = false;
	let errorMessage: string = '';
	let selectedDeposit: any = null;
	$: {
		if (depositDataJson.trim()) {
			try {
				const parsed = JSON.parse(depositDataJson);
				if (parsed.secret && parsed.tokenAddress && parsed.amount) {
					secret = parsed.secret;
					tokenAddress = parsed.tokenAddress;
					commitmentAmount = parsed.amount.toString();
					jsonError = false;
				} else {
					secret = '';
					commitmentAmount = '';
					jsonError = true;
				}
			} catch (err) {
				secret = '';
				commitmentAmount = '';
				jsonError = true;
			}
		} else {
			secret = '';
			commitmentAmount = '';
			jsonError = false;
		}
	}

	$: selectedDeposit = deposits.find((d) => d.index === selectedDepositIndex);

	$: areInputsValid = !!(recipient && amount);

	async function withdrawHandler() {
		processing = true;
		errorMessage = '';

		try {
			const decimalsResponse = await privacy.getTokenDecimals(tokenAddress);

			let decimals: any = null;
			if (decimalsResponse?.error) {
				throw new Error(decimalsResponse.error);
			} else if (decimalsResponse?.data) {
				decimals = decimalsResponse.data.decimals;
			} else {
				throw new Error('⚠️ Unknown response from get decimals.');
			}

			if (decimals === undefined || decimals === null) {
				throw new Error('Failed to fetch token decimals.');
			}
			commitmentAmount = selectedDeposit.metadata.amount.toString();
			const { displayValue: dispCommitment, bigIntValue: commitmentAmountWeiGaraga } =
				sanitizeAmount(commitmentAmount, decimals);
			const { displayValue: dispAmount, bigIntValue: amountWeiGaraga } = sanitizeAmount(
				amount,
				decimals
			);

			amountWithdrawWei = amountWeiGaraga;

			if (commitmentAmountWeiGaraga <= 0n) {
				throw new Error('Invalid commitment amount');
			}
			if (amountWeiGaraga <= 0n) {
				throw new Error('Invalid amount');
			}

			const tokenNameResponse = await privacy.getTokenName(tokenAddress);
			let tokenNameData: string = '';

			if (tokenNameResponse?.error) {
				throw new Error(tokenNameResponse.error);
			} else if (tokenNameResponse?.data) {
				tokenNameData = tokenNameResponse.data.name;
			} else {
				throw new Error('⚠️ Unknown response from get token name.');
			}

			let bodyGetFee = JSON.stringify({ txn_type: 'Withdraw', token_name: tokenNameData });

			const withdrawFeeResponse = await privacy.getFeeData(bodyGetFee);

			let withdrawFeeData: any = null;

			if (withdrawFeeResponse?.error) {
				throw new Error(withdrawFeeResponse.error);
			} else if (withdrawFeeResponse?.data) {
				withdrawFeeData = withdrawFeeResponse.data;
			} else {
				throw new Error('⚠️ Unknown response from get fee data.');
			}

			const { displayValue: dispGasFee, bigIntValue: amountWeiGasFee } = sanitizeAmount(
				withdrawFeeData.gas_fee.toString(),
				decimals
			);

			const { displayValue: dispPaymasterFee, bigIntValue: amountWeiPaymasterFee } = sanitizeAmount(
				withdrawFeeData.paymaster_fee.toString(),
				decimals
			);

			const overallFee = amountWeiPaymasterFee + amountWeiGasFee;

			maxWithdrawWei = commitmentAmountWeiGaraga - overallFee;

			maxWithdraw = (Number(commitmentAmountWeiGaraga - overallFee) / 10 ** decimals).toString();

			withdrawFee = (Number(overallFee) / 10 ** decimals).toString();

			tokenName = tokenNameData;

			if (maxWithdrawWei < 0n) {
				throw new Error(
					'Not enough funds to withdraw, withdraw fee: ' + withdrawFee + ' ' + tokenName
				);
			}
			showFeeModal = true;
			const userAccepted = await new Promise<boolean>((resolve) => {
				onFeeAccepted = resolve;
			});

			if (!userAccepted) {
				selectedDeposit = null;
				selectedDepositIndex = -1;
				recipient = '';
				amount = '';
				areInputsValid = false;
				processing = false;
				return;
			}

			const refundGaraga =
				commitmentAmountWeiGaraga - amountWithdrawWei - amountWeiPaymasterFee - amountWeiGasFee;

			const secretAndNullifierHash = selectedDeposit.hash;

			const { hash: intermediateHashGaraga } = await privacy.poseidonHash({
				a: BigInt(secretAndNullifierHash),
				b: commitmentAmountWeiGaraga
			});
			const { hash: commitmentGaraga } = await privacy.poseidonHash({
				a: intermediateHashGaraga,
				b: BigInt(tokenAddress)
			});

			const commitmentAmountWeiGaragaHex = `0x${commitmentAmountWeiGaraga.toString(16)}`;
			const commitmentGaragaHex = `0x${BigInt(commitmentGaraga).toString(16)}`;

			const getProofBody = JSON.stringify({ commitment: commitmentGaragaHex });

			const getProofDataResponse = await privacy.getProofData(getProofBody);

			if (getProofDataResponse?.error) {
				throw new Error(getProofDataResponse.error);
			} else if (getProofDataResponse?.data) {
				proofData = getProofDataResponse.data;
			} else {
				throw new Error('⚠️ Unknown response from get proof data.');
			}

			if (refundGaraga < 0) {
				throw new Error(
					'Withdrawal amount too large - max withdrawal amount: ' + maxWithdraw + tokenName
				);
			}

			const amountWeiGaragaHex = `0x${amountWithdrawWei.toString(16)}`;
			const amountGasFeeHex = `0x${amountWeiGasFee.toString(16)}`;
			const amountPaymasterFeeHex = `0x${amountWeiPaymasterFee.toString(16)}`;

			const refundResponse = await generateRefund(
				(Number(refundGaraga) / 10 ** decimals).toString(),
				tokenAddress
			);
			if (!refundResponse?.id) {
				throw new Error('Refund ID not returned');
			}
			refund = { id: refundResponse.id, decimals: decimals };

			const dataToGenerateWitness: any = {
				root_1: proofData.root,
				deposits_id: [selectedDepositIndex],
				refunds_id: [refund],
				commitment_amount_1: commitmentAmountWeiGaragaHex,
				token_address_1: tokenAddress,
				hashpath_1: proofData.hash_path,
				index_1: `0x${BigInt(proofData.index).toString(16)}`,
				amount: amountWeiGaragaHex,
				gas_fee: amountGasFeeHex,
				paymaster_fee: amountPaymasterFeeHex,
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
				witnessInput: dataToGenerateWitness
			});

			if (error) {
				throw new Error(error);
			}

			const honkCalldataHex = proof;

			const body = JSON.stringify({
				selector: 'withdraw',
				calldata: honkCalldataHex,
				token_address: tokenAddress,
				expected_gas_fee: amountWeiGasFee.toString(),
				expected_paymaster_fee: amountWeiPaymasterFee.toString(),
				txn_type: TxnType.Withdraw
			});

			const executeTransactionResponse = await privacy.exetuceTransacion(body);
			if (executeTransactionResponse?.error) {
				throw new Error(executeTransactionResponse.error);
			} else if (executeTransactionResponse?.hash) {
				transactionHash = executeTransactionResponse.hash;
			} else {
				throw new Error('⚠️ Unknown response from transaction.');
			}

			await confirmOperationExternally(refund.id);
			await nullifyOperationExternally(selectedDeposit.id);

			selectedDepositIndex = -1;
			recipient = '';
			amount = '';
			proofData = null;
			areInputsValid = false;
			alert('SUCCESS!');
		} catch (error) {
			console.error(error);
			if (error instanceof Error) {
				errorMessage = error.message;
				if (refund && refund.id) {
					await abortOperationExternally(refund.id);
				}
			} else {
				errorMessage = 'Unknown error while withdrawing.';
			}
		}

		processing = false;
	}
</script>

<PageContentContainer title="Withdraw">
	{#if errorMessage}
		<ErrorAlert message={errorMessage} />
	{/if}
	{#if jsonError}
		<p class="mt-2 text-red-500">Invalid JSON format</p>
	{/if}

	{#if deposits.length > 0}
		<h2 class="mt-6 text-xl font-bold tracking-wide uppercase">Select Deposit:</h2>
		<div class="mt-2 max-h-64 overflow-y-auto rounded-md border bg-gray-900 p-2">
			{#each deposits as deposit, index}
				{#if deposit.metadata.amount != 0}
					<label class="mt-2 block flex items-center">
						<input
							type="radio"
							name="deposit"
							value={deposit.index}
							bind:group={selectedDepositIndex}
							class="mr-2 h-4 w-4 text-blue-600 accent-blue-500"
						/>
						<div
							class="bg-card flex w-full items-center rounded-md border border-gray-700 p-2 shadow-sm"
						>
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
			<div class="bg-card rounded-lg border border-gray-700 p-6 text-white shadow-2xl">
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
