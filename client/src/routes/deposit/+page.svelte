<script lang="ts">
	import PageContentContainer from '../../components/PageContentContainer.svelte';
	import ActionButton from '../../components/ActionButton.svelte';
	import InputField from '../../components/InputField.svelte';
	import { PUBLIC_TORNADO_CONTRACT_ADDRESS, PUBLIC_STRK_TOKEN_ADDRESS } from '$env/static/public';
	import { computeLowHighBits } from '$lib/utils/conversions';
	import { get } from 'svelte/store';
	import { wallet } from '$lib/stores/wallet';
	import { sanitizeAmount, validateAmountInput } from '$lib/utils/sanitize';
	import { privacy } from 'privacy-provider';
	import { fetchTokenDecimals } from '$lib/utils/token';
	import { wrapWithToast } from '$lib/utils/wrapWithToast';
	import type { GeneratedOperation } from '$lib/types/api';

	let tokenAddress: string = PUBLIC_STRK_TOKEN_ADDRESS;
	let amount = '';
	let processing = false;
	let generated: GeneratedOperation | null = null;

	async function generateOperation() {
		await wrapWithToast(
			async () => {
				if (!amount || !tokenAddress) {
					throw new Error('Please enter amount and token address');
				}

				generated = await privacy.generateOperation({
					amount,
					tokenAddress,
					type: 'deposit'
				});

				if (!generated) {
					throw new Error('Failed to generate operation');
				}

				await handleDeposit();
			},
			{ error: (err) => 'Failed to generate operation:' + err }
		);
	}

	async function confirmOperationExternally(id: number) {
		await wrapWithToast(
			async () => {
				await privacy.confirmOperation(id);
			},
			{ error: (err) => 'Failed to confirm operation:' + err }
		);
	}

	async function abortOperationExternally(id: number) {
		await wrapWithToast(
			async () => {
				await privacy.abortOperation(id);
			},
			{ error: (err) => 'Failed to abort operation:' + err }
		);
	}

	async function handleDeposit() {
		processing = true;

		await wrapWithToast(
			async () => {
				if (!tokenAddress || !amount) throw new Error('Missing input');

				const decimals = await fetchTokenDecimals(tokenAddress);
				if (decimals == null) throw new Error('Could not fetch token decimals');

				const { bigIntValue } = sanitizeAmount(amount, decimals);
				if (bigIntValue <= 0n) throw new Error('Invalid amount');

				if (!generated) throw new Error('Generated operation is null');

				const secretAndNullifierHash = BigInt(generated.hash);
				const [amountLow, amountHigh] = computeLowHighBits(bigIntValue);
				const [secretLow, secretHigh] = computeLowHighBits(secretAndNullifierHash);
				const connectedWallet = get(wallet);
				if (!connectedWallet) throw new Error('Wallet not connected');

				const calls = [
					{
						contract_address: tokenAddress,
						entry_point: 'approve',
						calldata: [PUBLIC_TORNADO_CONTRACT_ADDRESS, amountLow, amountHigh]
					},
					{
						contract_address: PUBLIC_TORNADO_CONTRACT_ADDRESS,
						entry_point: 'deposit',
						calldata: [secretLow, secretHigh, amountLow, amountHigh, tokenAddress]
					}
				];

				await connectedWallet.request({
					type: 'wallet_addInvokeTransaction',
					params: { calls }
				});

				await confirmOperationExternally(generated.id);
				amount = '';
			},
			{
				success: 'Deposit completed',
				error: (e) => `Deposit failed: ${e instanceof Error ? e.message : String(e)}`,
				onError: () => {
					if (!generated) throw new Error('Generated operation is null');
					abortOperationExternally(generated.id);
				}
			}
		);

		processing = false;
	}
</script>

`<PageContentContainer title="Deposit">
	<InputField bind:value={tokenAddress} placeholder="Enter Token Address" />
	<InputField
		bind:value={amount}
		onInput={(e) => validateAmountInput(e, (val) => (amount = val))}
		placeholder="Enter Amount"
	/>

	<ActionButton
		onClick={generateOperation}
		disabled={!tokenAddress || !amount || processing}
		customClass="mt-4">{processing ? 'Processing...' : 'Deposit'}</ActionButton
	>
</PageContentContainer>
