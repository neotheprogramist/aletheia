<script lang="ts">
	import { get } from 'svelte/store';
	import { tokens } from '$lib/stores/tokens';
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

	let tokenAddress = '';
	let amount = '';
	let isLoading = false;

	// Select first as chosen one
	$: {
		if (!tokenAddress && $tokens.length > 0) {
			tokenAddress = $tokens[0].address;
		}
	}

	function createCalls(hash: string, amountWei: bigint) {
		const secretAndNullifierHash = BigInt(hash);
		const [amountLow, amountHigh] = toLowHigh(amountWei);
		const [hashLow, hashHigh] = toLowHigh(secretAndNullifierHash);

		return [
			{
				contract_address: tokenAddress,
				entry_point: 'approve',
				calldata: [PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS, amountLow, amountHigh]
			},
			{
				contract_address: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				entry_point: 'deposit',
				calldata: [hashLow, hashHigh, amountLow, amountHigh, tokenAddress]
			}
		];
	}

	async function depositHandler() {
		isLoading = true;
		let operationHash = '';

		await wrapWithToast(
			async () => {
				const decimals = await fetchTokenDecimals(tokenAddress);
				const amountWei = toWei(amount, decimals);
				const { hash } = await generateOperation({ data: { tokenAddress, amount: amountWei } });
				operationHash = hash;

				const calls = createCalls(hash, amountWei);

				const connectedWallet = get(wallet);
				if (!connectedWallet) throw new Error('Please connect your wallet.');

				await connectedWallet.request({
					type: 'wallet_addInvokeTransaction',
					params: { calls }
				});

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
	<div class="mx-auto max-w-md p-6">
		<Card title="Deposit">
			<form on:submit|preventDefault={depositHandler} class="flex flex-col gap-4">
				<TokenSelect
					tokens={$tokens}
					bind:value={tokenAddress}
					placeholder="Select token"
					class_="w-full"
				/>

				<Input placeholder="Amount" bind:value={amount} required class_="w-full" />
				<Button text="Deposit" loading={isLoading} type="submit" class_="mt-2 w-full" />
			</form>
		</Card>
	</div>
</ProtectedRoute>
