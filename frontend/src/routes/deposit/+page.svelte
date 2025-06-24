<script lang="ts">
	import { get } from 'svelte/store';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import { wallet } from '$lib/stores/wallet';
	import { wrapWithToast } from '$lib/utils/toast';
	import { PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS } from '$env/static/public';

	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';

	import { toLowHigh } from '$lib/utils/toLowHigh';
	import { toWei } from '$lib/utils/toWei';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { confirmOperation } from '$lib/privacy/confirmOperation';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { provider } from '$lib/stores/provider';

	let amount = '';
	let isLoading = false;

	function createCalls(hash: string, amountWei: bigint) {
		const secretAndNullifierHash = BigInt(hash);
		const [amountLow, amountHigh] = toLowHigh(amountWei);
		const [hashLow, hashHigh] = toLowHigh(secretAndNullifierHash);

		return [
			{
				contract_address: $selectedToken,
				entry_point: 'approve',
				calldata: [PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS, amountLow, amountHigh]
			},
			{
				contract_address: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				entry_point: 'deposit',
				calldata: [hashLow, hashHigh, amountLow, amountHigh, $selectedToken]
			}
		];
	}

	async function depositHandler() {
		isLoading = true;
		let operationHash = '';

		await wrapWithToast(
			async () => {
				const decimals = await fetchTokenDecimals($selectedToken);
				const amountWei = toWei(amount, decimals);
				const { hash } = await generateOperation({
					data: { tokenAddress: $selectedToken, amount: amountWei }
				});
				operationHash = hash;

				const calls = createCalls(hash, amountWei);

				const connectedWallet = get(wallet);
				if (!connectedWallet) throw new Error('Please connect your wallet.');

				const {transaction_hash} = await connectedWallet.request({
					type: 'wallet_addInvokeTransaction',
					params: { calls }
				});

				console.log(transaction_hash);

				const rpc = get(provider);
				if (!rpc) throw new Error('Missing Provider');

				const receipt = await rpc.waitForTransaction(BigInt(transaction_hash));

				if (receipt.isReverted()) {
					throw new Error('Transaction reverted: ${receipt.value}');
				} else if (!receipt.isSuccess()) {
					throw new Error('Transaction error: ${receipt.value}');
				}

				await confirmOperation(hash);
				amount = '';
			},
			{
				loading: '⏳ Running deposit',
				success: '✅ Deposit complete!',
				error: '❌ Deposit failed'
			},
			async (err) => {
				console.warn('❌ Deposit failed with error:', err);
				if (operationHash) {
					try {
						await abortOperation(operationHash);
						console.warn('🧯 Aborted failed operation:', operationHash);
					} catch (abortError) {
						console.error('🚨 Failed to abort operation:', abortError);
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
			<form on:submit|preventDefault={depositHandler} class="flex flex-col gap-4">
				<TokenSelect
					tokens={$tokens}
					bind:value={$selectedToken}
					placeholder="Select token"
					class_="w-full"
				/>

				<Input placeholder="Amount" bind:value={amount} required class_="w-full" />
				<Button text="Deposit" loading={isLoading} type="submit" class_="mt-2 w-full" />
			</form>
		</Card>
	</div>
</ProtectedRoute>
